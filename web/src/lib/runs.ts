import "server-only";

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { toWorker, type Settings } from "./settings";

// The dev server runs from web/; the worker and runs/ folder sit beside it.
const ROOT = path.resolve(process.cwd(), "..");
const WORKER = path.join(ROOT, "worker");
const RUNS = path.join(ROOT, "runs");

// Belt and braces: after the project moved folders, macOS "hidden" flags stopped Python loading the
// worker's editable install (fixed in worker/pyproject.toml). Naming the source directory outright
// means a broken install record can't take the app down again.
const WORKER_ENV = { PYTHONPATH: path.join(WORKER, "src"), NO_COLOR: "1" };

const MAX_POINTS = 400;

// First pass keeps generator spend small; raise once the loop is proven.
const FIRST_PASS_CHUNKS = "20";

export type Stage = "waiting" | "running" | "done" | "failed";

export type TrainPlan = {
  trainer: "fireworks" | "tinker" | "unsloth";
  base_model: string;
  examples: number;
  epochs: number;
  steps: number;
  tokens: number;
  lora_rank: number;
  learning_rate: number | null;
  batch_size: number;
  grad_accum: number;
  lr_scheduler: string | null;
  max_length?: number | null;
  /** Settings the chosen trainer can't honour (worker settings.split) */
  ignored: string[];
  est_cost: number | null;
  rate_per_million: number | null;
  // Unsloth: a rented GPU billed by the second; the job's time limit caps the bill at max_cost
  gpu?: string;
  per_hour?: number;
  max_cost?: number;
  ok: boolean;
  report: string[];
};

export type TrainProgress = {
  state: "waiting" | "running" | "done" | "failed";
  steps: number;
  totalSteps: number | null;
  error: string | null;
  hfRepo: string | null;
  handback: "idle" | "running" | "failed";
  canChat: boolean;
  epochs: number | null;
  loraRank: number | null;
  jobUrl: string | null;
  /** One point per logged step, thinned to at most MAX_POINTS for the charts. */
  metrics: { step: number; loss: number; lr: number | null }[];
  elapsedSec: number | null;
};


/** A dataset on the Hugging Face Hub, imported as-is (no generator). */
export type HubSource = {
  id: string; config?: string; split?: string; limit: number; userField?: string; assistantField?: string;
};

export type RunSummary = {
  id: string; goal: string | null; baseModel: string | null; rows: number | null;
  state: "preparing" | "ready" | "training" | "trained" | "failed"; updated: number;
  /** Training was started (drafts that were only checked are not) */
  started: boolean;
};

export type RunStatus = {
  id: string;
  goal: string | null;
  baseModel: string | null;
  source: "documents" | "dataset";
  /** The Hub dataset or file the examples came from, when imported as-is */
  sourceLabel: string | null;
  /** How the examples were imported (dataset runs): Hub id, subset, split, row limit, column mapping */
  sourceInfo: { hf: string | null; config: string | null; split: string | null; limit: number | null } | null;
  files: { name: string; size: number }[];
  status: "running" | "done" | "failed";
  stages: { read: Stage; write: Stage; check: Stage };
  train: TrainProgress;
  error: string | null;
  rows: number | null;
  estTokens: number | null;
  systemPrompt: string | null;
  sample: { user: string; assistant: string }[];
  report: string[];
  settings: Settings;
};

// goal/baseModel: known before the worker writes run.json, so a preparing run can be shown
type WebState = { status: RunStatus["status"]; exitCode: number | null; startedAt: string; goal?: string; baseModel?: string };

const ID = /^[a-z0-9][a-z0-9-]{1,40}$/;

export function runDir(id: string) {
  if (!ID.test(id)) throw new Error("bad run id");
  return path.join(RUNS, id);
}

export function newRunId(goal: string) {
  const slug = goal.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "");
  return `${slug || "run"}-${randomBytes(3).toString("hex")}`;
}

export function safeFileName(name: string) {
  const base = path.basename(name).replace(/[^\w.\- ]+/g, "_").trim();
  return base && !base.startsWith(".") ? base : `upload-${randomBytes(3).toString("hex")}`;
}

