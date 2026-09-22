"""trainloop: documents + goal -> training data -> fine-tune on Fireworks -> model back.

Each run lives in runs/<name>/ with a run.json that records progress, so steps can be re-run or resumed.
"""

import asyncio
import json
import re
from pathlib import Path
from typing import Annotated, Optional

import typer

from . import config
from .validate import validate_jsonl

app = typer.Typer(no_args_is_help=True, add_completion=False)
_NAME = re.compile(r"^[a-z0-9][a-z0-9-]{1,40}$")


def _run_dir(name: str) -> Path:
    if not _NAME.fullmatch(name):
        raise typer.BadParameter("run name: 2-41 chars, lowercase letters, digits and hyphens", param_hint="--run")
    return config.RUNS_DIR / name


def _load(run_dir: Path) -> dict:
    path = run_dir / "run.json"
    if not path.exists():
        typer.secho(f"No run at {run_dir}. Start with `trainloop prepare`.", fg="red")
        raise typer.Exit(1)
    return json.loads(path.read_text())


def _save(run_dir: Path, state: dict) -> None:
    (run_dir / "run.json").write_text(json.dumps(state, indent=2))


RunOpt = Annotated[str, typer.Option("--run", help="Run name, e.g. acme-member-faq")]


def main() -> None:
    """Entry point: a missing key is a setup step, not a crash, so print it plainly."""
    try:
        app()
    except config.MissingConfig as e:
        typer.secho(str(e), fg="red", err=True)
        raise SystemExit(2)


@app.command()
def prepare(
    docs: Annotated[list[Path], typer.Argument(exists=True, help="Files or folders (PDF, DOCX, PPTX, HTML, MD, TXT)")],
    goal: Annotated[str, typer.Option(help="Plain-English description of what the model should do")],
    run: RunOpt,
    per_chunk: Annotated[int, typer.Option(help="Examples to write per document chunk")] = 4,
    max_chunks: Annotated[Optional[int], typer.Option(help="Cap chunks (useful for a cheap first pass)")] = None,
    preview: Annotated[bool, typer.Option(help="Parse and chunk only; don't call the generator")] = False,
    base_model: Annotated[str, typer.Option(help="Fireworks base model")] = config.DEFAULT_BASE_MODEL,
):
    """Parse documents and write validated training JSONL for the goal."""
    from .ingest import chunk_markdown, find_documents, to_markdown

    run_dir = _run_dir(run)
    files = find_documents(docs)
    if not files:
        typer.secho("No supported documents found.", fg="red")
        raise typer.Exit(1)

    chunks = []
    for f in files:
        typer.echo(f"Parsing {f.name} ...")
        chunks.extend(chunk_markdown(to_markdown(f), source=f.name))
    if max_chunks:
        chunks = chunks[:max_chunks]
    typer.echo(f"{len(files)} documents -> {len(chunks)} chunks -> up to {len(chunks) * per_chunk} examples")
    if preview or not chunks:
        raise typer.Exit(0)

    from .synth import Generator, generate_rows

    provider = config.generator_provider()
    gen_model = config.generator_model()
    if provider == "openai":
        typer.secho("Writing examples with OpenAI, which is not zero-data-retention: "
                    "use test or public documents only.", fg="yellow")
        gen = Generator(config.require("OPENAI_API_KEY"), gen_model, provider="openai")
    else:
        gen = Generator(config.require("OPENROUTER_API_KEY"), gen_model)
    label = f"Writing examples ({gen_model}{', ZDR' if provider == 'openrouter' else ''})"
    with typer.progressbar(length=len(chunks), label=label) as bar:
        async def go():
            try:
                return await generate_rows(gen, chunks, goal, per_chunk, on_progress=lambda: bar.update(1))
            finally:
                await gen.aclose()
        system_prompt, rows, errors = asyncio.run(go())

    run_dir.mkdir(parents=True, exist_ok=True)
    out = run_dir / "train.jsonl"
    with out.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    for err in errors:
        typer.secho(f"  chunk failed: {err}", fg="yellow")
    report = validate_jsonl(out, config.BASE_MODEL_TRAIN_CTX.get(base_model))
    typer.echo(report.summary())
    _save(run_dir, {
        "name": run, "goal": goal, "base_model": base_model, "generator_model": gen_model,
        "generator_provider": provider, "trainer": config.trainer_for(base_model),
        "system_prompt": system_prompt, "documents": [str(f) for f in files],
        "chunks": len(chunks), "rows": report.valid, "est_tokens": report.est_tokens,
    })
    typer.secho(f"Wrote {out}. Review a few rows, then: trainloop train --run {run}",
                fg="green" if report.ok else "red")


