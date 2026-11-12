"""Validation and preparation for the one dataset shape a real training run
accepts.

JSONL, one chat conversation per line:
    {"messages": [{"role": "user", "content": "..."},
                  {"role": "assistant", "content": "..."}]}

Everything here works a line at a time, start to finish. A vertical-scale
dataset is hundreds of megabytes — holding one in memory (as this module
originally did, taking the whole file as a `str`) puts a hard ceiling on how
much data a customer can train on, which is exactly the wrong limit for this
product to have. Peak memory here is one line, whether the file is 2MB or 2GB.

The Next.js side runs a cheap structural check on the first slice of the file
for instant feedback. This is the authoritative copy — it sees every line, and
nothing here may assume the client check ran.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


class DatasetValidationError(ValueError):
    """Raised when a dataset can't be used for training. The message is shown
    to the user, so it names the offending line rather than just failing."""


@dataclass
class Conversation:
    messages: list[dict[str, str]]


@dataclass
class PreparedDataset:
    """A validated, training-ready file plus what we learned making it."""

    path: Path
    conversation_count: int
    example_count: int
    """One per assistant turn — see `_expand` for why these differ."""


def parse_messages(line: str, line_number: int) -> list[dict[str, str]]:
    """Validates one JSONL line and returns its messages.

    Raises DatasetValidationError naming the line, so a customer with a
    100,000-line file is told *which* row is wrong.
    """
    try:
        parsed = json.loads(line)
    except json.JSONDecodeError as exc:
        raise DatasetValidationError(f"Line {line_number} isn't valid JSON.") from exc

    if not isinstance(parsed, dict):
        raise DatasetValidationError(f"Line {line_number} isn't a JSON object.")

    messages = parsed.get("messages")
    if not isinstance(messages, list) or not messages:
        raise DatasetValidationError(
            f'Line {line_number} is missing a non-empty "messages" array.'
        )

    for message in messages:
        if (
            not isinstance(message, dict)
            or not isinstance(message.get("role"), str)
            or not isinstance(message.get("content"), str)
        ):
            raise DatasetValidationError(
                f'Line {line_number} has a message missing a string "role" or "content".'
            )

    if not any(m["role"] == "assistant" for m in messages):
        # Training learns from what the model should *say*. A conversation with
        # no assistant reply contributes nothing, so reject it here rather than
        # letting the run start and fail later.
        raise DatasetValidationError(
            f'Line {line_number} has no "assistant" reply. Every conversation needs at '
            "least one, since that's what the model is being taught to produce."
        )

    return [{"role": m["role"], "content": m["content"]} for m in messages]


def prepare_dataset(source: Path, destination: Path) -> PreparedDataset:
    """Validates `source` and writes training-ready examples to `destination`.

    Streams: one line in, zero or more lines out, nothing accumulated. This is
    the only place a dataset is read in full, and it never holds more than a
    single conversation at once.
    """
    conversations = 0
    examples = 0

    with source.open("r", encoding="utf-8") as src, destination.open("w", encoding="utf-8") as dst:
        for line_number, raw in enumerate(src, start=1):
            line = raw.strip()
            if not line:
                continue

            messages = parse_messages(line, line_number)
            conversations += 1

            for expanded in _expand(messages):
                dst.write(json.dumps({"messages": expanded}) + "\n")
                examples += 1

    if conversations == 0:
        raise DatasetValidationError("Dataset is empty.")

    return PreparedDataset(path=destination, conversation_count=conversations, example_count=examples)


def _expand(messages: list[dict[str, str]]) -> list[list[dict[str, str]]]:
    """Turns one conversation into one training example per assistant turn.

    A two-turn chat becomes two examples: the first ending at the first
    assistant reply, the second containing the whole exchange. Each is then
    trained with LAST_ASSISTANT_MESSAGE, so every reply is taught against
    exactly the context that would precede it at inference time.

    The obvious alternative — feed the whole conversation once and train on
    ALL_ASSISTANT_MESSAGES — is subtly wrong for several renderers. Some
    (qwen3_5, nemotron3, and others) lack what the cookbook calls the extension
    property, meaning earlier assistant turns get a different token prefix
    during training than they would during generation. The library warns rather
    than failing, so the run completes, publishes, and silently produces a
    worse model.

    Splitting is correct for every renderer, so this does it unconditionally
    rather than branching on the model. Single-turn data is unaffected: one
    conversation in, one example out.
    """
    return [messages[: i + 1] for i, m in enumerate(messages) if m["role"] == "assistant"]
