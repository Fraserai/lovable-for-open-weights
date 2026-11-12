"""Sample answers from a base or post-trained model over a held-out set.

This is the measuring stick: run it once against the untouched base model,
once against the post-trained checkpoint, then compare. Usage:

  python scripts/sample_eval.py --data ../../data/heldout-300.jsonl \
      --base-model Qwen/Qwen3.5-397B-A17B --limit 3 --out /tmp/base.jsonl
"""

import argparse, json, time
from concurrent.futures import ThreadPoolExecutor

import tinker
from tinker import types
from tinker_cookbook import model_info, renderers


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--base-model", required=True, help="model whose tokenizer/renderer to use")
    ap.add_argument("--model-path", default=None, help="tinker:// checkpoint; omit to sample the base model")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--max-tokens", type=int, default=600)
    ap.add_argument("--temperature", type=float, default=0.0)
    ap.add_argument("--concurrency", type=int, default=8)
    ap.add_argument("--renderer", default=None, help="override the recommended renderer")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    rows = [json.loads(line) for line in open(args.data)]
    if args.limit:
        rows = rows[: args.limit]

    sc = tinker.ServiceClient()
    client = (
        sc.create_sampling_client(model_path=args.model_path)
        if args.model_path
        else sc.create_sampling_client(base_model=args.base_model)
    )

    renderer_name = args.renderer or model_info.get_recommended_renderer_name(args.base_model)
    renderer = renderers.get_renderer(renderer_name, client.get_tokenizer(), model_name=args.base_model)
    params = types.SamplingParams(
        max_tokens=args.max_tokens,
        temperature=args.temperature,
        stop=renderer.get_stop_sequences(),
    )
    print(f"renderer={renderer_name}  rows={len(rows)}  max_tokens={args.max_tokens}", flush=True)

    def run(item):
        i, row = item
        question = row["messages"][0]["content"]
        prompt = renderer.build_generation_prompt([renderers.Message(role="user", content=question)])
        resp = client.sample(prompt=prompt, num_samples=1, sampling_params=params).result()
        seq = resp.sequences[0]
        message, _termination = renderer.parse_response(seq.tokens)
        return {
            "index": i,
            "question": question,
            "reference": row["messages"][1]["content"],
            "prediction": message["content"] if isinstance(message, dict) else getattr(message, "content", ""),
            "prompt_tokens": prompt.length,
            "completion_tokens": len(seq.tokens),
        }

    started = time.time()
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        results = list(pool.map(run, enumerate(rows)))
    results.sort(key=lambda r: r["index"])

    with open(args.out, "w") as f:
        for r in results:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    p = sum(r["prompt_tokens"] for r in results)
    c = sum(r["completion_tokens"] for r in results)
    print(f"\ndone in {time.time() - started:.1f}s -> {args.out}")
    print(f"prompt tokens {p:,}  completion tokens {c:,}")
    print(f"mean completion {c / len(results):.0f} tokens/answer")


if __name__ == "__main__":
    main()