@app.command()
def dataset(
    run: RunOpt,
    goal: Annotated[str, typer.Option(help="What the model should do (used as its instructions)")],
    hf: Annotated[Optional[str], typer.Option("--hf", help="Hugging Face dataset, e.g. isaacus/open-australian-legal-qa")] = None,
    file: Annotated[Optional[Path], typer.Option(exists=True, help="A JSONL dataset on disk")] = None,
    config_name: Annotated[Optional[str], typer.Option("--config", help="Dataset config (Hugging Face)")] = None,
    split: Annotated[Optional[str], typer.Option(help="Dataset split (Hugging Face)")] = None,
    limit: Annotated[int, typer.Option(help="Rows to take")] = 200,
    user_field: Annotated[Optional[str], typer.Option(help="Column holding the question")] = None,
    assistant_field: Annotated[Optional[str], typer.Option(help="Column holding the answer")] = None,
    user_template: Annotated[Optional[str], typer.Option(help='Build the question from columns, e.g. "{Issue}\\n\\nFacts: {Facts}"')] = None,
    assistant_template: Annotated[Optional[str], typer.Option(help='Build the answer from columns, e.g. "{Decision}\\n\\n{Reasons}"')] = None,
    base_model: Annotated[str, typer.Option(help="Base model to train")] = config.DEFAULT_BASE_MODEL,
):
    """Build a run from a ready-made dataset. No documents, no generator, no cost."""
    from . import datasets

    if bool(hf) == bool(file):
        raise typer.BadParameter("give exactly one of --hf or --file")
    fields = (user_field, assistant_field) if user_field and assistant_field else None
    if (user_field or assistant_field) and not fields:
        raise typer.BadParameter("--user-field and --assistant-field go together")
    templates = None
    if user_template or assistant_template:
        if not (user_template and assistant_template):
            raise typer.BadParameter("--user-template and --assistant-template go together")
        # Let people type \n on the command line for a line break
        templates = (user_template.replace("\\n", "\n"), assistant_template.replace("\\n", "\n"))

    run_dir = _run_dir(run)
    run_dir.mkdir(parents=True, exist_ok=True)
    out = run_dir / "train.jsonl"
    try:
        rows = (datasets.from_hub(hf, split=split, config=config_name, limit=limit, fields=fields, templates=templates)
                if hf else datasets.from_jsonl(file, fields=fields, templates=templates))
        count = datasets.write_rows(rows, out, system_prompt=goal)
    except datasets.DatasetError as e:
        typer.secho(str(e), fg="red")
        raise typer.Exit(1)

    report = validate_jsonl(out, config.BASE_MODEL_TRAIN_CTX.get(base_model))
    typer.echo(f"{count:,} rows from {hf or file.name}")
    typer.echo(report.summary())
    _save(run_dir, {
        "name": run, "goal": goal, "base_model": base_model,
        "source": {"hf": hf, "file": str(file) if file else None, "config": config_name,
                   "split": split, "limit": limit, "templates": list(templates) if templates else None},
        "system_prompt": goal, "rows": report.valid, "est_tokens": report.est_tokens,
        "trainer": config.trainer_for(base_model),
    })
    typer.secho(f"Wrote {out}. Next: trainloop plan --run {run}", fg="green" if report.ok else "red")


