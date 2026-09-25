"""The evidence pack: one page a customer's risk team can file, built from the run folder. Free, offline.

It records what the model is, every place the customer's data went, how it was trained, how it scored and
how to run it without us: the model inventory, data map and exit plan APRA's April 2026 AI letter asks
regulated entities for (CPS 230, CPS 234). Facts only, taken from the run. Where a provider hasn't told us
something, such as the region a trainer runs in, the pack says so instead of filling it in.
"""

import hashlib
import html
import json
from datetime import datetime, timezone
from pathlib import Path

from . import config, settings

TRAINERS = {
    "tinker": "Tinker (Thinking Machines Lab)",
    "fireworks": "Fireworks AI",
    "unsloth": "Hugging Face Jobs GPU on your account (Unsloth)",
}
# Who publishes the base weights, by Hugging Face organisation. Boards ask: GLM, Qwen and Kimi come from China.
PUBLISHERS = {
    "moonshotai": ("Moonshot AI", "China"),
    "qwen": ("Alibaba (Qwen)", "China"),
    "zai-org": ("Z.ai (Zhipu)", "China"),
    "thudm": ("Z.ai (Zhipu)", "China"),
    "deepseek-ai": ("DeepSeek", "China"),
    "meta-llama": ("Meta", "United States"),
    "openai": ("OpenAI", "United States"),
    "nvidia": ("NVIDIA", "United States"),
    "google": ("Google", "United States"),
    "mistralai": ("Mistral AI", "France"),
}
UNSTATED = "Not stated by the provider. Confirm before relying on it."
ZDR = "Zero data retention: requests pinned to hosts that keep nothing"
SETTING_LABELS = {
    "examples": "Training examples", "epochs": "Epochs", "steps": "Steps", "batch_size": "Batch size",
    "learning_rate": "Learning rate", "lora_rank": "LoRA rank", "max_length": "Max sequence length",
    "context_length": "Max sequence length", "method": "Method", "lr_scheduler": "Learning-rate schedule",
    "max_steps": "Max steps", "lora_alpha": "LoRA alpha", "lora_dropout": "LoRA dropout", "seed": "Seed",
}


def hf_id(base_model: str) -> str | None:
    """The public Hugging Face checkpoint behind a trainer's model id, when we know it."""
    if base_model.startswith("unsloth:"):
        return base_model.removeprefix("unsloth:")
    if base_model.startswith("accounts/"):
        return config.BASE_MODEL_HF_ID.get(base_model)
    return base_model


def publisher(repo: str | None) -> tuple[str, str]:
    """(publisher, country) for a Hugging Face repo id."""
    org = (repo or "").split("/")[0]
    return PUBLISHERS.get(org.lower(), (org or "Unknown", "Unknown"))


def fingerprint(path: Path) -> dict | None:
    """SHA-256 and size, so anyone can check later that a file is the one this pack describes."""
    if not path.is_file():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            digest.update(block)
    return {"file": path.name, "sha256": digest.hexdigest(), "bytes": path.stat().st_size}


