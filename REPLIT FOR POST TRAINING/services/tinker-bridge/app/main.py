"""Post Trainer's Tinker bridge.

A small local service that is the *only* thing in this project allowed to
import Tinker's SDK or hold a TINKER_API_KEY / write-scoped Hugging Face
token. The Next.js app never talks to Tinker directly — it proxies through
this service's HTTP contract (see ../README.md), the same "keep the real
backend behind one boundary" pattern used for Hugging Face search in
app/api/models/route.ts on the Next.js side.

Run with: uvicorn app.main:app --port 8000 --reload
"""

from __future__ import annotations

import os
import ssl

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

load_dotenv()  # picks up TINKER_API_KEY / HUGGINGFACE_WRITE_TOKEN from services/tinker-bridge/.env


def _ensure_ssl_certificates() -> None:
    """Point Python's stdlib SSL at certifi's CA bundle when the system has none.

    macOS python.org builds ship without CA certificates unless the bundled
    "Install Certificates.command" has been run. Libraries that vendor certifi
    (httpx, requests — so the whole Tinker SDK and training path) work anyway,
    which makes this failure genuinely confusing: training succeeds, then
    `weights.download` fails at the very end because it uses plain urllib,
    which falls back to the missing system store.

    That is a real run's money already spent, so fix it at startup rather than
    discovering it after training. Respects an existing SSL_CERT_FILE.
    """
    if os.environ.get("SSL_CERT_FILE") or ssl.get_default_verify_paths().cafile:
        return
    try:
        import certifi
    except ImportError:
        return
    os.environ["SSL_CERT_FILE"] = certifi.where()


_ensure_ssl_certificates()

from fastapi import Request  # noqa: E402

from . import jobs, tinker_runner  # noqa: E402 - must import after load_dotenv()
from .dataset import DatasetValidationError  # noqa: E402
from .schemas import JobStatus  # noqa: E402

app = FastAPI(title="Post Trainer — Tinker bridge")

# Datasets arrive as a raw request body rather than JSON so they can be written
# straight to disk in chunks. A vertical-scale dataset is hundreds of megabytes;
# parsing one as a JSON string would hold the whole thing in memory here, and in
# the Next.js proxy, and in the browser before that.
UPLOAD_CHUNK_BYTES = 1024 * 1024


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True, "configured": tinker_runner.is_configured()}


@app.post("/jobs", status_code=201)
async def create_job(request: Request, baseModelId: str, fileName: str = "dataset.jsonl") -> dict[str, str]:
    # Must be `async def`: jobs.create_job() calls asyncio.create_task(),
    # which needs a running event loop. FastAPI runs plain `def` handlers in
    # a threadpool (no event loop present); `async def` handlers run
    # directly on the loop, so the task attaches correctly.
    if not tinker_runner.is_configured():
        raise HTTPException(
            status_code=501,
            detail=(
                "Tinker isn't configured on this server. Set TINKER_API_KEY and "
                "HUGGINGFACE_WRITE_TOKEN to enable live training runs."
            ),
        )

    upload_path = tinker_runner.new_upload_path(fileName)
    received = 0
    try:
        with upload_path.open("wb") as f:
            async for chunk in request.stream():
                f.write(chunk)
                received += len(chunk)
    except Exception as exc:  # noqa: BLE001 - a broken upload shouldn't leave a half job
        upload_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Upload failed: {exc}") from exc

    if received == 0:
        upload_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail="Dataset is empty.")

    try:
        job_id = jobs.create_job(base_model_id=baseModelId, upload_path=upload_path)
    except jobs.NotConfiguredError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except DatasetValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"id": job_id}


@app.get("/jobs/{job_id}", response_model=JobStatus)
def get_job(job_id: str) -> JobStatus:
    status = jobs.get_job(job_id)
    if status is None:
        raise HTTPException(status_code=404, detail="No job with that id.")
    return status


@app.post("/jobs/{job_id}/publish", status_code=202)
async def retry_publish(job_id: str) -> dict[str, str]:
    """Republishes a checkpoint whose training already succeeded.

    Must be `async def` — jobs.retry_publish() schedules an asyncio task and
    needs a running event loop (a plain `def` handler runs in a threadpool
    where there isn't one).
    """
    if not jobs.retry_publish(job_id):
        raise HTTPException(
            status_code=409,
            detail="Nothing to republish for this job — there is no finished checkpoint.",
        )
    return {"id": job_id}


@app.delete("/jobs/{job_id}", status_code=204)
def cancel_job(job_id: str) -> None:
    if not jobs.cancel_job(job_id):
        raise HTTPException(status_code=404, detail="No job with that id.")


@app.exception_handler(Exception)
def unhandled_exception_handler(_request, exc: Exception) -> JSONResponse:
    # Last-resort safety net so a bug here always returns clean JSON the
    # Next.js proxy route can parse, never an opaque 500 HTML page.
    return JSONResponse(status_code=500, content={"detail": str(exc) or exc.__class__.__name__})
