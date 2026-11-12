"""Runs a real LoRA fine-tuning job on Tinker and publishes the result to
the caller's Hugging Face account.

Everything Tinker/tinker_cookbook-specific is imported lazily inside the
functions below — importing this module (and starting the bridge server)
never requires `tinker-cookbook` and its multi-GB torch/transformers
dependency chain. Only actually running a real job does.

Every call here is signature-checked against the installed tinker-cookbook
(0.5.4) rather than written from docs. That check caught five real defects
in the first version of this file, all of which would have failed *after*
paying for training: a wrong `publish_to_hf_hub` keyword, a missing
`recipe_name`, an import from the wrong module, a checkpoint directory the
cookbook never creates, and a publish step that skipped the required
download-then-convert conversion entirely.

Verified live against a real Tinker account on 2026-08-20: a 40-example
Qwen3.5-4B run trained through all 10 steps successfully. The publish leg
then failed on an environment issue (see `_ensure_ssl_certificates` in
main.py) — which is exactly why training and publishing are separate
functions and the run directory outlives a failure. The weights survived
and were published without retraining.
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import tempfile
from collections.abc import Awaitable, Callable
from pathlib import Path

from .dataset import PreparedDataset
from .schemas import JobResult

ProgressCallback = Callable[[str, int, str | None], Awaitable[None]]

# Hidden training settings. Post Trainer never exposes these to the user (see
# the product's "no hyperparameters" principle), which makes choosing them well
# our job rather than theirs — a customer can't compensate for a bad default
# they can't see.
#
# The first version of these was tuned for a cheap smoke test and left in place:
# rank 8, one epoch, and a learning rate of 1e-4 for every model. That last one
# was roughly five times *below* Tinker's calibrated recommendation, so every
# run so far has under-learned. Nothing errored; the models were just quietly
# worse than they should have been.

# Adaptation capacity. Rank 8 is enough to nudge a model's style; domain work —
# teaching it a body of law or regulation — wants more room. 32 is the
# conventional middle ground for domain adaptation and costs little extra.
# Judgment call, not a measured optimum.
LORA_RANK = 32

BATCH_SIZE = 4
CHECKPOINT_EVERY_N_STEPS = 20

# Fallback only. `resolve_learning_rate` prefers Tinker's calibrated,
# per-model-family value; this is used for the models it hasn't calibrated.
FALLBACK_LEARNING_RATE = 4.0e-4

# Passes over the data. Small datasets need several to learn anything at all
# (40 examples at batch 4 is ten optimiser steps — barely a nudge); large ones
# need one and risk memorising on more. `resolve_epochs` aims for roughly this
# many total steps.
TARGET_TOTAL_STEPS = 250
MAX_EPOCHS = 4

# How much of a single example the model sees.
#
# There is deliberately no ceiling of our own here: `resolve_sequence_length`
# asks each model what it supports and uses all of it, which ranges from 32,768
# tokens to 262,144 (roughly 196,000 words — a 650-page document).
#
# Two earlier values were both wrong for this product. 2,048 tokens cut examples
# at about 1,500 words, so a superannuation determination or a court ruling was
# trained on its first page and the rest silently discarded. Replacing it with a
# flat 8,192 was better but still arbitrary — it threw away up to 97% of the
# context a model like Qwen3.8 or Nemotron-3-Ultra actually offers.
#
# Longer sequences do cost more, but the customer is charged for the tokens they
# bring either way; truncating doesn't save them money, it just quietly trains on
# less of their material. Cost is surfaced before the run instead (see lib/cost.ts).
#
# Only used when the service can't be asked — every supported model reports its
# own limit, and this is the lowest of them, so it can never over-ask.
FALLBACK_SEQUENCE_LENGTH = 32_768

# The renderer turns chat messages into the exact token format a given model
# family expects. Getting it wrong does NOT raise — training completes and
# publishes a model that was simply taught in the wrong dialect. Silent
# quality damage, so this resolves against Tinker's own table rather than
# any pattern-matching of our own.
#
# An earlier version of this file matched substrings of the repo id by hand.
# It disagreed with the official table on real models — Inkling (generic
# instead of its purpose-built "tml_v0"), Qwen3-8B, Nemotron-3.5-Lightning,
# and base models like Llama-3.2-3B that need "role_colon" precisely because
# they have no chat format. That guesswork is gone; do not reintroduce it.
#
# Overrides below cover only models Tinker's server will train but that the
# installed tinker-cookbook's table doesn't know yet (it ships a fixed table
# and can lag the service). Each needs a comment saying how it was checked.
_RENDERER_OVERRIDES: dict[str, str] = {
    # Verified by comparison, not assumed. Rendering the same conversation
    # through "qwen3_5" for Qwen3.8-27B produces token-identical output to
    # Qwen3.6-27B, which the official table *does* map to "qwen3_5" and
    # which matches its own HF chat template exactly. Same <|im_start|> /
    # <|im_end|> / <think> scaffolding throughout.
    #
    # Known, accepted difference: Qwen3.8's HF template auto-prepends a
    # "Reasoning effort is set to xhigh…" system preamble. That is prompt
    # content, not chat format, and training on our own system messages
    # rather than that default is the intended behaviour.
    "Qwen/Qwen3.8-27B": "qwen3_5",
}

# Last resort. Tinker's own generic "role: content" format — a real renderer,
# not a hack, but lower fidelity than a model-specific one.
_FALLBACK_RENDERER = "role_colon"


def is_configured() -> bool:
    return bool(os.environ.get("TINKER_API_KEY")) and bool(os.environ.get("HUGGINGFACE_WRITE_TOKEN"))


def resolve_renderer_name(base_model_id: str) -> tuple[str, bool]:
    """Returns (renderer_name, is_authoritative).

    `is_authoritative` is False when we fell back to a guess rather than
    reading Tinker's own recommendation — the caller surfaces that instead
    of letting a silently-wrong format reach a paid training run.
    """
    # Imported here, not at module scope, so importing this module still
    # doesn't require tinker-cookbook (see module docstring).
    from tinker_cookbook import model_info

    try:
        return model_info.get_recommended_renderer_name(base_model_id), True
    except Exception:
        # Model is trainable but missing from this cookbook version's table.
        pass

    if base_model_id in _RENDERER_OVERRIDES:
        return _RENDERER_OVERRIDES[base_model_id], True

    return _FALLBACK_RENDERER, False


def resolve_learning_rate(base_model_id: str) -> tuple[float, bool]:
    """Returns (learning_rate, is_calibrated).

    Tinker publishes learning rates calibrated per model family, scaled by
    hidden size. Using them beats any single constant: the calibrated value for
    the Qwen family is around 4.7e-4, so the old hardcoded 1e-4 was training at
    roughly a fifth of the recommended rate on every run.

    Families it hasn't calibrated raise NotImplementedError, and those fall back
    to a constant in the same range.
    """
    from tinker_cookbook import hyperparam_utils

    try:
        return hyperparam_utils.get_lr(base_model_id, is_lora=True), True
    except Exception:
        return FALLBACK_LEARNING_RATE, False


def resolve_epochs(example_count: int) -> int:
    """How many passes over the data this dataset needs.

    A fixed single epoch punishes small datasets hardest: 40 examples is ten
    optimiser steps, which barely moves the model at all. Aiming for a step
    count instead means a small dataset gets several passes and a large one
    gets a single pass, without exposing a setting to the user.
    """
    steps_per_epoch = max(1, example_count // BATCH_SIZE)
    needed = -(-TARGET_TOTAL_STEPS // steps_per_epoch)  # ceil
    return max(1, min(MAX_EPOCHS, needed))


def resolve_sequence_length(base_model_id: str) -> int:
    """The model's full context window — every token of it.

    Asked of the service rather than assumed, because the answer varies by an
    order of magnitude across the catalogue (32,768 for Qwen3-8B, 262,144 for
    Nemotron-3-Ultra). Any fixed number we picked would either exceed what some
    models allow or waste most of what others offer.

    Whatever a model can read, a customer's documents get to use.
    """
    import tinker

    try:
        caps = tinker.ServiceClient().get_server_capabilities()
        limits = [
            m.max_context_length
            for m in caps.supported_models
            if m.model_name.split(":")[0] == base_model_id
        ]
        if limits:
            return max(limits)
    except Exception:
        pass
    return FALLBACK_SEQUENCE_LENGTH


def count_truncated(dataset_path: Path, base_model_id: str, max_length: int, sample: int = 300) -> tuple[int, int]:
    """Estimates how many examples are too long, from a sample.

    Truncation is silent inside the training library, so a customer can upload
    long documents and train on only the first part of each without ever being
    told. Sampling keeps this cheap on a 200MB dataset while still catching a
    dataset that is systematically too long.

    Returns (over_limit, sampled).
    """
    from tinker_cookbook.tokenizer_utils import get_tokenizer

    try:
        tokenizer = get_tokenizer(base_model_id)
    except Exception:
        return (0, 0)

    over = seen = 0
    with dataset_path.open() as f:
        for line in f:
            if seen >= sample:
                break
            line = line.strip()
            if not line:
                continue
            try:
                messages = json.loads(line)["messages"]
                length = sum(len(tokenizer.encode(m["content"])) for m in messages)
            except Exception:
                continue
            seen += 1
            if length > max_length:
                over += 1
    return (over, seen)


def run_dir_for(job_id: str) -> Path:
    """Where a run's logs and checkpoint record live.

    Deliberately outside the repo and deliberately NOT a temp directory —
    see the comment in `run_real_job` for why it must survive a failure.
    """
    return Path.home() / ".post-trainer" / "runs" / job_id


async def run_real_job(
    *,
    job_id: str,
    base_model_id: str,
    dataset: PreparedDataset,
    on_progress: ProgressCallback,
) -> JobResult:
    """Trains a LoRA adapter, then publishes it to the caller's Hugging Face
    account. Raises on any failure — the caller (jobs.py) turns that into a
    JobStatus error.

    `dataset` is already validated and expanded on disk (see dataset.py); this
    never loads it into memory, so dataset size is bounded by disk, not RAM.
    """

    await on_progress(
        "preparing_data", 5, f"Prepared {dataset.example_count:,} training examples"
    )
    dataset_path = dataset.path
    example_count = dataset.example_count

    renderer_name, is_authoritative = resolve_renderer_name(base_model_id)
    if not is_authoritative:
        # Refuse rather than spend the caller's money teaching a model in a
        # format we only guessed at — the result would look successful and
        # be quietly worse. Adding a checked entry to _RENDERER_OVERRIDES
        # is the fix, not relaxing this.
        raise RuntimeError(
            f"Can't train {base_model_id} yet: no verified chat format for it. "
            "Training would appear to succeed but produce a lower-quality model, "
            "so the run was stopped before spending anything."
        )

    await on_progress("preparing_environment", 15, "Connecting to Tinker")

    # Imported here, not at module load time — see module docstring.
    import tinker
    from tinker_cookbook import checkpoint_utils, renderers
    from tinker_cookbook.supervised import train
    from tinker_cookbook.supervised.data import FromConversationFileBuilder
    from tinker_cookbook.supervised.types import ChatDatasetBuilderCommonConfig

    # Cheap sanity check that credentials are actually valid before we spend
    # any training time — surfaces a clear error early rather than deep
    # inside train.main().
    tinker.ServiceClient()

    # The dataset builder DROPS any trailing incomplete batch, so a dataset
    # smaller than the batch size yields zero training steps — a run that
    # costs money and silently teaches the model nothing. Shrinking the batch
    # to fit keeps small datasets working; batch size is internal plumbing
    # this product deliberately never exposes, so adjusting it is free.
    effective_batch_size = min(BATCH_SIZE, example_count)
    epochs = resolve_epochs(example_count)
    expected_steps = (example_count // effective_batch_size) * epochs

    learning_rate, lr_calibrated = resolve_learning_rate(base_model_id)
    max_length = resolve_sequence_length(base_model_id)

    # Truncation inside the training library is silent. Check a sample and say
    # so, rather than letting someone train on the first page of every document
    # and never find out.
    over_limit, sampled = count_truncated(dataset_path, base_model_id, max_length)
    if sampled and over_limit / sampled > 0.02:
        await on_progress(
            "preparing_data",
            10,
            f"Note: ~{round(100 * over_limit / sampled)}% of examples exceed "
            f"{max_length:,} tokens and will be shortened",
        )

    dataset_builder = FromConversationFileBuilder(
        file_path=str(dataset_path),
        common_config=ChatDatasetBuilderCommonConfig(
            model_name_for_tokenizer=base_model_id,
            renderer_name=renderer_name,
            max_length=max_length,
            batch_size=effective_batch_size,
            # Pairs with dataset.py's expansion: every row in the file
            # already ends at the one assistant turn it should teach, so train
            # on exactly that. See that function for why.
            train_on_what=renderers.TrainOnWhat.LAST_ASSISTANT_MESSAGE,
        ),
    )

    # Deliberately NOT a TemporaryDirectory. Training is the part that costs
    # money, and everything after it (download, convert, upload) can fail on
    # its own — a network blip, an expired URL, bad credentials. Auto-deleting
    # this directory on the way out would take `checkpoints.jsonl` with it and
    # strand weights the caller already paid for. Keeping it means a failed
    # publish is retryable without retraining.
    run_dir = run_dir_for(job_id)
    run_dir.mkdir(parents=True, exist_ok=True)
    log_dir = str(run_dir)

    config = train.Config(
        log_path=log_dir,
        model_name=base_model_id,
        # Tags every downstream Tinker call as coming from this tool, so
        # runs are identifiable in the Tinker console's usage view.
        recipe_name="post_trainer_sft",
        renderer_name=renderer_name,
        dataset_builder=dataset_builder,
        learning_rate=learning_rate,
        num_epochs=epochs,
        lora_rank=LORA_RANK,
        save_every=CHECKPOINT_EVERY_N_STEPS,
        eval_every=0,
    )

    await on_progress("training", 30, "Running post-training updates")
    training_task = asyncio.create_task(train.main(config))
    await _watch_progress_until_done(
        training_task, log_dir=run_dir, expected_steps=expected_steps, on_progress=on_progress
    )
    # Surface the real exception (if any) rather than the CancelledError
    # from the progress watcher.
    await training_task

    # Past this line the money is already spent, so failures are reported
    # with the checkpoint path attached — see _publish_checkpoint.
    await on_progress("finalizing", 88, "Collecting the trained weights")
    record = checkpoint_utils.get_last_checkpoint(log_dir, required_key="sampler_path")
    if record is None or not record.sampler_path:
        raise RuntimeError("Training finished but Tinker recorded no publishable checkpoint.")

    _remember_checkpoint(run_dir, sampler_path=record.sampler_path, base_model_id=base_model_id)

    return await _publish_checkpoint(
        sampler_path=record.sampler_path,
        base_model_id=base_model_id,
        job_id=job_id,
        run_dir=run_dir,
        on_progress=on_progress,
    )


async def _publish_checkpoint(
    *,
    sampler_path: str,
    base_model_id: str,
    job_id: str,
    run_dir: Path,
    on_progress: ProgressCallback,
) -> JobResult:
    """Turns a finished Tinker checkpoint into a published Hugging Face repo.

    Split out from the training flow because it is separately retryable:
    training is the expensive, irreversible part, while everything here is
    just moving bytes. Given a `sampler_path` this can be re-run against an
    already-trained checkpoint without spending anything again.
    """
    from tinker_cookbook import weights

    # Every weights.* call below is blocking and slow — the download and the
    # base-model fetch move gigabytes. Run them on worker threads: calling
    # them inline would block the event loop, freezing the bridge's own
    # /jobs status endpoint for the entire publish, so the UI would sit on a
    # stale percentage and look hung exactly when it is doing the most work.
    staging = run_dir / "publish"
    try:
        downloaded = await asyncio.to_thread(
            weights.download, tinker_path=sampler_path, output_dir=str(staging / "tinker")
        )

        await on_progress("finalizing", 93, "Converting to a standard adapter")
        peft_dir = staging / "peft"  # build_lora_adapter requires this NOT to exist
        if peft_dir.exists():
            shutil.rmtree(peft_dir)
        await asyncio.to_thread(
            weights.build_lora_adapter,
            base_model=base_model_id,
            adapter_path=downloaded,
            output_path=str(peft_dir),
        )

        await on_progress("finalizing", 96, "Publishing to Hugging Face")
        repo_id = _resolve_repo_id(base_model_id, job_id)
        url = await asyncio.to_thread(
            weights.publish_to_hf_hub,
            model_path=str(peft_dir),
            repo_id=repo_id,
            private=True,  # the user's own trained model — theirs to publish, not ours
            token=os.environ["HUGGINGFACE_WRITE_TOKEN"],
            model_card=weights.ModelCardConfig(
                base_model=base_model_id,
                tags=["post-trainer", "lora", "sft"],
            ),
        )
    except Exception as exc:
        # Training already succeeded and was already paid for. Say so, and name
        # the checkpoint, so the run can be salvaged instead of repeated.
        raise RuntimeError(
            f"Training finished successfully, but publishing failed: {exc}. "
            f"The trained weights are safe at {sampler_path} and can be published "
            "again without retraining."
        ) from exc

    return JobResult(id=repo_id, url=url)


_CHECKPOINT_RECORD_NAME = "post_trainer_checkpoint.json"


def _remember_checkpoint(run_dir: Path, *, sampler_path: str, base_model_id: str) -> None:
    """Records what a retry would need, in our own file.

    `checkpoints.jsonl` already holds this, but it belongs to the cookbook
    and its schema is not ours to depend on for recovery. A tiny file we own
    means retry-publish keeps working regardless of what the cookbook changes.
    """
    (run_dir / _CHECKPOINT_RECORD_NAME).write_text(
        json.dumps({"samplerPath": sampler_path, "baseModelId": base_model_id})
    )


def read_remembered_checkpoint(job_id: str) -> tuple[str, str] | None:
    """Returns (sampler_path, base_model_id) for a job whose training finished,
    or None if there is nothing to republish."""
    path = run_dir_for(job_id) / _CHECKPOINT_RECORD_NAME
    try:
        data = json.loads(path.read_text())
        return data["samplerPath"], data["baseModelId"]
    except (OSError, KeyError, json.JSONDecodeError):
        return None


async def _watch_progress_until_done(
    training_task: asyncio.Task,
    *,
    log_dir: Path,
    expected_steps: int,
    on_progress: ProgressCallback,
) -> None:
    """Reports real training progress by tailing metrics.jsonl, which the
    cookbook's JsonLogger appends one line to per completed step.
    train.main() takes no progress callback, so this is the least invasive
    way to show genuine movement instead of a silent jump from 30% to 88%.

    An earlier version counted files in a "checkpoints/" directory that the
    cookbook never creates — it always reported zero. Progress here is
    best-effort by nature: a read failure just leaves the last number in
    place rather than failing a paid run over a cosmetic detail.
    """
    metrics_path = log_dir / "metrics.jsonl"
    while not training_task.done():
        steps = 0
        try:
            if metrics_path.exists():
                with metrics_path.open() as f:
                    steps = sum(1 for line in f if line.strip())
        except OSError:
            pass
        fraction = min(steps / expected_steps, 0.95) if expected_steps else 0.0
        await on_progress("training", 30 + round(fraction * 55), f"Step {steps} of ~{expected_steps}")
        await asyncio.wait([training_task], timeout=3)


def new_upload_path(file_name: str) -> Path:
    """A private scratch path for an incoming dataset upload.

    Uploads land on disk before anything reads them, so a several-hundred-MB
    dataset never has to fit in memory. jobs.create_job deletes this once the
    prepared training file has been written from it.
    """
    uploads = Path.home() / ".post-trainer" / "uploads"
    uploads.mkdir(parents=True, exist_ok=True)
    suffix = Path(file_name).suffix or ".jsonl"
    handle = tempfile.NamedTemporaryFile(
        dir=uploads, prefix="upload-", suffix=suffix, delete=False
    )
    handle.close()
    return Path(handle.name)


def _resolve_repo_id(base_model_id: str, job_id: str) -> str:
    from huggingface_hub import whoami

    token = os.environ["HUGGINGFACE_WRITE_TOKEN"]
    username = whoami(token=token)["name"]
    slug = base_model_id.split("/")[-1].lower().replace(".", "-")
    return f"{username}/{slug}-posttrained-{job_id[:8]}"
