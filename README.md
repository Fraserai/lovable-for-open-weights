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
| Choose model, trainer and settings | `trainloop configure` | Free |
| See what training will cost | `trainloop plan` | Free |
| Train | `trainloop train` | Fireworks (`accounts/...` models), Tinker (Hugging Face ids) or Unsloth on Hugging Face GPUs (`unsloth:<id>`) |
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
  (1 epoch, ~41c, ~11 min on Tinker). Scaled up: **Kimi-K2.6 (1T parameters) went from 76.0% to
  92.0%** on the same 200 messages after 1,540 balanced examples (20 per intent, LR 2.5e-4,
  1 epoch, ~$4.12, ~55 min). Reproduce: `worker/scripts/banking77_data.py [balanced 20]`, then
  `trainloop dataset/train`, then `worker/scripts/banking77_score.py <run>`.
- **Tinker:** proven end to end with real runs (Qwen3.5-4B on a PDS and on 300 ATO decisions),
  published to a private Hugging Face repo.
- **Unsloth on Hugging Face Jobs:** wired end to end (plan, launch, live progress, private-repo handback,
  web picker for any Hub model). Not yet run live: the Hugging Face account needs prepaid Jobs credit.
  First run queued: `banking77-unsloth` (Qwen3.5-4B, at most $1.00) against Tinker's 82.5%.
- **Fireworks:** key, account and a real dataset upload verified live (GLM-5.3-Flash is
  supervised-LoRA tunable on the account). Training not yet run: the account has no credit.
- **App (2026-09-24):** one page, the **Train** screen, laid out like Unsloth Studio's but running on our
  cloud trainers. Tabs: **Configure** (Model card: any model, method, trainer; Dataset card: any Hugging Face
  dataset or an upload, subset/split, column mapping, preview; Parameters: Simple/Advanced with every
  Unsloth control, greyed with "Not supported on <trainer>" where a trainer can't honour it; Save/Load YAML;
  a Run preview rail with steps, batch, context, LR, trainer, where it runs and the cost, re-planned live),
  **Current Run** (progress, loss and LR charts, publish to Hugging Face) and **History**. Which trainer takes
  which setting lives in `worker/src/trainloop/settings.py` (mirrored in `web/src/lib/settings.ts`).
- **Not production-ready:** no login, and training runs as a process of the dev server, so stopping
  the server stops training. Needs a real job runner (see CLAUDE.md) before customers.
