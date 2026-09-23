// The live list comes from lib/catalog.ts (trainer support lists + Hugging Face search).
export type Trainer = "Fireworks" | "Tinker" | "Unsloth";

export type ModelOption = {
  id: string;
  name: string;
  trainer: Trainer | null; // null = on Hugging Face, but no connected trainer can fine-tune it yet
  hfRepo: string | null;
  note: string;
  ready: boolean; // the worker can train it end to end today
};

export const DEFAULT_MODEL: ModelOption = {
  id: "accounts/fireworks/models/glm-5p3-flash",
  name: "GLM 5.3 Flash",
  trainer: "Fireworks",
  hfRepo: "zai-org/GLM-5.3-Flash",
  note: "320B · 64K context · LoRA",
  ready: true,
};

// Matches what the worker can ingest today (worker/src/trainloop/ingest.py), plus ready-made datasets.
export const ACCEPTED_FILES = ".pdf,.docx,.pptx,.html,.md,.txt,.jsonl";
