"""Prepare the Banking77 proof: a random training sample and a held-out test sample.

Internal proof tooling, not a product feature: it shows the loop measurably improves a model
at the task it was trained on. Both models get identical instructions (including every allowed
label), so the original isn't handicapped.
"""

import json
import random
import sys
from pathlib import Path

REPO = "mteb/banking77"
OUT = Path(__file__).resolve().parents[2] / "data" / "banking77"


def fetch(split: str) -> list[dict]:
    """Download the whole split file (the page-by-page rows API rate-limits full reads)."""
    from dotenv import dotenv_values
    from huggingface_hub import hf_hub_download

    token = dotenv_values(Path(__file__).resolve().parents[2] / ".env").get("HF_TOKEN")
    path = hf_hub_download(REPO, f"{split}.jsonl", repo_type="dataset", token=token)
    return [json.loads(line) for line in open(path, encoding="utf-8") if line.strip()]


def system_prompt(labels: list[str]) -> str:
    return ("Classify the bank customer's message into exactly one of these intents. "
            "Reply with the intent label only, exactly as written.\n\nIntents: " + ", ".join(labels))


def main(n_train: int = 1000, n_test: int = 200, seed: int = 7) -> None:
    train, test = fetch("train"), fetch("test")
    labels = sorted({r["label_text"] for r in train})
    rng = random.Random(seed)
    OUT.mkdir(parents=True, exist_ok=True)
    system = system_prompt(labels)
    with (OUT / "train.jsonl").open("w") as f:
        for r in rng.sample(train, n_train):
            f.write(json.dumps({"messages": [{"role": "system", "content": system},
                                             {"role": "user", "content": r["text"]},
                                             {"role": "assistant", "content": r["label_text"]}]}) + "\n")
    (OUT / "test.json").write_text(json.dumps({"system": system, "labels": labels,
                                                "rows": rng.sample(test, n_test)}))
    first_labels = [r["label_text"] for r in train[:200]]
    print(f"{len(train)} train / {len(test)} test rows, {len(labels)} labels; "
          f"first 200 rows cover {len(set(first_labels))} labels (why we sample randomly)")
    print(f"wrote {n_train} training examples and {n_test} held-out test rows to {OUT}")


if __name__ == "__main__":
    main(*map(int, sys.argv[1:]))