export async function startPrepare(id: string, goal: string, baseModel: string, files: File[], hub?: HubSource) {
  const dir = runDir(id);
  const uploads = path.join(dir, "uploads");
  await mkdir(uploads, { recursive: true });
  for (const f of files) {
    await writeFile(path.join(uploads, safeFileName(f.name)), Buffer.from(await f.arrayBuffer()));
  }

  const state: WebState = { status: "running", exitCode: null, startedAt: new Date().toISOString(), goal, baseModel };
  await writeFile(path.join(dir, "web.json"), JSON.stringify(state));

  // A ready-made dataset trains as-is; documents have to be read and turned into examples first.
  const datasets = files.filter((f) => f.name.toLowerCase().endsWith(".jsonl"));
  const common = ["--run", id, "--goal", goal, "--base-model", baseModel];
  const args = hub
    ? ["dataset", ...common, "--hf", hub.id, "--limit", String(hub.limit),
       ...(hub.config ? ["--config", hub.config] : []), ...(hub.split ? ["--split", hub.split] : []),
       ...(hub.userField && hub.assistantField ? ["--user-field", hub.userField, "--assistant-field", hub.assistantField] : [])]
    : datasets.length === files.length
    ? ["dataset", ...common, "--file", path.join(uploads, safeFileName(datasets[0].name))]
    : ["prepare", uploads, ...common, "--max-chunks", FIRST_PASS_CHUNKS];

  const log = createWriteStream(path.join(dir, "prepare.log"));
  // Args array, no shell: user text can't be interpreted as a command.
  const child = spawn("uv", ["run", "--no-sync", "--directory", WORKER, "trainloop", ...args],
    { env: { ...process.env, ...WORKER_ENV, PYTHONUNBUFFERED: "1" } });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  const finish = (code: number | null) => {
    state.status = code === 0 ? "done" : "failed";
    state.exitCode = code;
    writeFile(path.join(dir, "web.json"), JSON.stringify(state)).catch(() => {});
  };
  child.on("error", (e) => { log.write(`\nCould not start the worker: ${e.message}\n`); finish(-1); });
  child.on("close", finish);
}

/** Runs a worker command, returning its stdout. Used for the free planning step. */
function worker(args: string[], timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("uv", ["run", "--no-sync", "--directory", WORKER, "trainloop", ...args],
      { env: { ...process.env, ...WORKER_ENV } });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => { child.kill(); reject(new Error("worker timed out")); }, timeoutMs);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(stripAnsi(err || out).trim().split("\n").pop() || `worker exited ${code}`));
    });
  });
}

/** What training would cost and how it would run. Spends nothing. */
export async function getPlan(id: string): Promise<TrainPlan> {
  runDir(id);
  return JSON.parse(await worker(["plan", "--run", id, "--json"]));
}

/** Sets the model and the Parameters card's settings on a prepared run, then returns the new plan. Spends nothing. */
export async function configure(id: string, baseModel: string, settings: Settings): Promise<TrainPlan> {
  runDir(id);
  await worker(["configure", "--run", id, "--base-model", baseModel, "--json", JSON.stringify(toWorker(settings))]);
  return getPlan(id);
}

/** Removes a run that never started training (a dataset picked, then replaced). */
export async function deleteDraft(id: string): Promise<boolean> {
  const dir = runDir(id);
  const run = await readOr<Record<string, unknown> | null>(path.join(dir, "run.json"), JSON.parse, null);
  if (run?.job_state || run?.job) return false;
  await rm(dir, { recursive: true, force: true });
  return true;
}

/** Starts the paid training run in the background; progress is read back by getStatus. */
export async function startTraining(id: string): Promise<void> {
  const dir = runDir(id);
  const log = createWriteStream(path.join(dir, "train.log"), { flags: "a" });
  const child = spawn("uv", ["run", "--no-sync", "--directory", WORKER, "trainloop", "train", "--run", id, "--yes"],
    { env: { ...process.env, ...WORKER_ENV, PYTHONUNBUFFERED: "1" } });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.on("error", (e) => log.write(`\nCould not start the trainer: ${e.message}\n`));
}

