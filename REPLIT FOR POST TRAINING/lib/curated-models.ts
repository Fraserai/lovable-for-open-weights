import type { OpenModel } from "./types";

/**
 * The models Post Trainer can actually post-train.
 *
 * This list is NOT "the best open models" — it is exactly the set Tinker's
 * training service reports it supports, read live from
 * `ServiceClient().get_server_capabilities()` and cross-checked against the
 * Hugging Face Hub API for parameter counts, gated status, and downloads.
 * Every value here was verified against both; none is guessed.
 *
 * An earlier version of this file was built from a public "most intelligent
 * open models" benchmark chart instead. Ten of those sixteen models turned
 * out to be untrainable on Tinker — including the one sitting at the top of
 * the picker. Ranking by capability and listing by trainability are
 * different questions, and only the second one belongs here: everything in
 * this list must be something a run can actually complete.
 *
 * Ordered smallest-first, deliberately. Model size is the main driver of
 * what a run costs, so the cheapest option is the default first click and
 * the expensive ones take a scroll. (To re-order by capability instead,
 * reverse this array — nothing else depends on the ordering.)
 *
 * Keeping this in sync is manual for now. When Tinker adds or drops a
 * model this list goes stale silently, which is the main weakness of the
 * current approach — see README for the "read it live" follow-up.
 */
export const CURATED_MODELS: OpenModel[] = [
  { id: "meta-llama/Llama-3.2-3B", name: "meta-llama/Llama-3.2-3B", family: "meta-llama", parameterCount: "3.2B", downloads: 464843, gated: true, isBaseModel: true },
  { id: "Qwen/Qwen3.5-4B", name: "Qwen/Qwen3.5-4B", family: "Qwen", parameterCount: "4.7B", downloads: 7675840 },
  { id: "Qwen/Qwen3-8B", name: "Qwen/Qwen3-8B", family: "Qwen", parameterCount: "8.2B", downloads: 15796910 },
  { id: "Qwen/Qwen3.5-9B", name: "Qwen/Qwen3.5-9B", family: "Qwen", parameterCount: "9.7B", downloads: 13604767 },
  { id: "Qwen/Qwen3.5-9B-Base", name: "Qwen/Qwen3.5-9B-Base", family: "Qwen", parameterCount: "9.7B", downloads: 376648, isBaseModel: true },
  { id: "openai/gpt-oss-20b", name: "openai/gpt-oss-20b", family: "openai", parameterCount: "21.5B", downloads: 7682588 },
  { id: "Qwen/Qwen3.6-27B", name: "Qwen/Qwen3.6-27B", family: "Qwen", parameterCount: "27.8B", downloads: 6745154 },
  { id: "Qwen/Qwen3.8-27B", name: "Qwen/Qwen3.8-27B", family: "Qwen", parameterCount: "27.8B", downloads: 1006235 },
  { id: "Qwen/Qwen3-30B-A3B", name: "Qwen/Qwen3-30B-A3B", family: "Qwen", parameterCount: "30.5B", downloads: 2664072 },
  { id: "Qwen/Qwen3-30B-A3B-Instruct-2507", name: "Qwen/Qwen3-30B-A3B-Instruct-2507", family: "Qwen", parameterCount: "30.5B", downloads: 1824129 },
  { id: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16", name: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16", family: "nvidia", parameterCount: "31.6B", downloads: 1000729 },
  { id: "nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-BF16", name: "nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-BF16", family: "nvidia", parameterCount: "31.6B", downloads: 88402 },
  { id: "Qwen/Qwen3.5-35B-A3B-Base", name: "Qwen/Qwen3.5-35B-A3B-Base", family: "Qwen", parameterCount: "36B", downloads: 123632, isBaseModel: true },
  { id: "Qwen/Qwen3.6-35B-A3B", name: "Qwen/Qwen3.6-35B-A3B", family: "Qwen", parameterCount: "36B", downloads: 5663515 },
  { id: "openai/gpt-oss-120b", name: "openai/gpt-oss-120b", family: "openai", parameterCount: "116.8B", downloads: 4657776 },
  { id: "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16", name: "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16", family: "nvidia", parameterCount: "123.6B", downloads: 900617 },
  { id: "Qwen/Qwen3-235B-A22B-Instruct-2507", name: "Qwen/Qwen3-235B-A22B-Instruct-2507", family: "Qwen", parameterCount: "235.1B", downloads: 46745 },
  { id: "thinkingmachines/Inkling-Small", name: "thinkingmachines/Inkling-Small", family: "thinkingmachines", parameterCount: "266B", downloads: 108016 },
  { id: "Qwen/Qwen3.5-397B-A17B", name: "Qwen/Qwen3.5-397B-A17B", family: "Qwen", parameterCount: "403.4B", downloads: 270105 },
  { id: "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16", name: "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16", family: "nvidia", parameterCount: "560.5B", downloads: 443962 },
  { id: "deepseek-ai/DeepSeek-V3.1", name: "deepseek-ai/DeepSeek-V3.1", family: "deepseek-ai", parameterCount: "684.5B", downloads: 235540 },
  { id: "thinkingmachines/Inkling", name: "thinkingmachines/Inkling", family: "thinkingmachines", parameterCount: "952.4B", downloads: 125873 },
  { id: "moonshotai/Kimi-K2.6", name: "moonshotai/Kimi-K2.6", family: "moonshotai", parameterCount: "1T", downloads: 812240 },
];
