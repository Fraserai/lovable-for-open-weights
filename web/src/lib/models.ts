// The live list comes from lib/catalog.ts (trainer support lists + Hugging Face search).
export type Trainer = "Fireworks" | "Tinker" | "Unsloth";

export type ModelOption = {
  id: string;
  name: string;
  trainer: Trainer | null; // null = on Hugging Face, but no connected trainer can fine-tune it yet
  hfRepo: string | null;
  note: string;
  ready: boolean; // the worker can train it end to end today
  size?: string | null; // "4B", "1T"
};

export const DEFAULT_MODEL: ModelOption = {
  id: "accounts/fireworks/models/glm-5p3-flash",
  name: "GLM 5.3 Flash",
  trainer: "Fireworks",
  hfRepo: "zai-org/GLM-5.3-Flash",
  note: "320B · 64K context · LoRA",
  ready: true,
  size: "320B",
};

/** What each trainer is, in the Run preview's words. Where training runs is what regulated customers ask first. */
export const TRAINERS: Record<Trainer, { label: string; runsOn: string; billing: string; env: string }> = {
  Tinker: {
    label: "Tinker",
    runsOn: "Thinking Machines cloud (US)",
    billing: "per training token",
    env: "TINKER_API_KEY",
  },
  Fireworks: {
    label: "Fireworks",
    runsOn: "Fireworks cloud (training region not selectable)",
    billing: "per training token",
    env: "FIREWORKS_API_KEY",
  },
  Unsloth: {
    label: "Hugging Face",
    runsOn: "A GPU on your Hugging Face account",
    billing: "per second of GPU time",
    env: "HF_TOKEN",
  },
};

/** The same open model can be tunable on several trainers; the picker shows it once with each as an option. */
export const modelKey = (m: ModelOption) => (m.hfRepo ?? m.id).toLowerCase();

// Matches what the worker can ingest today (worker/src/trainloop/ingest.py), plus ready-made datasets.
export const ACCEPTED_FILES = ".pdf,.docx,.pptx,.html,.md,.txt,.jsonl";