async function trainProgress(dir: string, run: Record<string, unknown> | null): Promise<TrainProgress> {
  const jobState = typeof run?.job_state === "string" ? run.job_state : null;
  const unsloth = run?.job === "unsloth";
  const plan = ((unsloth ? run?.unsloth_plan : run?.tinker_plan) ?? {}) as { steps?: number; epochs?: number; lora_rank?: number };
  const metricsFile = unsloth ? path.join(dir, "unsloth", "metrics.jsonl") : path.join(dir, "tinker", "logs", "metrics.jsonl");
  const lines = (await readOr(metricsFile, (s) => s, "")).split("\n").filter(Boolean);
  const steps = lines.length;
  const points = lines.flatMap((l) => {
    try {
      const m = JSON.parse(l);
      // Tinker logs mean per-token loss as train_mean_nll; Unsloth logs the trainer's loss
      const loss = m.train_mean_nll ?? m.loss;
      return typeof loss === "number" ? [{ step: m.step as number, loss, lr: m.learning_rate ?? null, sec: m["time/step"] ?? null }] : [];
    } catch {
      return [];
    }
  });
  const stride = Math.ceil(points.length / MAX_POINTS);
  const secs = points.map((p) => p.sec).filter((x): x is number => typeof x === "number");
  const state: TrainProgress["state"] =
    jobState === "JOB_STATE_COMPLETED" ? "done"
    : jobState === "JOB_STATE_FAILED" ? "failed"
    : jobState ? "running"
    : "waiting";
  const hfRepo = typeof run?.hf_repo === "string" ? run.hf_repo : null;
  const fetch = await readOr<{ status: "running" | "done" | "failed" } | null>(path.join(dir, "fetch.json"), JSON.parse, null);
  return {
    state,
    steps,
    totalSteps: plan.steps ?? null,
    error: typeof run?.error === "string" ? run.error : null,
    hfRepo,
    handback: hfRepo ? "idle" : fetch?.status === "running" ? "running" : fetch?.status === "failed" ? "failed" : "idle",
    canChat: state === "done" && run?.job === "tinker",
    epochs: typeof run?.epochs === "number" ? run.epochs : (plan as { epochs?: number }).epochs ?? null,
    loraRank: typeof run?.lora_rank === "number" ? run.lora_rank : (plan as { lora_rank?: number }).lora_rank ?? null,
    jobUrl: typeof run?.job_url === "string" ? run.job_url : null,
    metrics: points.filter((_, i) => i % stride === 0 || i === points.length - 1).map(({ step, loss, lr }) => ({ step, loss, lr })),
    elapsedSec: secs.length ? Math.round(secs.reduce((a, b) => a + b, 0)) : null,
  };
}

/** Ask the original and the trained model the same question (Tinker runs). */
export async function chat(id: string, message: string): Promise<{ original: string; trained: string }> {
  runDir(id);
  return JSON.parse(await worker(["chat", "--run", id, "--message", message, "--json"], 300_000));
}

/** Download the trained model and publish it to a private repo on the user's Hugging Face account. */
export async function startFetch(id: string): Promise<void> {
  const dir = runDir(id);
  await writeFile(path.join(dir, "fetch.json"), JSON.stringify({ status: "running" }));
  const log = createWriteStream(path.join(dir, "fetch.log"));
  const child = spawn("uv", ["run", "--no-sync", "--directory", WORKER, "trainloop", "fetch", "--run", id, "--hf-repo", "auto"],
    { env: { ...process.env, ...WORKER_ENV, PYTHONUNBUFFERED: "1" } });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  const done = (code: number | null) =>
    writeFile(path.join(dir, "fetch.json"), JSON.stringify({ status: code === 0 ? "done" : "failed" })).catch(() => {});
  child.on("error", () => done(-1));
  child.on("close", done);
}

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

