"""In-memory job store and orchestration.

This is a single-process, single-user local bridge (no database, no queue —
consistent with the rest of Post Trainer's "don't over-engineer v0"
approach). Jobs disappear on restart; that's fine for now.
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from . import tinker_runner
from .dataset import DatasetValidationError, prepare_dataset
from .schemas import JobResult, JobStatus, Stage, Status


class NotConfiguredError(RuntimeError):
    """Raised when TINKER_API_KEY / HUGGINGFACE_WRITE_TOKEN aren't set."""


@dataclass
class _JobState:
    id: str
    status: Status = "running"
    stage: Stage = "preparing_data"
    progress: int = 0
    message: str | None = None
    result: JobResult | None = None
    error: str | None = None
    task: asyncio.Task | None = field(default=None, repr=False)

    def to_schema(self) -> JobStatus:
        return JobStatus(
            id=self.id,
            status=self.status,
            stage=self.stage,
            progress=self.progress,
            message=self.message,
            result=self.result,
            error=self.error,
            canRetryPublish=can_retry_publish(self.id),
        )


_jobs: dict[str, _JobState] = {}


def create_job(*, base_model_id: str, upload_path: Path) -> str:
    """Validates an uploaded dataset and schedules a real training run.

    Raises `NotConfiguredError` if credentials are missing, or
    `DatasetValidationError` if the dataset isn't usable — both are handled
    by main.py and turned into the appropriate HTTP status before any job
    is created, so callers only ever poll jobs that are actually running.

    Validation happens here, synchronously, rather than inside the run: a
    customer who uploads a malformed 200MB file should be told immediately,
    not watch a progress bar and be told at the end.
    """
    if not tinker_runner.is_configured():
        raise NotConfiguredError(
            "Tinker isn't configured on this server. Set TINKER_API_KEY and "
            "HUGGINGFACE_WRITE_TOKEN to enable live training runs."
        )

    job_id = uuid.uuid4().hex
    run_dir = tinker_runner.run_dir_for(job_id)
    run_dir.mkdir(parents=True, exist_ok=True)

    try:
        prepared = prepare_dataset(upload_path, run_dir / "training-examples.jsonl")
    except DatasetValidationError:
        upload_path.unlink(missing_ok=True)
        raise
    finally:
        # The raw upload has served its purpose either way — the prepared file
        # is what training reads, and keeping both doubles disk for nothing.
        upload_path.unlink(missing_ok=True)

    state = _JobState(id=job_id)
    _jobs[job_id] = state

    async def on_progress(stage: str, progress: int, message: str | None) -> None:
        state.stage = stage  # type: ignore[assignment]
        state.progress = progress
        state.message = message

    async def run() -> None:
        try:
            result = await tinker_runner.run_real_job(
                job_id=job_id,
                base_model_id=base_model_id,
                dataset=prepared,
                on_progress=on_progress,
            )
            state.status = "complete"
            state.stage = "finalizing"
            state.progress = 100
            state.result = result
        except asyncio.CancelledError:
            state.status = "error"
            state.error = "Cancelled."
        except Exception as exc:  # noqa: BLE001 - surface any failure to the UI, not just expected ones
            state.status = "error"
            state.error = str(exc) or exc.__class__.__name__

    state.task = asyncio.create_task(run())
    return job_id


def get_job(job_id: str) -> JobStatus | None:
    state = _jobs.get(job_id)
    return state.to_schema() if state else None


def can_retry_publish(job_id: str) -> bool:
    """True when training for this job already finished and was paid for, so
    the only thing left to redo is the (free) publish."""
    state = _jobs.get(job_id)
    if state is None or state.status != "error":
        return False
    return tinker_runner.read_remembered_checkpoint(job_id) is not None


def retry_publish(job_id: str) -> bool:
    """Republishes an already-trained checkpoint.

    This exists because the obvious alternative — "just run it again" —
    silently re-trains and charges a second time for work already done.
    That is the single most expensive mistake this tool could make, so the
    retry path deliberately never touches training.
    """
    state = _jobs.get(job_id)
    if state is None:
        return False

    remembered = tinker_runner.read_remembered_checkpoint(job_id)
    if remembered is None:
        return False
    sampler_path, base_model_id = remembered

    state.status = "running"
    state.stage = "finalizing"
    state.progress = 88
    state.message = "Retrying publish"
    state.error = None

    async def on_progress(stage: str, progress: int, message: str | None) -> None:
        state.stage = stage  # type: ignore[assignment]
        state.progress = progress
        state.message = message

    async def run() -> None:
        try:
            result = await tinker_runner._publish_checkpoint(
                sampler_path=sampler_path,
                base_model_id=base_model_id,
                job_id=job_id,
                run_dir=tinker_runner.run_dir_for(job_id),
                on_progress=on_progress,
            )
            state.status = "complete"
            state.progress = 100
            state.result = result
        except asyncio.CancelledError:
            state.status = "error"
            state.error = "Cancelled."
        except Exception as exc:  # noqa: BLE001
            state.status = "error"
            state.error = str(exc) or exc.__class__.__name__

    state.task = asyncio.create_task(run())
    return True


def cancel_job(job_id: str) -> bool:
    """Stops us from waiting on and reporting the job further. Does NOT
    guarantee the underlying Tinker run stops on their side — no cancel
    endpoint for that has been verified against the real API yet."""
    state = _jobs.get(job_id)
    if not state:
        return False
    if state.task and not state.task.done():
        state.task.cancel()
    return True
