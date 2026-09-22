# web

The chat-first front end: prompt box, model picker, and the run workspace. Next.js 16 (see
`AGENTS.md`: this version differs from older Next.js; its docs ship in `node_modules/next/dist/docs/`).

```bash
pnpm install
pnpm dev        # http://localhost:3000 (the worker must be set up: see ../worker/README.md)
```

## Where things are

- `src/app/page.tsx`: front page. `src/components/Composer.tsx`: the prompt box.
- `src/components/ModelPicker.tsx`: searchable model list (trainable models + Hugging Face search).
- `src/components/Studio.tsx`: the workspace after you press Enter (progress, samples, cost, training).
- `src/lib/catalog.ts`: trainable-model list from the worker's catalog, cached 6h in `../data/`.
- `src/lib/runs.ts`: starts worker steps and reads their progress from `../runs/<id>/`.
- `src/app/api/`: `models`, `runs` (start), `runs/[id]` (status), `runs/[id]/train` (plan + start).
