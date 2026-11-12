import type { OpenModel, UploadedDataset } from "@/lib/types";

/**
 * What a run will cost, worked out before anything is spent.
 *
 * This exists because the tool once had no guardrail at all: uploading a file
 * immediately started training. During testing a single drag-and-drop kicked
 * off a 62,500-step job with no warning and no confirmation — caught at step 0,
 * but a customer would not have been so lucky.
 *
 * The guiding rule here is that a wrong number is worse than no number.
 *
 * An earlier version scaled one measured invoice by each model's active
 * parameter count. That was checked against Tinker's published price list on
 * 2026-08-20 and does not hold: it put Qwen3.5-397B-A17B at $2.68/M when the
 * real rate is $6.60/M, and Nemotron-3-Ultra at $8.68/M against a real $5.48/M
 * — wrong in both directions, by nearly 60% each way. Sparse models are cheap
 * to *run* and are not correspondingly cheap to *train*. Nothing is scaled by
 * model size any more; rates are either published or reported as unknown.
 */

/**
 * Tinker's published training rates, US dollars per million tokens.
 * Source: https://tinker-docs.thinkingmachines.ai/tinker/models/
 *
 * Verified 2026-08-20. Tinker changes these (Qwen3-8B went $0.40 -> $0.44 on
 * 2026-07-17), so re-check the page rather than trusting this table forever.
 *
 * Where a model ships several context-window variants, this is the base/
 * shortest one — the variant `tinker_runner.py` actually trains. The long
 * context builds cost substantially more (Qwen3.8-27B is $4.103 at 64K and
 * $7.46 at 256K), so a model trained at long context will cost more than
 * quoted here.
 */
const PUBLISHED_RATE_PER_MILLION: Readonly<Record<string, number>> = {
  "Qwen/Qwen3.5-4B": 0.737,
  "Qwen/Qwen3-8B": 0.44,
  "Qwen/Qwen3.5-9B": 1.463,
  "Qwen/Qwen3.5-9B-Base": 1.463,
  "Qwen/Qwen3.5-35B-A3B-Base": 1.177,
  "Qwen/Qwen3.6-35B-A3B": 1.177,
  "Qwen/Qwen3.6-27B": 4.103,
  "Qwen/Qwen3.8-27B": 4.103,
  "Qwen/Qwen3.5-397B-A17B": 6.6,
  "moonshotai/Kimi-K2.6": 4.84,
  "deepseek-ai/DeepSeek-V3.1": 3.718,
  "thinkingmachines/Inkling": 5.61,
  "thinkingmachines/Inkling-Small": 1.73,
  "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16": 5.478,
  "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16": 1.276,
  "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16": 0.44,
  "nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-BF16": 0.44,
  "openai/gpt-oss-120b": 0.737,
  "openai/gpt-oss-20b": 0.396,
};

/**
 * Cross-check, not an input. A real Tinker invoice on 2026-08-20 billed $0.13
 * for 175,240 training tokens on Qwen3.5-4B — $0.742/M against the $0.737/M
 * published above, a 0.6% agreement. If that ever drifts far, the published
 * table has moved and this file is stale.
 */
export const INVOICE_CROSSCHECK = {
  modelId: "Qwen/Qwen3.5-4B",
  dollars: 0.13,
  tokens: 175_240,
  ratePerMillion: (0.13 / 175_240) * 1e6,
} as const;

/** Measured on the 1,822-example run: 455 steps in ~18 minutes, on the 4B. */
const MEASURED_SECONDS_PER_STEP = 2.4;
const SPEED_MEASURED_ON = "Qwen/Qwen3.5-4B";

/** Rough conversion for English text. Only ever used for an estimate. */
const CHARS_PER_TOKEN = 4;

/** Mirrors BATCH_SIZE / NUM_EPOCHS in services/tinker-bridge/app/tinker_runner.py. */
const BATCH_SIZE = 4;
const NUM_EPOCHS = 1;

export interface RunEstimate {
  examples: number;
  examplesEstimated: boolean;
  steps: number;
  tokens: number;
  /** Null unless we've measured this model's speed. Rate and speed are separate unknowns. */
  minutes: number | null;
  /** Null when Tinker publishes no rate for this model — better than a made-up number. */
  cost: number | null;
  /** How much to trust `cost`. */
  confidence: "published" | "unknown";
  /** Tinker's list price per million training tokens, or null if unpublished. */
  ratePerMillion: number | null;
}

/** Tinker's published training rate for a model, or null if it doesn't list one. */
export function publishedRateFor(model: OpenModel): number | null {
  return PUBLISHED_RATE_PER_MILLION[model.id] ?? null;
}

export function estimateRun(model: OpenModel, dataset: UploadedDataset): RunEstimate {
  const examples = dataset.rowCount ?? Math.max(1, Math.round(dataset.sizeBytes / 800));
  const tokens = Math.round((dataset.sizeBytes / CHARS_PER_TOKEN) * NUM_EPOCHS);
  const steps = Math.max(1, Math.floor(examples / BATCH_SIZE) * NUM_EPOCHS);
  const ratePerMillion = publishedRateFor(model);

  // Speed and price are measured independently. We know what every listed model
  // costs, but only how fast one of them runs, so most runs quote a price and
  // decline to quote a duration.
  const minutes =
    model.id === SPEED_MEASURED_ON
      ? Math.max(1, Math.round((steps * MEASURED_SECONDS_PER_STEP) / 60))
      : null;

  return {
    examples,
    examplesEstimated: dataset.rowCountEstimated === true,
    steps,
    tokens,
    minutes,
    cost: ratePerMillion === null ? null : (tokens / 1e6) * ratePerMillion,
    confidence: ratePerMillion === null ? "unknown" : "published",
    ratePerMillion,
  };
}

export function formatCost(cost: number): string {
  if (cost < 0.01) return "under 1¢";
  if (cost < 1) return `${Math.round(cost * 100)}¢`;
  if (cost < 100) return `$${cost.toFixed(2)}`;
  return `$${Math.round(cost).toLocaleString()}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `~${minutes} min`;
  const hours = minutes / 60;
  if (hours < 10) return `~${hours.toFixed(1)} hr`;
  return `~${Math.round(hours)} hr`;
}
