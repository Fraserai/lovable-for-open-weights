"""Score closed frontier models on the same held-out Banking77 messages as banking77_score.py.

Same system prompt, same 200 messages, same exact label match, so the numbers sit beside the
open models' before/after scores. Banking77 is public data, so no zero-data-retention pin.
Internal proof tooling.
Usage: python scripts/banking77_frontier.py <openrouter-model-id> [<openrouter-model-id> ...]
"""

import asyncio
import json
import os
import statistics
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OUT = ROOT / "data" / "banking77" / "frontier_scores.json"
CONCURRENCY = 8
RETRIES = 4


def normalise(s: str) -> str:
    return s.strip().strip("`'\".").split("\n")[0].strip().lower()


async def ask(client: httpx.AsyncClient, gate: asyncio.Semaphore, model: str, system: str, text: str) -> dict:
    # Models answer at their default settings; max_tokens leaves room for any built-in reasoning.
    body = {"model": model, "temperature": 0, "max_tokens": 2000, "usage": {"include": True},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": text}]}
    async with gate:
        for attempt in range(RETRIES):
            started = time.monotonic()
            try:
                r = await client.post(OPENROUTER_URL, json=body)
                data = r.json() if r.status_code == 200 else {}
                if data.get("choices"):
                    usage = data.get("usage") or {}
                    return {"answer": normalise(data["choices"][0]["message"].get("content") or ""),
                            "seconds": time.monotonic() - started, "cost": usage.get("cost") or 0.0,
                            "output_tokens": usage.get("completion_tokens") or 0}
                error = f"{r.status_code} {r.text[:200]}"
            except httpx.HTTPError as e:
                error = repr(e)
            await asyncio.sleep(2 ** attempt)
    return {"answer": "", "seconds": 0.0, "cost": 0.0, "output_tokens": 0, "error": error}


async def score(model: str, test: dict, key: str) -> dict:
    gate = asyncio.Semaphore(CONCURRENCY)
    async with httpx.AsyncClient(headers={"Authorization": f"Bearer {key}"}, timeout=120) as client:
        got = await asyncio.gather(*(ask(client, gate, model, test["system"], row["text"]) for row in test["rows"]))
    answers = [g["answer"] for g in got]
    labels = {l.lower() for l in test["labels"]}
    hits = sum(a == row["label_text"].lower() for a, row in zip(answers, test["rows"]))
    times = sorted(g["seconds"] for g in got if "error" not in g)
    return {"accuracy": hits / len(answers), "valid_label": sum(a in labels for a in answers) / len(answers),
            "failed_requests": sum("error" in g for g in got),
            "p50_seconds": statistics.median(times) if times else None,
            "p99_seconds": times[int(0.99 * (len(times) - 1))] if times else None,
            "cost_usd": sum(g["cost"] for g in got),
            "avg_output_tokens": sum(g["output_tokens"] for g in got) / len(got),
            "answers": answers}


def main(models: list[str]) -> None:
    load_dotenv(ROOT / ".env")
    key = os.environ["OPENROUTER_API_KEY"]
    test = json.loads((ROOT / "data" / "banking77" / "test.json").read_text())
    results = json.loads(OUT.read_text()) if OUT.exists() else {}
    for model in models:
        if model in results:  # don't pay twice
            print(f"{model:34} accuracy {results[model]['accuracy']:.1%}   (reused from the earlier run)")
            continue
        r = asyncio.run(score(model, test, key))
        if r["failed_requests"]:
            print(f"{model:34} {r['failed_requests']} requests failed; not saved")
            continue
        results[model] = r
        OUT.write_text(json.dumps(results, indent=2))
        print(f"{model:34} accuracy {r['accuracy']:.1%}   real label {r['valid_label']:.1%}   "
              f"p50 {r['p50_seconds']:.2f}s   cost ${r['cost_usd']:.2f}")


if __name__ == "__main__":
    main(sys.argv[1:])
