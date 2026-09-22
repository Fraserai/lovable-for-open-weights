# worker

Headless version of the first loop: documents + goal → training JSONL → fine-tune GLM-5.3-Flash on
Fireworks → adapter back (download or private Hugging Face repo). The chat UI will call into this later.

## Setup

```bash
cp ../.env.example ../.env   # then fill in the keys
uv sync
```

## Use

```bash
# 1. Parse + chunk only (free), to sanity-check the documents
uv run trainloop prepare ./docs --goal "Answer member questions about fees and insurance" --run acme-faq --preview

# 2. Write training examples (OpenRouter, zero-data-retention providers only) and validate them
uv run trainloop prepare ./docs --goal "..." --run acme-faq --max-chunks 20

# 3. Start the paid fine-tune (shows the plan and asks first)
uv run trainloop train --run acme-faq

# 4. Watch it; saves the trainer's metrics when done
uv run trainloop status --run acme-faq --wait

# 5. Get the model back
uv run trainloop fetch --run acme-faq --hf-repo your-org/acme-faq
```

`uv run trainloop validate file.jsonl` checks any JSONL against the trainer's format.
Everything for a run lives in `../runs/<name>/` (gitignored).

## Tests

```bash
uv run pytest
```