async function readOr<T>(file: string, parse: (s: string) => T, fallback: T): Promise<T> {
  try {
    return parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

// Turn a Python traceback's last line into something a person can act on.
function lastError(lines: string[]) {
  const last = [...lines].reverse().find((l) => l.trim() && !l.startsWith(" "));
  if (!last) return "The worker stopped unexpectedly.";
  return last.replace(/^[\w.]+(Error|Exception|Config|Exit)\b:\s*/, "").trim();
}

export async function getStatus(id: string): Promise<RunStatus | null> {
  const dir = runDir(id);
  const run = await readOr<Record<string, unknown> | null>(path.join(dir, "run.json"), JSON.parse, null);
  const web = await readOr<WebState | null>(path.join(dir, "web.json"), JSON.parse, null)
    ?? (run ? { status: "done" as const, exitCode: 0, startedAt: "" } : null);
  if (!web) return null;

  const lines = stripAnsi(await readOr(path.join(dir, "prepare.log"), (s) => s, "")).split("\n");
  const uploads = await readdir(path.join(dir, "uploads")).catch(() => [] as string[]);
  const files = await Promise.all(uploads.map(async (name) =>
    ({ name, size: await stat(path.join(dir, "uploads", name)).then((s) => s.size, () => 0) })));
  const sample = await readOr(path.join(dir, "train.jsonl"), (s) =>
    s.split("\n").filter(Boolean).slice(0, 3).map((line) => {
      const msgs = JSON.parse(line).messages as { role: string; content: string }[];
      return { user: msgs.find((m) => m.role === "user")?.content ?? "", assistant: msgs.find((m) => m.role === "assistant")?.content ?? "" };
    }), [] as { user: string; assistant: string }[]);

  const fromDataset = lines.some((l) => / rows from /.test(l));
  const parsed = fromDataset || !!run || lines.some((l) => l.includes(" chunks -> "));
  const failed = web.status === "failed";
  const reportStart = lines.findIndex((l) => / rows valid, /.test(l));
  const report = reportStart >= 0 ? lines.slice(reportStart).filter((l) => /rows valid|ERROR|warn/.test(l)).slice(0, 12) : [];
  const reportHasErrors = report.some((l) => l.includes("ERROR"));

  const read: Stage = parsed ? "done" : failed ? "failed" : "running";
  const write: Stage = !parsed ? "waiting" : run ? "done" : failed ? "failed" : "running";
  const check: Stage = !run ? "waiting" : reportHasErrors ? "failed" : "done";

  return {
    id,
    goal: typeof run?.goal === "string" ? run.goal : web.goal ?? null,
    baseModel: typeof run?.base_model === "string" ? run.base_model : web.baseModel ?? null,
    source: fromDataset || (run && typeof run.source === "object") ? "dataset" : "documents",
    sourceLabel: (() => {
      const src = run?.source as { hf?: string | null; file?: string | null } | undefined;
      return src?.hf ?? (src?.file ? path.basename(src.file) : null);
    })(),
    files,
    status: web.status,
    stages: { read, write, check },
    train: await trainProgress(dir, run),
    error: failed ? lastError(lines) : null,
    rows: typeof run?.rows === "number" ? run.rows : null,
    estTokens: typeof run?.est_tokens === "number" ? run.est_tokens : null,
    systemPrompt: typeof run?.system_prompt === "string" ? run.system_prompt : null,
    sample,
    report,
    settings: {
      // Saved before settings lived under "settings" (worker settings.load folds these in the same way)
      ...(typeof run?.train_epochs === "number" ? { epochs: run.train_epochs } : {}),
      ...(typeof run?.train_lora_rank === "number" ? { lora_rank: run.train_lora_rank } : {}),
      ...(typeof run?.learning_rate === "number" ? { learning_rate: run.learning_rate } : {}),
      ...((run?.settings ?? {}) as Settings),
    },
    sourceInfo: run && typeof run.source === "object" && run.source
      ? (({ hf, config, split, limit }) => ({ hf, config, split, limit }))(run.source as Record<string, never>)
      : null,
  };
}

/** Every run, newest first, for History and the sidebar. */
export async function listRuns(): Promise<RunSummary[]> {
  const names = await readdir(RUNS).catch(() => [] as string[]);
  const all = await Promise.all(names.filter((n) => ID.test(n)).map(async (id): Promise<RunSummary | null> => {
    const dir = path.join(RUNS, id);
    const run = await readOr<Record<string, unknown> | null>(path.join(dir, "run.json"), JSON.parse, null);
    const web = await readOr<WebState | null>(path.join(dir, "web.json"), JSON.parse, null);
    if (!run && !web) return null;
    const updated = await stat(path.join(dir, run ? "run.json" : "web.json")).then((s) => s.mtimeMs, () => 0);
    const job = typeof run?.job_state === "string" ? run.job_state : null;
    const state: RunSummary["state"] =
      job === "JOB_STATE_COMPLETED" ? "trained" : job === "JOB_STATE_FAILED" ? "failed" : job ? "training"
      : run ? "ready" : web?.status === "failed" ? "failed" : "preparing";
    return {
      id, updated, state, started: !!job,
      goal: typeof run?.goal === "string" ? run.goal : web?.goal ?? null,
      baseModel: typeof run?.base_model === "string" ? run.base_model : web?.baseModel ?? null,
      rows: typeof run?.rows === "number" ? run.rows : null,
    };
  }));
  return all.filter((r): r is RunSummary => r !== null).sort((a, b) => b.updated - a.updated);
}
