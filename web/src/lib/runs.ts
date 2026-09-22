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

// First pass keeps generator spend small; raise once the loop is proven.
const FIRST_PASS_CHUNKS = "20";

export type Stage = "waiting" | "running" | "done" | "failed";

export type RunStatus = {
  id: string;
  status: "running" | "done" | "failed";
  stages: { read: Stage; write: Stage; check: Stage };
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
    { env: { ...process.env, PYTHONUNBUFFERED: "1", NO_COLOR: "1" } },
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
    error: failed ? lastError(lines) : null,
    rows: typeof run?.rows === "number" ? run.rows : null,
    estTokens: typeof run?.est_tokens === "number" ? run.est_tokens : null,
    systemPrompt: typeof run?.system_prompt === "string" ? run.system_prompt : null,
    sample,
    report,
  };
}