@app.command()
def validate(jsonl: Annotated[Path, typer.Argument(exists=True)],
             base_model: str = config.DEFAULT_BASE_MODEL):
    """Check a JSONL file against the trainer's format before paying for a run."""
    report = validate_jsonl(jsonl, config.BASE_MODEL_TRAIN_CTX.get(base_model))
    typer.echo(report.summary())
    raise typer.Exit(0 if report.ok else 1)


def _tinker_rate(base_model: str) -> float | None:
    """Tinker's published training price per million tokens, from the live catalog."""
    from .catalog import build_catalog

    price = next((e["train_price"] for e in build_catalog()
                  if e["trainer"] == "tinker" and e["trainer_model_id"] == base_model), None)
    try:
        return float(price.lstrip("$")) if price else None
    except ValueError:
        return None


def plan_for(run_dir: Path, state: dict, epochs: int | None = None, lora_rank: int = 32) -> dict:
    """What a run would cost and how it would be trained. Spends nothing."""
    base = state["base_model"]
    trainer = config.trainer_for(base)
    report = validate_jsonl(run_dir / "train.jsonl", config.BASE_MODEL_TRAIN_CTX.get(base))
    common = {"trainer": trainer, "base_model": base, "rows": report.valid,
              "ok": report.ok, "report": report.summary().splitlines()}
    if trainer == "tinker":
        from . import tinker

        p = tinker.plan(run_dir / "train.jsonl", run_dir / "tinker", base)
        tokens = report.est_tokens * p["epochs"]
        rate = _tinker_rate(base)
        return {**common, "examples": p["examples"], "epochs": p["epochs"], "steps": p["steps"],
                "tokens": tokens, "lora_rank": p["lora_rank"], "renderer": p["renderer"],
                "max_length": p["max_length"], "truncated_share": p["truncated_share"],
                "rate_per_million": rate, "est_cost": (tokens / 1e6 * rate) if rate else None}
    epochs = epochs or max(1, min(4, -(-250 // max(1, report.valid // 32))))
    return {**common, "examples": report.valid, "epochs": epochs,
            "steps": max(1, report.valid // 32) * epochs, "tokens": report.est_tokens * epochs,
            "lora_rank": lora_rank, "rate_per_million": None, "est_cost": None}


@app.command()
def plan(run: RunOpt, as_json: Annotated[bool, typer.Option("--json", help="Machine-readable")] = False):
    """Show how a run would be trained and what it would cost. Spends nothing."""
    run_dir = _run_dir(run)
    p = plan_for(run_dir, _load(run_dir))
    if as_json:
        typer.echo(json.dumps(p))
        return
    cost = f"~${p['est_cost']:.4f} at ${p['rate_per_million']}/M tokens" if p["est_cost"] else "not published by this trainer"
    typer.echo(f"Base model: {p['base_model']} ({p['trainer']})\n"
               f"Examples:   {p['examples']:,} x {p['epochs']} epoch(s) = {p['steps']} steps, ~{p['tokens']:,} tokens\n"
               f"LoRA rank:  {p['lora_rank']}\n"
               f"Est. cost:  {cost}")


@app.command()
def train(
    run: RunOpt,
    epochs: Annotated[Optional[int], typer.Option(min=1, max=10, help="Default: sized to the dataset")] = None,
    lora_rank: Annotated[int, typer.Option(help="Power of 2, max 32")] = 32,
    learning_rate: Annotated[Optional[float], typer.Option(help="Leave unset for the model default")] = None,
    yes: Annotated[bool, typer.Option("--yes", help="Skip the confirmation prompt")] = False,
    wait: Annotated[bool, typer.Option(help="Poll until the job finishes")] = False,
):
    """Start a (paid) fine-tuning run on the trainer that hosts the run's base model."""
    from .fireworks import Fireworks

    if lora_rank not in (1, 2, 4, 8, 16, 32):
        raise typer.BadParameter("must be a power of 2 up to 32", param_hint="--lora-rank")
    run_dir = _run_dir(run)
    state = _load(run_dir)
    if config.trainer_for(state["base_model"]) == "tinker":
        _train_tinker(run_dir, state, yes)
        return
    if state.get("job"):
        typer.secho(f"Run already has job {state['job']}. Use `trainloop status --run {run}`.", fg="yellow")
        raise typer.Exit(1)

    data = run_dir / "train.jsonl"
    report = validate_jsonl(data, config.BASE_MODEL_TRAIN_CTX.get(state["base_model"]))
    if not report.ok:
        typer.echo(report.summary())
        typer.secho("Fix the errors above before training.", fg="red")
        raise typer.Exit(1)

    # Small datasets need several passes to learn anything (Post Trainer's 1-epoch runs under-learned);
    # aim for a step count at Fireworks' default batch of 32 samples, capped at 4 epochs.
    epochs = epochs or max(1, min(4, -(-250 // max(1, report.valid // 32))))
    typer.echo(
        f"Base model:   {state['base_model']}\n"
        f"Examples:     {report.valid:,}  (~{report.est_tokens:,} tokens x {epochs} epoch(s) "
        f"= ~{report.est_tokens * epochs:,} training tokens)\n"
        f"LoRA rank:    {lora_rank}\n"
        f"Output model: {run}"
    )
    if not yes:
        typer.confirm("This starts a paid Fireworks job. Continue?", abort=True)

    fw = Fireworks(config.require("FIREWORKS_API_KEY"), config.require("FIREWORKS_ACCOUNT_ID"))
    try:
        dataset_id = f"{run}-data"
        if not state.get("dataset"):
            typer.echo("Uploading dataset ...")
            state["dataset"] = fw.upload_dataset(dataset_id, data, report.valid)
            _save(run_dir, state)
        fw.wait_dataset_ready(dataset_id)
        job = fw.create_sft_job(run, state["dataset"], state["base_model"], run, epochs, lora_rank, learning_rate)
        state.update(job=run, job_name=job.get("name"), output_model=fw.model_name(run),
                     epochs=epochs, lora_rank=lora_rank)
        _save(run_dir, state)
        cost = job.get("estimatedCost")
        typer.secho(f"Started job {job.get('name')} ({job.get('state')})"
                    + (f", estimated cost {cost}" if cost else ""), fg="green")
    finally:
        fw.close()
    if wait:
        status(run=run, wait=True)


def _train_tinker(run_dir: Path, state: dict, yes: bool) -> None:
    """Tinker trains in this process: plan (free) -> confirm -> train (paid). Blocks until done."""
    from . import tinker
    from .catalog import build_catalog

    if state.get("job_state") in ("JOB_STATE_RUNNING", "JOB_STATE_COMPLETED"):
        typer.secho(f"Run is already {state['job_state']}. Use `trainloop fetch --run {state['name']}`.", fg="yellow")
        raise typer.Exit(1)
    report = validate_jsonl(run_dir / "train.jsonl")
    if not report.ok:
        typer.echo(report.summary())
        typer.secho("Fix the errors above before training.", fg="red")
        raise typer.Exit(1)

    base = state["base_model"]
    work = run_dir / "tinker"
    try:
        p = tinker.plan(run_dir / "train.jsonl", work, base)
    except tinker.TinkerError as e:
        typer.secho(str(e), fg="red")
        raise typer.Exit(1)

    tokens = report.est_tokens * p["epochs"]
    rate = next((e["train_price"] for e in build_catalog() if e["trainer"] == "tinker"
                 and e["trainer_model_id"] == base), None)
    cost = f"~${tokens / 1e6 * float(rate.lstrip('$')):.4f} at {rate}/M tokens" if rate else "unknown (no published rate)"
    typer.echo(
        f"Base model:    {base} (Tinker)\n"
        f"Examples:      {p['examples']:,}  x {p['epochs']} epoch(s) = {p['steps']} steps, ~{tokens:,} training tokens\n"
        f"Settings:      LoRA rank {p['lora_rank']}, learning rate {p['learning_rate']:.2e}, "
        f"chat format {p['renderer']}, context {p['max_length']:,}\n"
        f"Est. cost:     {cost}"
    )
    if p["truncated_share"] > 0.02:
        typer.secho(f"Note: ~{p['truncated_share']:.0%} of examples exceed {p['max_length']:,} tokens and will be cut.",
                    fg="yellow")
    if not yes:
        typer.confirm("This starts a paid Tinker run. Continue?", abort=True)

    state.update(job="tinker", job_state="JOB_STATE_RUNNING", tinker_plan=p)
    _save(run_dir, state)
    try:
        sampler = tinker.train(work, base, p, on_progress=lambda msg: typer.echo(f"  {msg}"))
    except Exception as e:
        state.update(job_state="JOB_STATE_FAILED", error=str(e))
        _save(run_dir, state)
        raise
    state.update(job_state="JOB_STATE_COMPLETED", sampler_path=sampler)
    _save(run_dir, state)
    typer.secho(f"Done. Get the model: trainloop fetch --run {state['name']} [--hf-repo you/name]", fg="green")


def _print_job(job: dict) -> None:
    progress = job.get("jobProgress") or {}
    pct = f" {progress['percent']}%" if "percent" in progress else ""
    epoch = f" epoch {progress['epoch']}" if "epoch" in progress else ""
    msg = (job.get("status") or {}).get("message", "")
    typer.echo(f"{job.get('state')}{pct}{epoch}{'  ' + msg if msg else ''}")


@app.command()
def status(run: RunOpt, wait: Annotated[bool, typer.Option(help="Poll until the job finishes")] = False):
    """Show job progress; saves the trainer's metrics when the job ends."""
    from .fireworks import TERMINAL_STATES, Fireworks

    run_dir = _run_dir(run)
    state = _load(run_dir)
    if not state.get("job"):
        typer.secho(f"No job yet. Run `trainloop train --run {run}`.", fg="yellow")
        raise typer.Exit(1)
    if state["job"] == "tinker":  # Tinker runs in the foreground; its state is recorded as it goes
        typer.echo(state.get("job_state", "unknown") + (f"  {state['error']}" if state.get("error") else ""))
        return
    fw = Fireworks(config.require("FIREWORKS_API_KEY"), config.require("FIREWORKS_ACCOUNT_ID"))
    try:
        job = fw.wait_sft_job(state["job"], on_update=_print_job) if wait else fw.get_sft_job(state["job"])
        if not wait:
            _print_job(job)
        state["job_state"] = job.get("state")
        if job.get("state") in TERMINAL_STATES:
            metrics = fw.fetch_metrics(job)
            if metrics:
                (run_dir / "metrics.jsonl").write_bytes(metrics)
                typer.echo(f"Trainer metrics saved to {run_dir / 'metrics.jsonl'}")
        _save(run_dir, state)
    finally:
        fw.close()
    if state["job_state"] == "JOB_STATE_COMPLETED":
        typer.secho(f"Done. Get the model: trainloop fetch --run {run} [--hf-repo org/name]", fg="green")


@app.command()
def fetch(
    run: RunOpt,
    hf_repo: Annotated[Optional[str], typer.Option(help="Also push to this private Hugging Face repo (\"auto\" = you/<run>)")] = None,
):
    """Download the trained adapter, and optionally push it to a private Hugging Face repo."""
    from .fireworks import Fireworks

    run_dir = _run_dir(run)
    state = _load(run_dir)
    if state.get("job_state") != "JOB_STATE_COMPLETED":
        typer.secho(f"Job is not complete (state={state.get('job_state')}). Check `trainloop status --run {run}`.",
                    fg="yellow")
        raise typer.Exit(1)

    dest = run_dir / "model"
    if state["job"] == "tinker":
        from . import tinker

        typer.echo("Downloading the trained weights and converting them to a standard LoRA adapter ...")
        tinker.export_adapter(run_dir / "tinker", dest)
        files = [f for f in dest.rglob("*") if f.is_file()]
    else:
        fw = Fireworks(config.require("FIREWORKS_API_KEY"), config.require("FIREWORKS_ACCOUNT_ID"))
        try:
            files = fw.download_model(run, dest)
        finally:
            fw.close()
    typer.echo(f"Downloaded {len(files)} files to {dest}")

    if hf_repo == "auto":
        from huggingface_hub import HfApi

        hf_repo = f"{HfApi(token=config.require('HF_TOKEN')).whoami()['name']}/{run}"
    if hf_repo:
        from .handback import push_to_hub

        url = push_to_hub(dest, hf_repo, config.require("HF_TOKEN"), base_model=state["base_model"],
                          hf_base=config.BASE_MODEL_HF_ID.get(state["base_model"], state["base_model"]),
                          job=state.get("job_name") or state["job"], goal=state["goal"],
                          system_prompt=state["system_prompt"])
        state["hf_repo"] = url
        _save(run_dir, state)
        typer.secho(f"Pushed to {url} (private)", fg="green")


@app.command()
def chat(
    run: RunOpt,
    message: Annotated[str, typer.Option(help="What to ask")],
    as_json: Annotated[bool, typer.Option("--json", help="Machine-readable")] = False,
):
    """Ask the original model and your trained one the same question, side by side."""
    from .playground import compare

    run_dir = _run_dir(run)
    _load(run_dir)
    try:
        answers = compare(run_dir, message)
    except RuntimeError as e:
        typer.secho(str(e), fg="red", err=True)
        raise typer.Exit(1)
    if as_json:
        typer.echo(json.dumps(answers))
        return
    typer.secho("Original model:", bold=True)
    typer.echo(answers["original"] + "\n")
    typer.secho("Your trained model:", bold=True)
    typer.echo(answers["trained"])


@app.command()
def catalog(
    json_out: Annotated[Optional[Path], typer.Option("--json", help="Write catalog JSON to this file")] = None,
    trainer: Annotated[Optional[str], typer.Option(help="Filter to one trainer: fireworks or tinker")] = None,
):
    """Show which open models each trainer can fine-tune (live sources)."""
    from .catalog import build_catalog

    entries = build_catalog()
    if trainer:
        entries = [e for e in entries if e["trainer"] == trainer.lower()]
    if not entries:
        typer.secho("No catalog entries.", fg="yellow")
        raise typer.Exit(1)
    if json_out:
        json_out.write_text(json.dumps(entries, indent=2))
        typer.echo(f"Wrote {len(entries)} entries to {json_out}")
        return

    def fmt_params(n: Optional[int]) -> str:
        return f"{n / 1e9:.1f}B" if isinstance(n, (int, float)) else "-"

    def fmt_ctx(n: Optional[int]) -> str:
        return f"{n:,}" if isinstance(n, int) else "-"

    typer.echo(f"{'trainer':<10} {'sft':<5} {'dpo':<5} {'ctx':>8} {'params':>10}  model")
    for e in entries:
        dpo = "yes" if e["dpo"] else ("no" if e["dpo"] is False else "?")
        typer.echo(
            f"{e['trainer']:<10} "
            f"{'yes' if e['sft_lora'] else 'no':<5} {dpo:<5} "
            f"{fmt_ctx(e['train_context_tokens']):>8} {fmt_params(e['params']):>10}  "
            f"{e['trainer_model_id']}"
        )


if __name__ == "__main__":
    main()
