// Static for now. Will come from the merged trainer catalog (worker catalog.py) later.
export type Trainer = "Fireworks" | "Tinker";

export type ModelOption = {
  id: string;
  name: string;
  maker: string;
  trainer: Trainer;
  note: string;
  ready: boolean; // wired end to end in the worker today
};

export const MODELS: ModelOption[] = [
  { id: "accounts/fireworks/models/glm-5p3-flash", name: "GLM-5.3-Flash", maker: "Zhipu", trainer: "Fireworks",
    note: "320B MoE · 18B active · LoRA", ready: true },
  { id: "glm-5.3", name: "GLM-5.3", maker: "Zhipu", trainer: "Tinker", note: "256K context · LoRA", ready: false },
  { id: "kimi-k2.6", name: "Kimi K2.6", maker: "Moonshot", trainer: "Tinker", note: "LoRA", ready: false },
  { id: "qwen-3.8", name: "Qwen 3.8", maker: "Alibaba", trainer: "Tinker", note: "LoRA", ready: false },
  { id: "nemotron-3", name: "Nemotron 3", maker: "NVIDIA", trainer: "Tinker", note: "LoRA", ready: false },
  { id: "gpt-oss", name: "gpt-oss", maker: "OpenAI", trainer: "Tinker", note: "LoRA", ready: false },
];

export const DEFAULT_MODEL = MODELS[0];

// Matches what the worker can ingest today (worker/src/trainloop/ingest.py), plus ready-made datasets.
export const ACCEPTED_FILES = ".pdf,.docx,.pptx,.html,.md,.txt,.jsonl";
