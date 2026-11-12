"""Run one post-training job with explicit, deliberate settings.

The bridge (app/tinker_runner.py) picks settings automatically for product
users. This script is for a considered experiment where every choice is
stated and justified, and it keeps checkpoints at epoch boundaries so the
best one can be chosen after measuring rather than assumed to be the last.
"""

import argparse, asyncio, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--data", required=True)
    ap.add_argument("--renderer", required=True)
    ap.add_argument("--lora-rank", type=int, required=True)
    ap.add_argument("--epochs", type=int, required=True)
    ap.add_argument("--lr", type=float, required=True)
    ap.add_argument("--batch-size", type=int, default=4)
    ap.add_argument("--max-length", type=int, default=2048)
    ap.add_argument("--save-every", type=int, default=0, help="0 = once per epoch")
    ap.add_argument("--job-id", required=True)
    args = ap.parse_args()

    from app.main import _ensure_ssl_certificates  # the macOS CA-cert fix

    _ensure_ssl_certificates()

    import tinker
    from tinker_cookbook import renderers
    from tinker_cookbook.supervised import train
    from tinker_cookbook.supervised.data import FromConversationFileBuilder
    from tinker_cookbook.supervised.types import ChatDatasetBuilderCommonConfig

    tinker.ServiceClient()  # validate credentials before spending anything

    n = sum(1 for _ in open(args.data))
    steps_per_epoch = n // args.batch_size
    total_steps = steps_per_epoch * args.epochs

    run_dir = Path.home() / ".post-trainer" / "runs" / args.job_id
    run_dir.mkdir(parents=True, exist_ok=True)

    print(f"model      {args.model}")
    print(f"renderer   {args.renderer}")
    print(f"data       {args.data}  ({n:,} examples)")
    print(f"lora_rank  {args.lora_rank}")
    print(f"lr         {args.lr}")
    print(f"epochs     {args.epochs}  ({steps_per_epoch} steps/epoch, {total_steps} total)")
    print(f"run_dir    {run_dir}")
    print(flush=True)

    config = train.Config(
        log_path=str(run_dir),
        model_name=args.model,
        recipe_name="post_trainer_sft",
        renderer_name=args.renderer,
        dataset_builder=FromConversationFileBuilder(
            file_path=args.data,
            common_config=ChatDatasetBuilderCommonConfig(
                model_name_for_tokenizer=args.model,
                renderer_name=args.renderer,
                max_length=args.max_length,
                batch_size=args.batch_size,
                train_on_what=renderers.TrainOnWhat.LAST_ASSISTANT_MESSAGE,
            ),
        ),
        learning_rate=args.lr,
        num_epochs=args.epochs,
        lora_rank=args.lora_rank,
        # Every save point is a candidate model we can measure, rather than a
        # point we merely passed through. Loss on this data falls fast enough
        # that the best model may well arrive mid-epoch, so checkpoint more
        # often than the epoch boundary and pick the winner by measurement.
        save_every=args.save_every or steps_per_epoch,
        eval_every=0,
    )

    await train.main(config)

    from tinker_cookbook import checkpoint_utils

    record = checkpoint_utils.get_last_checkpoint(str(run_dir), required_key="sampler_path")
    print(f"\nfinal checkpoint: {record.sampler_path if record else 'NONE'}")
    (run_dir / "post_trainer_checkpoint.json").write_text(
        json.dumps({"samplerPath": record.sampler_path, "baseModelId": args.model})
    )


if __name__ == "__main__":
    asyncio.run(main())
