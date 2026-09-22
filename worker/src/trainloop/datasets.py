"""Use a ready-made dataset instead of writing training examples from documents.

Two sources: a JSONL file the customer uploads, or a dataset on the Hugging Face Hub
(read through the datasets-server API, so no heavy `datasets` dependency).

Public datasets arrive in a handful of shapes. Rather than demand one, map the common
ones onto chat messages and say plainly when a row doesn't fit.
"""

import json
from collections.abc import Iterator
from pathlib import Path

import httpx

ROWS_URL = "https://datasets-server.huggingface.co/rows"
SPLITS_URL = "https://datasets-server.huggingface.co/splits"
PAGE = 100  # datasets-server's maximum rows per request

# (user field, assistant field) pairs seen in public instruction datasets, matched case-insensitively.
# "issue"/"decision" covers ATO Interpretative Decisions and similar ruling datasets.
_PAIRS = [
    ("instruction", "output"), ("instruction", "response"), ("prompt", "response"),
    ("prompt", "completion"), ("question", "answer"), ("issue", "decision"),
    ("input", "output"), ("query", "answer"),
]
_ROLE_ALIASES = {"human": "user", "gpt": "assistant", "bot": "assistant", "assistant": "assistant",
                 "user": "user", "system": "system"}


class DatasetError(ValueError):
    pass


def _clean(messages: list[dict]) -> list[dict] | None:
    out = []
    for m in messages:
        role = _ROLE_ALIASES.get(str(m.get("role") or m.get("from") or "").strip().lower())
        content = m.get("content") if m.get("content") is not None else m.get("value")
        if not role or not isinstance(content, str) or not content.strip():
            return None
        out.append({"role": role, "content": content.strip()})
    return out if any(m["role"] == "assistant" for m in out) else None


def to_messages(row: dict, fields: tuple[str, str] | None = None) -> list[dict] | None:
    """Map one dataset row onto chat messages, or None if it has no usable pair.

    `fields` names the (user, assistant) columns explicitly, for datasets whose column
    names we don't recognise.
    """
    row = {str(k).strip().lower(): v for k, v in row.items()}
    pairs = [(fields[0].lower(), fields[1].lower())] if fields else _PAIRS

    if not fields:
        for key in ("messages", "conversations", "conversation"):
            if isinstance(row.get(key), list):
                return _clean(row[key])

    for user_key, assistant_key in pairs:
        user, assistant = row.get(user_key), row.get(assistant_key)
        if isinstance(user, str) and isinstance(assistant, str) and user.strip() and assistant.strip():
            # Alpaca-style datasets put extra material in "input" alongside "instruction".
            extra = row.get("input") if user_key == "instruction" else None
            if isinstance(extra, str) and extra.strip():
                user = f"{user.strip()}\n\n{extra.strip()}"
            return [{"role": "user", "content": user.strip()}, {"role": "assistant", "content": assistant.strip()}]
    return None


def from_jsonl(path: Path, fields: tuple[str, str] | None = None) -> Iterator[list[dict]]:
    with path.open(encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as e:
                raise DatasetError(f"{path.name} line {line_no} isn't valid JSON.") from e
            messages = to_messages(row, fields) if isinstance(row, dict) else None
            if messages:
                yield messages


def hub_splits(repo: str, client: httpx.Client | None = None) -> list[tuple[str, str]]:
    c = client or httpx.Client(timeout=60)
    try:
        resp = c.get(SPLITS_URL, params={"dataset": repo})
        if resp.is_error:
            raise DatasetError(f"Hugging Face couldn't list splits for {repo}: {resp.status_code}")
        return [(s["config"], s["split"]) for s in resp.json().get("splits", [])]
    finally:
        if client is None:
            c.close()


def from_hub(repo: str, split: str | None = None, config: str | None = None, limit: int = 200,
             client: httpx.Client | None = None, fields: tuple[str, str] | None = None) -> Iterator[list[dict]]:
    """Stream rows from a public Hugging Face dataset, mapped to chat messages."""
    c = client or httpx.Client(timeout=120)
    try:
        available = hub_splits(repo, c)
        if not available:
            raise DatasetError(f"{repo} has no readable splits. It may be private or not yet indexed.")
        config, split = next(
            ((cfg, sp) for cfg, sp in available if (config is None or cfg == config) and (split is None or sp == split)),
            available[0],
        )
        sent = 0
        for offset in range(0, limit, PAGE):
            resp = c.get(ROWS_URL, params={"dataset": repo, "config": config, "split": split,
                                           "offset": offset, "length": min(PAGE, limit - sent)})
            if resp.is_error:
                raise DatasetError(f"Hugging Face returned {resp.status_code} for {repo} ({config}/{split}).")
            rows = resp.json().get("rows", [])
            if not rows:
                return
            for item in rows:
                messages = to_messages(item.get("row", {}), fields)
                if messages:
                    yield messages
                    sent += 1
                    if sent >= limit:
                        return
    finally:
        if client is None:
            c.close()


def write_rows(rows: Iterator[list[dict]], out: Path, system_prompt: str | None) -> int:
    """Write chat rows as training JSONL, adding the system prompt where a row has none."""
    count = 0
    with out.open("w", encoding="utf-8") as f:
        for messages in rows:
            if system_prompt and messages[0]["role"] != "system":
                messages = [{"role": "system", "content": system_prompt}, *messages]
            f.write(json.dumps({"messages": messages}, ensure_ascii=False) + "\n")
            count += 1
    if count == 0:
        raise DatasetError(
            "No usable rows. Each row needs a chat conversation, or a question/answer style pair "
            "(messages, conversations, instruction+output, prompt+response, question+answer, issue+decision), "
            "or name the columns yourself with --user-field and --assistant-field."
        )
    return count
