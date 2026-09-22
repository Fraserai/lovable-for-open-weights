"use client";

import { useEffect, useState } from "react";
import { BRAND } from "@/lib/brand";
import type { RunStatus, Stage } from "@/lib/runs";
import type { Brief } from "./Composer";
import { formatBytes } from "./Composer";
import { Check, Doc, Logo } from "./icons";

// The loop the worker runs (worker/src/trainloop), in the words a customer would use.
const STAGES = [
  { key: "read", title: "Read your documents", detail: "Pull the text, headings and tables out of every file." },
  { key: "write", title: "Write training examples", detail: "Turn each section into realistic questions and ideal answers for your goal." },
  { key: "check", title: "Check every example", detail: "Catch broken or duplicate rows before anything is paid for." },
  { key: "train", title: "Train", detail: "Fine-tune the base model on your examples." },
  { key: "handback", title: "Hand back your model", detail: "Download it, or get it in a private Hugging Face repo." },
] as const;

const STAGE_LABEL: Record<Stage, string> = { waiting: "Waiting", running: "Working…", done: "Done", failed: "Stopped" };

export default function Studio({ brief, onReset }: { brief: Brief; onReset: () => void }) {
  const { goal, files, model } = brief;
  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<RunStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Poll the run while the worker is busy
  useEffect(() => {
    if (!runId) return;
    let alive = true;
    const tick = async () => {
      const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
      if (!alive || !res.ok) return;
      const next: RunStatus = await res.json();
      setRun(next);
      if (next.status === "running") setTimeout(tick, 1500);
    };
    tick();
    return () => { alive = false; };
  }, [runId]);

  const start = async () => {
    setStarting(true);
    setStartError(null);
    const form = new FormData();
    form.set("goal", goal);
    form.set("model", model.id);
    files.forEach((f) => form.append("files", f));
    try {
      const res = await fetch("/api/runs", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not start.");
      setRunId(body.id);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "Could not start.");
    } finally {
      setStarting(false);
    }
  };

  const stageOf = (key: (typeof STAGES)[number]["key"]): Stage =>
    run && (key === "read" || key === "write" || key === "check") ? run.stages[key] : "waiting";
  const busy = starting || run?.status === "running";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-6">
        <button type="button" onClick={onReset} className="flex items-center gap-2 rounded-lg" aria-label="Back to start">
          <Logo className="size-6" />
          <span className="font-display text-lg font-bold tracking-tight">{BRAND.name}</span>
        </button>
        <span className="text-faint">/</span>
        <span className="truncate text-sm text-muted">{runId ?? "New model"}</span>
      </header>

      <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* Chat */}
        <section className="flex flex-col gap-6 px-4 py-8 sm:px-8" aria-label="Conversation" aria-live="polite">
          <div className="ml-auto max-w-[560px] rounded-3xl rounded-br-lg bg-ink px-5 py-4 text-ground">
            <p className="leading-relaxed whitespace-pre-wrap">{goal}</p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {files.map((f) => (
                <li key={f.name + f.size} className="flex items-center gap-1.5 rounded-lg bg-ground/10 px-2 py-1 text-xs">
                  <Doc className="size-3.5" /> {f.name}
                </li>
              ))}
            </ul>
          </div>

          <Assistant>
            <p>
              Got it. Here&apos;s the plan for training <b>{model.name}</b> on your{" "}
              {files.length === 1 ? "document" : `${files.length} documents`} ({formatBytes(totalBytes)}).
            </p>
            <ol className="list-decimal space-y-1.5 pl-5 marker:text-faint">
              {STAGES.map((s) => (
                <li key={s.key}><b className="font-medium">{s.title}.</b> <span className="text-muted">{s.detail}</span></li>
              ))}
            </ol>
            <p className="text-muted">
              First I&apos;ll write a sample of training examples from up to 20 sections so you can check them.
              Nothing gets trained or paid for on Fireworks until you say so. Your documents only go to providers that don&apos;t keep data.
            </p>
            {!runId && (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button type="button" onClick={start} disabled={starting}
                        className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-ground transition hover:opacity-90 disabled:opacity-40">
                  {starting ? "Uploading…" : "Write training examples"}
                </button>
                {startError && <span className="text-sm text-red-600 dark:text-red-400">{startError}</span>}
              </div>
            )}
          </Assistant>

          {run?.status === "running" && (
            <Assistant>
              <p className="flex items-center gap-2 text-muted">
                <span className="size-2 animate-pulse rounded-full bg-accent" />
                {run.stages.read !== "done" ? "Reading your documents…" : "Writing training examples…"}
              </p>
            </Assistant>
          )}

          {run?.status === "failed" && (
            <Assistant>
              <p>That stopped before it finished:</p>
              <p className="rounded-xl border border-red-300/60 bg-red-50 px-4 py-3 font-mono text-sm text-red-800 dark:border-red-400/30 dark:bg-red-950/40 dark:text-red-200">
                {run.error}
              </p>
              {run.error?.includes("is not set") && (
                <p className="text-muted">The API keys go in a <code className="font-mono text-sm">.env</code> file at the project root (copy <code className="font-mono text-sm">.env.example</code>). Then try again.</p>
              )}
              <button type="button" onClick={() => { setRunId(null); setRun(null); }}
                      className="rounded-full border border-line px-4 py-2 text-sm transition hover:bg-surface">Try again</button>
            </Assistant>
          )}

          {run?.status === "done" && (
            <Assistant>
              <p>
                I wrote <b>{run.rows?.toLocaleString()}</b> training examples (about {run.estTokens?.toLocaleString()} tokens)
                {run.stages.check === "done" ? " and they all passed the checks." : ", but some failed the checks:"}
              </p>
              {run.stages.check !== "done" && (
                <pre className="overflow-x-auto rounded-xl bg-ink/5 p-3 font-mono text-xs">{run.report.join("\n")}</pre>
              )}
              {run.sample.length > 0 && (
                <>
                  <p className="text-muted">Here are a few, so you can judge the tone and accuracy:</p>
                  <div className="space-y-3">
                    {run.sample.map((ex, i) => (
                      <figure key={i} className="rounded-2xl border border-line bg-surface p-4 text-sm">
                        <p className="font-medium">{ex.user}</p>
                        <p className="mt-2 whitespace-pre-wrap text-muted">{ex.assistant}</p>
                      </figure>
                    ))}
                  </div>
                </>
              )}
              {run.systemPrompt && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted">The instructions your model will be trained with</summary>
                  <p className="mt-2 rounded-xl border border-line bg-surface p-3">{run.systemPrompt}</p>
                </details>
              )}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button type="button" disabled title="Starting paid training from here is the next build step"
                        className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-ground disabled:opacity-40">
                  Review cost and train
                </button>
                <span className="text-sm text-faint">
                  For now, train from the terminal: <code className="font-mono">trainloop train --run {run.id}</code>
                </span>
              </div>
            </Assistant>
          )}
        </section>

        {/* Run panel */}
        <aside className="border-t border-line bg-surface px-4 py-8 sm:px-8 lg:border-t-0 lg:border-l" aria-label="Your model">
          <p className="text-xs font-medium tracking-wide text-faint uppercase">Your model</p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">{model.name}, tuned for your goal</h2>

          <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
            <div><dt className="text-faint">Base model</dt><dd className="mt-0.5 font-medium">{model.name}</dd></div>
            <div><dt className="text-faint">Trainer</dt><dd className="mt-0.5 font-medium">{model.trainer}</dd></div>
            <div><dt className="text-faint">Method</dt><dd className="mt-0.5 font-medium">LoRA, rank 8</dd></div>
            <div><dt className="text-faint">Passes over data</dt><dd className="mt-0.5 font-medium">1 epoch</dd></div>
          </dl>

          <ol className="mt-8" aria-label="Progress">
            {STAGES.map((s, i) => {
              const st = stageOf(s.key);
              return (
                <li key={s.key} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < STAGES.length - 1 && <span className="absolute top-7 left-[13px] h-[calc(100%-28px)] w-px bg-line" aria-hidden />}
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full border text-xs tabular-nums transition ${
                    st === "done" ? "border-accent bg-accent text-surface"
                    : st === "running" ? "border-accent text-accent"
                    : st === "failed" ? "border-red-400 text-red-500"
                    : "border-line bg-ground text-faint"}`}>
                    {st === "done" ? <Check className="size-3.5" /> : st === "running"
                      ? <span className="size-2 animate-pulse rounded-full bg-accent" /> : i + 1}
                  </span>
                  <div className="pt-0.5">
                    <p className={`font-medium ${st === "waiting" ? "text-muted" : ""}`}>{s.title}</p>
                    <p className={`text-sm ${st === "failed" ? "text-red-500" : "text-faint"}`}>{STAGE_LABEL[st]}</p>
                  </div>
                </li>
              );
            })}
          </ol>
          {busy && <p className="mt-6 text-xs text-faint">You can leave this page open. It updates by itself.</p>}
        </aside>
      </div>
    </div>
  );
}

function Assistant({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex max-w-[680px] gap-3">
      <Logo className="mt-1 size-6 shrink-0" />
      <div className="min-w-0 flex-1 space-y-4 leading-relaxed">{children}</div>
    </div>
  );
}
