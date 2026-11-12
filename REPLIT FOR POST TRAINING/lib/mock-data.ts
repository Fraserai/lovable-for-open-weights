import type { OpenModel } from "./types";

/**
 * Offline fallback catalog.
 *
 * This is no longer the primary source of models — `HuggingFaceModelProvider`
 * (see `lib/providers/model-provider.ts`) queries the real Hugging Face Hub.
 * This list only backs `MockModelProvider`, which `FallbackModelProvider`
 * falls back to if a Hugging Face request fails outright, so the picker
 * never dead-ends. IDs match real repos so the fallback still "flows
 * through" the app looking like a normal selection.
 */
export const MOCK_MODELS: OpenModel[] = [
  {
    id: "Qwen/Qwen2.5-7B-Instruct",
    name: "Qwen/Qwen2.5-7B-Instruct",
    family: "Qwen",
    parameterCount: "7B",
    description: "Fast, general-purpose model. A good default for most tasks.",
  },
  {
    id: "Qwen/Qwen2.5-32B-Instruct",
    name: "Qwen/Qwen2.5-32B-Instruct",
    family: "Qwen",
    parameterCount: "32B",
    description: "Higher-capability Qwen release for more demanding tasks.",
  },
  {
    id: "meta-llama/Llama-3.1-8B-Instruct",
    name: "meta-llama/Llama-3.1-8B-Instruct",
    family: "meta-llama",
    parameterCount: "8B",
    description: "Meta's widely-used open baseline. Fast and well documented.",
  },
  {
    id: "meta-llama/Llama-3.1-70B-Instruct",
    name: "meta-llama/Llama-3.1-70B-Instruct",
    family: "meta-llama",
    parameterCount: "70B",
    description: "Larger Llama variant with stronger reasoning ability.",
  },
  {
    id: "google/gemma-2-9b-it",
    name: "google/gemma-2-9b-it",
    family: "google",
    parameterCount: "9B",
    description: "Compact Google DeepMind model, efficient to post-train.",
  },
  {
    id: "google/gemma-2-27b-it",
    name: "google/gemma-2-27b-it",
    family: "google",
    parameterCount: "27B",
    description: "Larger Gemma release with improved general capability.",
  },
  {
    id: "deepseek-ai/DeepSeek-V2.5",
    name: "deepseek-ai/DeepSeek-V2.5",
    family: "deepseek-ai",
    parameterCount: "16B",
    description: "Mixture-of-experts model tuned for reasoning and code.",
  },
  {
    id: "mistralai/Mistral-7B-Instruct-v0.3",
    name: "mistralai/Mistral-7B-Instruct-v0.3",
    family: "mistralai",
    parameterCount: "7B",
    description: "Popular, efficient open baseline from Mistral AI.",
  },
];
