import "server-only";

import { spawn } from "node:child_process";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_MODEL, type ModelOption, type Trainer } from "./models";

// Trainer support lists come from the worker's catalog (live Fireworks + Tinker sources),
// cached on disk so the picker doesn't spawn Python on every open.
const ROOT = path.resolve(process.cwd(), "..");
const CACHE = path.join(ROOT, "data", "catalog.json");
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

type Entry = {
  trainer: "fireworks" | "tinker";
  trainer_model_id: string;
  display_name: string;
  hf_repo: string | null;
  params: number | null;
  train_context_tokens: number | null;
  sft_lora: boolean;
};

// Trainers the worker can run end to end today. Tinker joins once its train/fetch wiring lands.
const WIRED: Trainer[] = ["Fireworks"];

let refreshing: Promise<void> | null = null;

function refresh(): Promise<void> {
  refreshing ??= (async () => {
    await mkdir(path.dirname(CACHE), { recursive: true });
    await new Promise<void>((resolve, reject) => {
      const child = spawn("uv", ["run", "--directory", path.join(ROOT, "worker"), "trainloop", "catalog", "--json", CACHE]);
      const timer = setTimeout(() => { child.kill(); reject(new Error("catalog timed out")); }, 90_000);
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`catalog exited ${code}`));
      });
    });
  })().finally(() => { refreshing = null; });
  return refreshing;
}

async function readEntries(): Promise<Entry[]> {
  const fresh = await stat(CACHE).then((s) => Date.now() - s.mtimeMs < MAX_AGE_MS, () => false);
  if (!fresh) {
    // A stale cache beats no picker: fall back to it if the live refresh fails.
    await refresh().catch(() => {});
  }
  try {
    return JSON.parse(await readFile(CACHE, "utf8"));
  } catch {
    return [];
  }
}

const fmtParams = (n: number | null) =>
  !n ? null : n >= 1e12 ? `${(n / 1e12).toFixed(1).replace(/\.0$/, "")}T` : `${Math.round(n / 1e9)}B`;
const fmtCtx = (n: number | null) => (n ? `${Math.round(n / 1024)}K context` : null);

function toOption(e: Entry): ModelOption {
  const trainer: Trainer = e.trainer === "fireworks" ? "Fireworks" : "Tinker";
  return {
    id: e.trainer_model_id,
    name: e.display_name,
    trainer,
    hfRepo: e.hf_repo,
    note: [fmtParams(e.params), fmtCtx(e.train_context_tokens), "LoRA"].filter(Boolean).join(" · "),
    ready: WIRED.includes(trainer),
  };
}

/** Every model a connected trainer can fine-tune, ready ones first, the default at the top. */
export async function trainableModels(): Promise<ModelOption[]> {
  const options = (await readEntries()).filter((e) => e.sft_lora).map(toOption);
  if (!options.some((o) => o.id === DEFAULT_MODEL.id)) options.unshift(DEFAULT_MODEL);
  const rank = (o: ModelOption) => (o.id === DEFAULT_MODEL.id ? 0 : o.ready ? 1 : 2);
  return options.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export async function findTrainable(id: string): Promise<ModelOption | undefined> {
  return (await trainableModels()).find((m) => m.id === id);
}

/** Any open text model on Hugging Face, labelled with where (if anywhere) we can train it. */
export async function searchHub(query: string): Promise<ModelOption[]> {
  const url = new URL("https://huggingface.co/api/models");
  url.searchParams.set("search", query);
  url.searchParams.set("pipeline_tag", "text-generation");
  url.searchParams.set("sort", "downloads");
  url.searchParams.set("limit", "15");
  const headers: HeadersInit = process.env.HF_TOKEN ? { Authorization: `Bearer ${process.env.HF_TOKEN}` } : {};
  const res = await fetch(url, { headers, next: { revalidate: 3600 } });
  if (!res.ok) return [];
  const hits: { id: string; downloads?: number }[] = await res.json();

  const byRepo = new Map((await trainableModels()).filter((m) => m.hfRepo).map((m) => [m.hfRepo!.toLowerCase(), m]));
  return hits.map((h) => byRepo.get(h.id.toLowerCase()) ?? {
    id: `hf:${h.id}`,
    name: h.id,
    trainer: null,
    hfRepo: h.id,
    note: `${(h.downloads ?? 0).toLocaleString()} downloads`,
    ready: false,
  });
}