def data_flows(run_dir: Path, state: dict, card: dict | None) -> list[dict]:
    """Every hop the customer's data took, in order."""
    flows = []
    source = state.get("source") or {}
    if state.get("documents"):
        flows.append({"step": "Documents uploaded", "service": f"Weightroom workspace ({run_dir.name}/uploads)",
                      "sent": f"{len(state['documents'])} document(s)",
                      "retention": "Kept until the run is deleted", "region": "Where the workspace runs"})
        openai = state.get("generator_provider") == "openai"
        flows.append({"step": "Training examples written",
                      "service": f"{'OpenAI' if openai else 'OpenRouter'} ({state.get('generator_model', 'unknown model')})",
                      "sent": f"Document text in {state.get('chunks', 'several')} chunks",
                      "retention": "Kept up to 30 days by OpenAI unless the account has a zero-retention agreement. "
                                   "Test or public documents only." if openai else ZDR,
                      "region": UNSTATED})
    elif source.get("hf"):
        flows.append({"step": "Dataset read", "service": f"Hugging Face dataset {source['hf']}",
                      "sent": "Nothing: a public dataset, read only", "retention": "Already public", "region": "n/a"})
    elif source.get("file"):
        flows.append({"step": "Dataset uploaded", "service": f"Weightroom workspace ({run_dir.name})",
                      "sent": f"{Path(source['file']).name}", "retention": "Kept until the run is deleted",
                      "region": "Where the workspace runs"})

    trainer = state.get("trainer") or config.trainer_for(state["base_model"])
    if trainer == "unsloth":
        where, retention, region = TRAINERS[trainer], "Private repos and jobs on your Hugging Face account", UNSTATED
    else:
        where = TRAINERS.get(trainer, trainer)
        retention, region = f"Held in the {where} account used for training. Ask the provider for its terms.", UNSTATED
    flows.append({"step": "Model trained", "service": f"{where}, base {state['base_model']}",
                  "sent": f"{state.get('rows', 0):,} training examples", "retention": retention, "region": region})

    if card:
        n = card.get("examples", 0)
        if card.get("frontier_model"):
            public = card.get("public")
            flows.append({"step": "Scored against a frontier model", "service": f"OpenRouter ({card['frontier_model']})",
                          "sent": f"{n:,} held-back questions",
                          "retention": "Public dataset, so sent without a retention guarantee" if public else ZDR,
                          "region": UNSTATED})
        if card.get("metric") == "judge":
            flows.append({"step": "Answers marked", "service": "OpenRouter (judge model, GLM 5.3)",
                          "sent": f"{n:,} questions, reference answers and model answers", "retention": ZDR,
                          "region": UNSTATED})

    if state.get("hf_repo"):
        flows.append({"step": "Weights handed back", "service": f"Private Hugging Face repo {state['hf_repo']}",
                      "sent": "The trained adapter", "retention": "Yours, on your account", "region": UNSTATED})
    if (run_dir / "model").is_dir():
        flows.append({"step": "Weights downloaded", "service": f"Weightroom workspace ({run_dir.name}/model)",
                      "sent": "The trained adapter", "retention": "Kept until the run is deleted",
                      "region": "Where the workspace runs"})
    return flows


def training_settings(state: dict) -> dict:
    """The settings the job actually ran with: the trainer's own plan first, then what was chosen."""
    s = {k: state[k] for k in ("epochs", "lora_rank") if k in state}
    s.update(settings.load(state))
    s.update(state.get("tinker_plan") or {})
    s.setdefault("examples", state.get("rows"))
    return {SETTING_LABELS[k]: v for k, v in s.items() if k in SETTING_LABELS and v is not None}


def verdict(card: dict | None) -> str | None:
    """One line, the same reading the Scorecard gives in the app."""
    c = (card or {}).get("contenders", {})
    pts = lambda a, b: round((a - b) * 100, 1)  # noqa: E731
    front = (card or {}).get("frontier_model")
    if "trained" in c and "frontier" in c:
        d = pts(c["trained"]["score"], c["frontier"]["score"])
        return f"Your model beats {front} by {d} points." if d >= 0 else f"{front} leads by {-d} points."
    if "trained" in c and "original" in c:
        d = pts(c["trained"]["score"], c["original"]["score"])
        return f"{'+' if d >= 0 else ''}{d} points over the original model."
    return None


def exit_plan(run_dir: Path, state: dict, repo: str | None) -> list[str]:
    lines = []
    have_local, have_repo = (run_dir / "model").is_dir(), bool(state.get("hf_repo"))
    if have_local or have_repo:
        lines.append("The trained model is a standard LoRA adapter (PEFT format) on open weights. Any host that "
                     f"serves {repo or state['base_model']} with LoRA support (vLLM, SGLang, Hugging Face TGI) can "
                     "run it, in any region or on your own hardware, with no dependency on Weightroom.")
    else:
        lines.append("The adapter has not been downloaded yet, so it is held only by the trainer. Get the weights "
                     "(trainloop fetch) before relying on this model: trainers retire models and checkpoints.")
    if state.get("tinker_plan") or state.get("sampler_path"):
        lines.append("Tinker checkpoints convert to a standard adapter on download; nothing Tinker-specific is needed "
                     "to serve it afterwards.")
    if state["base_model"].startswith("accounts/"):
        lines.append("Fireworks notes its training base can differ from the public Hugging Face weights. Confirm "
                     "the adapter loads on the public checkpoint before moving hosts.")
    lines.append("To rebuild the model from scratch: the training data and settings below, with the fingerprints "
                 "to prove they are unchanged, on the same base model.")
    lines.append("To replace it: the same held-back questions (fingerprinted below) score any substitute model "
                 "on equal terms.")
    return lines


