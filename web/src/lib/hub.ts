import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { TRAINERS, type Trainer } from "./models";

const auth = (): HeadersInit => (process.env.HF_TOKEN ? { Authorization: `Bearer ${process.env.HF_TOKEN}` } : {});

export type DatasetHit = { id: string; downloads: number };

/** Hugging Face datasets matching `q`, most downloaded first; with no query, what's trending for text generation. */
export async function searchDatasets(q: string): Promise<DatasetHit[]> {
  const url = new URL("https://huggingface.co/api/datasets");
  if (q) {
    url.searchParams.set("search", q);
    url.searchParams.set("sort", "downloads");
  } else {
    url.searchParams.set("filter", "task_categories:text-generation");
    url.searchParams.set("sort", "trendingScore");
  }
  url.searchParams.set("limit", "12");
  const res = await fetch(url, { headers: auth(), next: { revalidate: 3600 } });
  if (!res.ok) return [];
  const hits: { id: string; downloads?: number }[] = await res.json();
  return hits.map((h) => ({ id: h.id, downloads: h.downloads ?? 0 }));
}

export type DatasetInfo = {
  splits: { config: string; split: string }[];
  /** The subset and split the preview rows come from */
  picked: { config: string; split: string };
  columns: string[];
  rows: Record<string, string>[];
  /** Question/answer columns the worker would pick on its own, if any (worker/src/trainloop/datasets.py) */
  guess: { user: string; assistant: string } | null;
  chat: boolean;
};

// Same pairs the worker recognises, so the preview agrees with what import will do.
const PAIRS = [
  ["instruction", "output"], ["instruction", "response"], ["prompt", "response"], ["prompt", "completion"],
  ["question", "answer"], ["issue", "decision"], ["input", "output"], ["query", "answer"],
];

const cell = (v: unknown) => (v == null ? "" : typeof v === "string" ? v : JSON.stringify(v)).slice(0, 400);

/** Subsets, splits, columns and the first rows, read through the dataset viewer (nothing downloaded). */
export async function datasetInfo(id: string, config?: string, split?: string): Promise<DatasetInfo> {
  const viewer = "https://datasets-server.huggingface.co";
  const res = await fetch(`${viewer}/splits?dataset=${encodeURIComponent(id)}`, { headers: auth(), next: { revalidate: 3600 } });
  if (!res.ok) throw new Error("Hugging Face can't preview this dataset (it may be gated, private or not in a table format).");
  const splits: { config: string; split: string }[] = ((await res.json()).splits ?? [])
    .map((s: { config: string; split: string }) => ({ config: s.config, split: s.split }));
  if (splits.length === 0) throw new Error("This dataset has no splits to train on.");
  const pick = splits.find((s) => s.config === config && s.split === split)
    ?? splits.find((s) => s.config === (config ?? splits[0].config) && s.split === "train")
    ?? splits[0];

  const rowsRes = await fetch(`${viewer}/first-rows?dataset=${encodeURIComponent(id)}&config=${encodeURIComponent(pick.config)}&split=${encodeURIComponent(pick.split)}`,
    { headers: auth(), next: { revalidate: 3600 } });
  if (!rowsRes.ok) throw new Error("Hugging Face couldn't show rows for this split.");
  const body = await rowsRes.json();
  const columns: string[] = (body.features ?? []).map((f: { name: string }) => f.name);
  const rows = (body.rows ?? []).slice(0, 5).map((r: { row: Record<string, unknown> }) =>
    Object.fromEntries(columns.map((c) => [c, cell(r.row[c])])));
  const lower = new Map(columns.map((c) => [c.toLowerCase(), c]));
  const pair = PAIRS.find(([u, a]) => lower.has(u) && lower.has(a));
  return {
    splits,
    picked: pick,
    columns,
    rows,
    guess: pair ? { user: lower.get(pair[0])!, assistant: lower.get(pair[1])! } : null,
    chat: ["messages", "conversations"].some((c) => lower.has(c)),
  };
}

/** Which trainers have keys set in the root .env. Names only; values never leave the server. */
export async function trainerStatus(): Promise<{ trainer: Trainer; connected: boolean }[]> {
  const env = await readFile(path.resolve(process.cwd(), "..", ".env"), "utf8").catch(() => "");
  const set = new Set(env.split("\n").map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*\S/)?.[1]).filter(Boolean));
  return (Object.keys(TRAINERS) as Trainer[]).map((t) => ({ trainer: t, connected: set.has(TRAINERS[t].env) }));
}
