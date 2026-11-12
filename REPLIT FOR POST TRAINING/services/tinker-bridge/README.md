# Tinker bridge

A small local FastAPI service that is the *only* thing in Post Trainer
allowed to import Tinker's Python SDK or hold real credentials. The
Next.js app never talks to Tinker directly — it proxies through this
service's HTTP contract via `app/api/training-runs/*` on the Next.js side.

This exists because Tinker's training lifecycle (`ServiceClient` /
`TrainingClient`) is Python-only — there's no HTTP API our TypeScript app
could call directly.

## Run it

```bash
cd services/tinker-bridge
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --port 8000 --reload
```

That's enough to run the server and exercise everything except a real
training run: `GET /health`, dataset validation, and the "not configured"
response the Next.js app's `FallbackTrainingProvider` uses to fall back to
the simulated run.

### Enabling real training runs

1. Get a Tinker API key (Tinker Console, thinkingmachines.ai — access may
   be waitlisted) and a Hugging Face token with **write** access
   (Settings → Access Tokens → New token → Write role).
2. `cp .env.example .env` and fill both in. Never commit `.env`.
3. Install the heavier training dependency (pulls in torch/transformers —
   several GB, deliberately kept out of the base install):
   ```bash
   .venv/bin/pip install -r requirements-training.txt
   ```
4. Restart the server. `GET /health` should now report `"configured": true`.

Without both credentials set, `POST /jobs` always returns `501` and the
Next.js app quietly uses the simulated run instead — nothing breaks if you
skip this.

## What's genuinely verified vs. not

Verified against the real `tinker`/`tinker-cookbook` package source (not
just docs): the `ServiceClient`/`TrainingClient` API shape, `train.Config`'s
fields, `FromConversationFileBuilder`'s constructor, and the full HTTP
contract below (health check, job creation, dataset validation, error
handling, async job scheduling — all exercised with a running server).

**Not yet verified: an actual live training run.** This environment has no
Tinker account. `tinker_runner.py` is implemented against the documented
API as faithfully as possible, but the first real run is the thing to
watch closely — especially:
- The renderer-name mapping in `tinker_runner.py` (`_RENDERER_BY_MODEL_SUBSTRING`) —
  covers Qwen3(.5)/Llama 3/DeepSeek V3/Kimi K2/GPT-OSS/Nemotron by name match,
  falls back to Tinker's generic `"role_colon"` renderer for everything else
  (Mistral, Phi, Gemma, community fine-tunes, ...). That fallback will run,
  but with lower-fidelity chat formatting than a model-specific renderer.
- The checkpoint-progress watcher (`_watch_progress_until_done`) — polls the
  log directory for new checkpoint files as a stand-in for real progress,
  since `train.main()` doesn't take a progress callback.

## HTTP contract

`POST /jobs`
```json
{ "baseModelId": "Qwen/Qwen3-8B", "instruction": "...", "dataset": { "fileName": "data.jsonl", "content": "..." } }
```
→ `201 { "id": "..." }`, `501` if not configured, `422` if the dataset isn't valid chat-JSONL.

`GET /jobs/{id}`
→ `{ "id", "status": "running"|"complete"|"error", "stage", "progress", "message"?, "result"?: { "id", "url" }, "error"? }`

`DELETE /jobs/{id}` — best-effort; stops the bridge from reporting further progress, does not guarantee the remote Tinker run itself stops.
