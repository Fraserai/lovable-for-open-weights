# Weightroom

**We're the shovel that lets anyone, and any business, build and own their own intelligence.**
From Models to Moats. See [BRAND.md](BRAND.md). Product brief: [CLAUDE.md](CLAUDE.md).

Pick any open model, bring a dataset or your documents, and train it on a cloud trainer (Tinker,
Fireworks, or a GPU on your Hugging Face account). You see what training costs first, and you keep the weights.

## Run it

```bash
cp .env.example .env            # fill in the keys you have (never commit .env; it's git-ignored)
cd worker && uv sync            # Python worker (includes Tinker's SDK, which is large)
cd ../web && pnpm install
pnpm dev                        # http://localhost:3000
```

Keep the project out of iCloud-synced folders (Desktop, Documents). With "Optimise Mac Storage" on,
macOS offloads `node_modules` and `.venv` files to the cloud and everything stalls while they download.

## How it fits together

```
web/     Next.js app: the one-page Train screen (Configure · Current Run · History)
worker/  Python CLI `trainloop`: imports or writes training data, plans cost, trains, hands the model back
runs/    one folder per run (uploads, training data, logs). Not in git.
data/    cached model catalog. Not in git.
```

The page calls the worker's commands for each step, so everything it does can also be run from the
terminal (see [worker/README.md](worker/README.md)).

| Step | Worker command | Where it runs |
|---|---|---|
| Use a ready-made dataset | `trainloop dataset` | Your `.jsonl`, or any Hugging Face dataset (free) |
| Or turn documents into examples | `trainloop prepare` | Docling + OpenRouter (zero data retention) |
| Choose model, trainer and settings | `trainloop configure` | Free |
| See what training will cost | `trainloop plan` | Free |
| Train | `trainloop train` | Tinker (Hugging Face ids), Fireworks (`accounts/...`), or a Hugging Face GPU running Unsloth (`unsloth:<id>`) |
| Take the model home | `trainloop fetch --hf-repo you/name` | Download + private Hugging Face repo |

Which trainer honours which setting lives in `worker/src/trainloop/settings.py` (mirrored in
`web/src/lib/settings.ts`). Controls a trainer can't honour are greyed out on the page.

## Status (2026-09-24)

- **Proof it improves models:** on Banking77 (77-way intent classification, 200 held-out messages),
  Qwen3.5-4B went from 67.5% to 82.5% after 1,000 examples (~41¢, ~11 min on Tinker), and
  **Kimi-K2.6 (1T parameters) went from 76.0% to 92.0%** after 1,540 examples (~$4.12, ~55 min).
  Reproduce: `worker/scripts/banking77_data.py`, `trainloop dataset` + `train`, then
  `worker/scripts/banking77_score.py <run>`.
- **Trainers:** Tinker is proven end to end. Fireworks and Hugging Face GPU jobs are wired and their
  plans verified; neither has trained live yet. **All three accounts are currently out of credit.**
- **Not production-ready:** no login or billing, and training runs as a process of the dev server,
  so stopping the server stops training. Needs a real job runner before customers.
