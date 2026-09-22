# Lovable for Open Models

A chat-first way to customise open model weights: pick any open model, bring your documents or a
dataset, say what the model should do, and get back weights you own. Product brief: [CLAUDE.md](CLAUDE.md).

Working name in the UI: **Weightroom** (change it in [web/src/lib/brand.ts](web/src/lib/brand.ts)).

## How it fits together

```
web/     Next.js app: the prompt box, model picker and workspace
worker/  Python: reads documents, writes or imports training data, trains, hands the model back
runs/    one folder per run (uploads, training data, logs, the trained model). Not in git.
data/    cached model catalog. Not in git.
```

The web app calls the worker's `trainloop` command for each step, so everything the page does can
also be run from the terminal.

| Step | Worker command | Where it runs |
|---|---|---|
| Turn documents into training examples | `trainloop prepare` | Docling + OpenRouter (zero data retention) or OpenAI (test only) |
| Or use a ready-made dataset | `trainloop dataset` | Your `.jsonl`, or a Hugging Face dataset |
| See what training will cost | `trainloop plan` | Free |
| Train | `trainloop train` | Fireworks (`accounts/...` models) or Tinker (Hugging Face ids) |
| Take the model home | `trainloop fetch --hf-repo you/name` | Download + private Hugging Face repo |

## Run it locally

```bash
cp .env.example .env      # then fill in the keys you have
cd worker && uv sync      # Python worker (includes Tinker's SDK, which is large)
cd ../web && pnpm install
pnpm dev                  # http://localhost:3000
```

Never paste keys into chat or commit `.env`; it is git-ignored.

## Status (2026-09-23)

- **Proof it improves models:** on Banking77 (77-way intent classification), Qwen3.5-4B went from
  67.5% to 82.5% exact-match accuracy on 200 held-out messages after training on 1,000 examples
  (1 epoch, ~41c, ~11 min on Tinker). Reproduce: `worker/scripts/banking77_data.py`, then
  `trainloop dataset/train`, then `worker/scripts/banking77_score.py <run>`.
- **Tinker:** proven end to end with real runs (Qwen3.5-4B on a PDS and on 300 ATO decisions),
  published to a private Hugging Face repo.
- **Fireworks:** key, account and a real dataset upload verified live (GLM-5.3-Flash is
  supervised-LoRA tunable on the account). Training not yet run: the account has no credit.
- **Page:** upload documents or a dataset, model picker (64 trainable models + Hugging Face
  search), write examples, review cost, train with live progress, talk to your model side by side
  with the original, take it home to a private Hugging Face repo, reopen any run at `/runs/<id>`.
- **Not production-ready:** no login, and training runs as a process of the dev server, so stopping
  the server stops training. Needs a real job runner (see CLAUDE.md) before customers.