def build(run_dir: Path, state: dict, now: datetime | None = None) -> dict:
    card = None
    try:
        card = json.loads((run_dir / "scorecard.json").read_text())
    except (OSError, ValueError):
        pass
    repo = hf_id(state["base_model"])
    pub, country = publisher(repo)
    trained = state.get("job_state") == "JOB_STATE_COMPLETED" or (run_dir / "model").is_dir()
    s = settings.load(state)
    rank = training_settings(state).get("LoRA rank")
    held = [x for x in (state.get("hf_repo"), (run_dir / "model").is_dir() and f"{run_dir.name}/model",
                        state.get("sampler_path")) if x]
    return {
        "generated": (now or datetime.now(timezone.utc)).strftime("%Y-%m-%d %H:%M UTC"),
        "inventory": {
            "Name": s.get("project_name") or state["name"],
            "Purpose": state.get("goal", ""),
            "Status": "Trained" if trained else "Not trained yet",
            "Base model": state["base_model"],
            "Public checkpoint": f"https://huggingface.co/{repo}" if repo else "Not published on Hugging Face",
            "Weights publisher": f"{pub} ({country})",
            "Licence": "See the public checkpoint's model card",
            "Adaptation": f"LoRA adapter, rank {rank}" if rank else "LoRA adapter",
            "Trainer": TRAINERS.get(state.get("trainer") or "", state.get("trainer") or "Unknown"),
            "Weights held at": "; ".join(held) or "Nowhere yet",
            "Weights owner": "The customer",
        },
        "system_prompt": state.get("system_prompt", ""),
        "scorecard": card and {
            "metric": "Exact match against the reference label" if card.get("metric") == "exact"
                      else "Judged against the reference answer (GLM 5.3, zero data retention)",
            "examples": card.get("examples"),
            "updated": card.get("updated"),
            "frontier_model": card.get("frontier_model"),
            "scores": {k: {"score": v["score"], "correct": v.get("correct")} for k, v in card.get("contenders", {}).items()},
            "verdict": verdict(card),
            "notes": card.get("notes", []),
        },
        "data_flows": data_flows(run_dir, state, card),
        "settings": training_settings(state),
        "fingerprints": [f for f in (fingerprint(run_dir / "train.jsonl"), fingerprint(run_dir / "test.jsonl"),
                                     fingerprint(run_dir / "model" / "adapter_model.safetensors"),
                                     fingerprint(run_dir / "model" / "adapter_config.json")) if f],
        "exit_plan": exit_plan(run_dir, state, repo),
    }


# --- the page ---

CSS = """
:root{--ink:#111827;--muted:#5b6474;--line:#e3e7ee;--accent:#007aff;--good:#1a8a4a;--bg:#fff;--soft:#f5f7fa}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,"Segoe UI",
Roboto,sans-serif;padding:40px 20px}main{max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:36px}
h1{font-size:30px;margin:0;line-height:1.2}h2{font-size:19px;margin:0 0 12px}p{margin:0}
.eyebrow{font:600 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
.muted{color:var(--muted)}.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%}
th,td{text-align:left;vertical-align:top;padding:9px 12px 9px 0;border-bottom:1px solid var(--line)}
th{font:600 12px ui-monospace,Menlo,monospace;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
dl{display:grid;grid-template-columns:minmax(140px,220px) 1fr;margin:0}dt,dd{margin:0;padding:8px 0;border-bottom:1px solid var(--line)}
dt{color:var(--muted)}code,.mono{font-family:ui-monospace,Menlo,monospace;font-size:13px;word-break:break-all}
.bars{display:flex;flex-direction:column;gap:10px}.bar{display:grid;grid-template-columns:minmax(120px,240px) 1fr 64px;gap:12px;align-items:center}
.track{height:12px;background:var(--soft);border-radius:99px;overflow:hidden}.fill{height:100%;border-radius:99px;background:#9aa3b2}
.fill.trained{background:var(--accent)}.fill.frontier{background:#af52de}.pct{text-align:right;font-family:ui-monospace,Menlo,monospace}
.verdict{font-size:20px;font-weight:600;margin-top:6px}pre{background:var(--soft);padding:12px;border-radius:8px;white-space:pre-wrap;margin:0}
ul{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px}footer{font-size:13px;color:var(--muted)}
@media print{body{padding:0}.scroll{overflow:visible}}
"""


