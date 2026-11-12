"""Grade model answers against reference answers using a cheap open model.

Grading with a frontier model is the expensive way to do this. Harvey's own
numbers put an identical labelling pass at $18,000 on a frontier model and
$18 on a cheap open one, batched. This uses the cheap one.

The judge is asked one narrow question: does the candidate answer state the
same substantive outcome as the reference? Style, length and extra detail are
explicitly not penalised — those are measured separately.
"""

import argparse, json, re
from concurrent.futures import ThreadPoolExecutor

import tinker
from tinker import types
from tinker_cookbook import model_info, renderers

# Judge choice matters as much as the thing being judged. gpt-oss-120b was
# tried first and rejected: it is a reasoning model that emits an internal
# "<|channel|>analysis" stream, and with no system prompt it drifted off task
# entirely (it invented a maths question to grade). Qwen3.6-35B-A3B with
# thinking disabled answers directly, in a format already verified in this
# project, for a comparable price.
JUDGE_MODEL = "Qwen/Qwen3.6-35B-A3B"
JUDGE_RENDERER = "qwen3_5_disable_thinking"

TEMPLATE = """You are grading an answer about Australian law against a reference answer.

QUESTION:
{question}

REFERENCE ANSWER (ground truth):
{reference}

CANDIDATE ANSWER:
{prediction}

Does the candidate state the same substantive outcome and key findings as the reference?
Ignore differences in length, style, formatting and extra background detail.
Penalise only factual disagreement with the reference, or a failure to address it.

Reply with exactly one line:
VERDICT: CORRECT   - agrees with the reference on the substance
VERDICT: PARTIAL   - partly agrees, or hedges, or omits the key outcome
VERDICT: INCORRECT - contradicts the reference, or answers a different question

Then one short sentence of justification."""


def _text_of(msg) -> str:
    """Message content is a plain string for some renderers and a list of
    content parts for others. Flatten either into text."""
    content = msg["content"] if isinstance(msg, dict) else getattr(msg, "content", "")
    if isinstance(content, str):
        return content
    parts = []
    for part in content or []:
        if isinstance(part, str):
            parts.append(part)
        elif isinstance(part, dict):
            parts.append(part.get("text", ""))
        else:
            parts.append(getattr(part, "text", ""))
    return "".join(parts)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--answers", required=True, help="jsonl from sample_eval.py")
    ap.add_argument("--out", required=True)
    ap.add_argument("--concurrency", type=int, default=12)
    args = ap.parse_args()

    rows = [json.loads(line) for line in open(args.answers)]

    sc = tinker.ServiceClient()
    client = sc.create_sampling_client(base_model=JUDGE_MODEL)
    renderer = renderers.get_renderer(
        JUDGE_RENDERER, client.get_tokenizer(), model_name=JUDGE_MODEL
    )
    params = types.SamplingParams(
        max_tokens=120, temperature=0.0, stop=renderer.get_stop_sequences()
    )

    def grade(row):
        prompt = renderer.build_generation_prompt(
            [renderers.Message(role="user", content=TEMPLATE.format(**row))]
        )
        resp = client.sample(prompt=prompt, num_samples=1, sampling_params=params).result()
        msg, _ = renderer.parse_response(resp.sequences[0].tokens)
        text = _text_of(msg)
        m = re.search(r"VERDICT:\s*(CORRECT|PARTIAL|INCORRECT)", text.upper())
        return {**row, "verdict": m.group(1) if m else "UNPARSED", "judge_text": text.strip()}

    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        graded = list(pool.map(grade, rows))

    with open(args.out, "w") as f:
        for g in graded:
            f.write(json.dumps(g, ensure_ascii=False) + "\n")

    counts: dict[str, int] = {}
    for g in graded:
        counts[g["verdict"]] = counts.get(g["verdict"], 0) + 1
    total = len(graded)
    print(f"\ngraded {total} answers from {args.answers}")
    for v in ("CORRECT", "PARTIAL", "INCORRECT", "UNPARSED"):
        if counts.get(v):
            print(f"  {v:<10} {counts[v]:>4}  ({100 * counts[v] / total:5.1f}%)")
    score = (counts.get("CORRECT", 0) + 0.5 * counts.get("PARTIAL", 0)) / total
    print(f"\n  SCORE (correct + half credit for partial): {score:.3f}")


if __name__ == "__main__":
    main()
