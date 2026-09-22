import "server-only";

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// The dev server runs from web/; the worker and runs/ folder sit beside it.
const ROOT = path.resolve(process.cwd(), "..");
const WORKER = path.join(ROOT, "worker");
const RUNS = path.join(ROOT, "runs");

// uv's editable install of the worker has broken before (it survived a folder move pointing at the
// old path). Naming the source directory outright means a bad install record can't take the app down.
const WORKER_ENV = { PYTHONPATH: path.join(WORKER, "src"), NO_COLOR: "1" };

// First pass keeps generator spend small; raise once the loop is proven.
const FIRST_PASS_CHUNKS = "20";

export type Stage = "waiting" | "running" | "done" | "failed";

export type TrainPlan = {
  trainer: "fireworks" | "tinker";
  base_model: string;
  examples: number;
  epochs: number;
  steps: number;
  tokens: number;
  lora_rank: number;
  est_cost: number | null;
  rate_per_million: number | null;
  ok: boolean;
  report: string[];
};

export type TrainProgress = {
  state: "waiting" | "running" | "done" | "failed";
  steps: number;
  totalSteps: number | null;
  error: string | null;
  hfRepo: string | null;
};

export type RunStatus = {
  id: string;
  status: "running" | "done" | "failed";
  stages: { read: Stage; write: Stage; check: Stage };
  train: TrainProgress;
  error: string | null;
  rows: number | null;
  estTokens: number | null;
  systemPrompt: string | null;
  sample: { user: string; assistant: string }[];
  report: string[];
};

type WebState = { status: RunStatus["status"]; exitCode: number | null; startedAt: string };

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

export async function startPrepare(id: string, goal: string, baseModel: string, files: File[]) {
  const dir = runDir(id);
  const uploads = path.join(dir, "uploads");
  await mkdir(uploads, { recursive: true });
  for (const f of files) {
    await writeFile(path.join(uploads, safeFileName(f.name)), Buffer.from(await f.arrayBuffer()));
  }

  const state: WebState = { status: "running", exitCode: null, startedAt: new Date().toISOString() };
  await writeFile(path.join(dir, "web.json"), JSON.stringify(state));

  const log = createWriteStream(path.join(dir, "prepare.log"));
  // Args array, no shell: user text can't be interpreted as a command.
  const child = spawn(
    "uv",
    ["run", "--directory", WORKER, "trainloop", "prepare", uploads, "--goal", goal, "--run", id,
     "--base-model", baseModel, "--max-chunks", FIRST_PASS_CHUNKS],
    { env: { ...process.env, ...WORKER_ENV, PYTHONUNBUFFERED: "1" } },
  );
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

/** Starts the paid training run in the background; progress is read back by getStatus. */
export async function startTraining(id: string): Promise<void> {
  const dir = runDir(id);
  const log = createWriteStream(path.join(dir, "train.log"), { flags: "a" });
  const child = spawn("uv", ["run", "--no-sync", "--directory", WORKER, "trainloop", "train", "--run", id, "--yes"],
    { env: { ...process.env, PYTHONUNBUFFERED: "1", NO_COLOR: "1" } });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.on("error", (e) => log.write(`\nCould not start the trainer: ${e.message}\n`));
}

async function trainProgress(dir: string, run: Record<string, unknown> | null): Promise<TrainProgress> {
  const jobState = typeof run?.job_state === "string" ? run.job_state : null;
  const plan = (run?.tinker_plan ?? {}) as { steps?: number };
  const metrics = await readOr(path.join(dir, "tinker", "logs", "metrics.jsonl"), (s) => s, "");
  const steps = metrics.split("\n").filter(Boolean).length;
  const state: TrainProgress["state"] =
    jobState === "JOB_STATE_COMPLETED" ? "done"
    : jobState === "JOB_STATE_FAILED" ? "failed"
    : jobState ? "running"
    : "waiting";
  return {
    state,
    steps,
    totalSteps: plan.steps ?? null,
    error: typeof run?.error === "string" ? run.error : null,
    hfRepo: typeof run?.hf_repo === "string" ? run.hf_repo : null,
  };
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
  const web = await readOr<WebState | null>(path.join(dir, "web.json"), JSON.parse, null);
  if (!web) return null;

  const lines = stripAnsi(await readOr(path.join(dir, "prepare.log"), (s) => s, "")).split("\n");
  const run = await readOr<Record<string, unknown> | null>(path.join(dir, "run.json"), JSON.parse, null);
  const sample = await readOr(path.join(dir, "train.jsonl"), (s) =>
    s.split("\n").filter(Boolean).slice(0, 3).map((line) => {
      const msgs = JSON.parse(line).messages as { role: string; content: string }[];
      return { user: msgs.find((m) => m.role === "user")?.content ?? "", assistant: msgs.find((m) => m.role === "assistant")?.content ?? "" };
    }), [] as { user: string; assistant: string }[]);

  const parsed = lines.some((l) => l.includes(" chunks -> "));
  const failed = web.status === "failed";
  const reportStart = lines.findIndex((l) => / rows valid, /.test(l));
  const report = reportStart >= 0 ? lines.slice(reportStart).filter((l) => /rows valid|ERROR|warn/.test(l)).slice(0, 12) : [];
  const reportHasErrors = report.some((l) => l.includes("ERROR"));

  const read: Stage = parsed ? "done" : failed ? "failed" : "running";
  const write: Stage = !parsed ? "waiting" : run ? "done" : failed ? "failed" : "running";
  const check: Stage = !run ? "waiting" : reportHasErrors ? "failed" : "done";

  return {
    id,
    status: web.status,
    stages: { read, write, check },
    train: await trainProgress(dir, run),
    error: failed ? lastError(lines) : null,
    rows: typeof run?.rows === "number" ? run.rows : null,
    estTokens: typeof run?.est_tokens === "number" ? run.est_tokens : null,
    systemPrompt: typeof run?.system_prompt === "string" ? run.system_prompt : null,
    sample,
    report,
  };
}