def _e(value) -> str:
    return html.escape(str(value))


def render_html(pack: dict) -> str:
    inv = pack["inventory"]
    parts = [f"<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' "
             f"content='width=device-width,initial-scale=1'><title>{_e(inv['Name'])} · Evidence pack</title>"
             f"<style>{CSS}</style></head><body><main>",
             f"<header><p class='eyebrow'>Weightroom evidence pack</p><h1>{_e(inv['Name'])}</h1>"
             f"<p class='muted'>{_e(inv['Purpose'])}</p><p class='muted'>Generated {_e(pack['generated'])}</p></header>"]

    card = pack.get("scorecard")
    if card and card["scores"]:
        names = {"original": f"Original ({inv['Base model'].split('/')[-1]})", "trained": "Yours",
                 "frontier": f"Frontier ({card.get('frontier_model') or ''})"}
        bars = "".join(
            f"<div class='bar'><span>{_e(names.get(k, k))}</span><span class='track'><span class='fill {k}' "
            f"style='width:{v['score'] * 100:.1f}%'></span></span><span class='pct'>{v['score'] * 100:.1f}%</span></div>"
            for k, v in card["scores"].items())
        parts.append(f"<section><p class='eyebrow'>Scorecard</p><h2>How it scores on {card['examples']:,} questions it never "
                     f"trained on</h2><div class='bars'>{bars}</div>"
                     + (f"<p class='verdict'>{_e(card['verdict'])}</p>" if card["verdict"] else "")
                     + f"<p class='muted'>{_e(card['metric'])}. {' '.join(_e(n) for n in card['notes'])}</p></section>")

    rows = "".join(f"<dt>{_e(k)}</dt><dd>{_e(v)}</dd>" for k, v in inv.items())
    parts.append(f"<section><p class='eyebrow'>Model inventory entry</p><h2>What this model is</h2><dl>{rows}</dl></section>")

    flows = "".join(f"<tr><td>{_e(f['step'])}</td><td>{_e(f['service'])}</td><td>{_e(f['sent'])}</td>"
                    f"<td>{_e(f['retention'])}</td><td>{_e(f['region'])}</td></tr>" for f in pack["data_flows"])
    parts.append("<section><p class='eyebrow'>Data map</p><h2>Every place the data went</h2><div class='scroll'><table>"
                 "<thead><tr><th>Step</th><th>Service</th><th>What was sent</th><th>Retention</th><th>Region</th></tr></thead>"
                 f"<tbody>{flows}</tbody></table></div></section>")

    srows = "".join(f"<dt>{_e(k)}</dt><dd class='mono'>{_e(v)}</dd>" for k, v in pack["settings"].items())
    parts.append(f"<section><p class='eyebrow'>Training</p><h2>How it was trained</h2><dl>{srows}</dl>"
                 + (f"<p class='muted' style='margin-top:14px'>System prompt used in every example (use it at inference):</p>"
                    f"<pre>{_e(pack['system_prompt'])}</pre>" if pack["system_prompt"] else "") + "</section>")

    frows = "".join(f"<tr><td class='mono'>{_e(f['file'])}</td><td class='mono'>{f['bytes']:,}</td>"
                    f"<td class='mono'>{_e(f['sha256'])}</td></tr>" for f in pack["fingerprints"])
    parts.append("<section><p class='eyebrow'>Fingerprints</p><h2>Proof the files are unchanged</h2><div class='scroll'>"
                 "<table><thead><tr><th>File</th><th>Bytes</th><th>SHA-256</th></tr></thead>"
                 f"<tbody>{frows}</tbody></table></div></section>")

    items = "".join(f"<li>{_e(line)}</li>" for line in pack["exit_plan"])
    parts.append(f"<section><p class='eyebrow'>Exit plan</p><h2>Running it without us</h2><ul>{items}</ul></section>")
    parts.append("<footer>Built from the run's own records. It supports a model inventory, third-party and data-flow "
                 "mapping, and exit planning (APRA CPS 230 and CPS 234, and APRA's April 2026 letter on AI). It is not "
                 "legal or compliance advice. Where a region reads \"not stated\", ask that provider in writing.</footer>")
    parts.append("</main></body></html>")
    return "".join(parts)
