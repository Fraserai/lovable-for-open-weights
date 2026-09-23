"use client";

import { useEffect, useRef, useState } from "react";
import { BRAND } from "@/lib/brand";
import type { RunStatus, Stage, TrainPlan } from "@/lib/runs";
import type { ModelOption } from "@/lib/models";
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

/** What the workspace shows. New runs carry real File objects to upload; reopened runs only names. */
export type StudioBrief = { goal: string; files: { name: string; size: number }[]; model: ModelOption };

type Turn = { q: string; original?: string; trained?: string; error?: string };

export default function Studio({ brief, existingRunId, onReset }:
  { brief: StudioBrief; existingRunId?: string; onReset: () => void }) {
  const { goal, files, model } = brief;
  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  const [runId, setRunId] = useState<string | null>(existingRunId ?? null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [handbackError, setHandbackError] = useState<string | null>(null);
  const [run, setRun] = useState<RunStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [plan, setPlan] = useState<TrainPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  // Bumped when training or handback starts, to (re)start polling
  const [pollKey, setPollKey] = useState(0);
  // When Start was pressed: the trainer takes a few seconds to report in, so keep showing it as started
  const launchedAt = useRef(0);

  // Poll the run while the worker is busy
  useEffect(() => {
    if (!runId) return;
    let alive = true;
    const tick = async () => {
      const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
      if (!alive || !res.ok) return;
      let next: RunStatus = await res.json();
      const launching = next.train.state === "waiting" && Date.now() - launchedAt.current < 120_000;
      if (launching) next = { ...next, train: { ...next.train, state: "running" } };
      setRun(next);
      if (launching || next.status === "running" || next.train.state === "running" || next.train.handback === "running") {
        setTimeout(tick, 2000);
      }
    };
    tick();
    return () => { alive = false; };
  }, [runId, pollKey]);

  const start = async () => {
    setStarting(true);
    setStartError(null);
    const form = new FormData();
    form.set("goal", goal);
    form.set("model", model.id);
    files.forEach((f) => f instanceof File && form.append("files", f));
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

  const reviewCost = async () => {
    setPlanning(true);
    setPlanError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/train`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not work out the cost.");
      setPlan(body);
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : "Could not work out the cost.");
    } finally {
      setPlanning(false);
    }
  };

  const startTraining = async () => {
    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/train`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not start training.");
      launchedAt.current = Date.now();
      setRun((r) => (r ? { ...r, train: { ...r.train, state: "running", error: null } } : r));
      setPollKey((k) => k + 1);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "Could not start training.");
    } finally {
      setStarting(false);
    }
  };

  const ask = async () => {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    setQuestion("");
    setTurns((t) => [...t, { q }]);
    const settle = (patch: Partial<Turn>) =>
      setTurns((t) => t.map((turn, i) => (i === t.length - 1 ? { ...turn, ...patch } : turn)));
    try {
      const res = await fetch(`/api/runs/${runId}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: q }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "The models didn't answer.");
      settle({ original: body.original, trained: body.trained });
    } catch (e) {
      settle({ error: e instanceof Error ? e.message : "The models didn't answer." });
    } finally {
      setAsking(false);
    }
  };

  const takeHome = async () => {
    setHandbackError(null);
    const res = await fetch(`/api/runs/${runId}/fetch`, { method: "POST" });
    if (!res.ok) {
      setHandbackError((await res.json().catch(() => ({}))).error ?? "Could not start.");
      return;
    }
    setRun((r) => (r ? { ...r, train: { ...r.train, handback: "running" } } : r));
    setPollKey((k) => k + 1);
  };

  const stageOf = (key: (typeof STAGES)[number]["key"]): Stage => {
    if (!run) return "waiting";
    if (key === "train") return run.train.state;
    if (key === "handback") {
      return run.train.hfRepo ? "done" : run.train.handback === "running" ? "running"
        : run.train.handback === "failed" ? "failed" : "waiting";
    }
    return run.stages[key];
  };
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
              First I&apos;ll prepare training examples (from up to 20 sections of your documents, or straight from
              your dataset) so you can check them. Nothing gets trained or paid for on {model.trainer ?? "the trainer"} until
              you say so.
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
                {run.source === "dataset" ? "I loaded" : "I wrote"} <b>{run.rows?.toLocaleString()}</b> training examples (about {run.estTokens?.toLocaleString()} tokens)
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
              {run.stages.check === "done" && run.train.state === "waiting" && !plan && (
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button type="button" onClick={reviewCost} disabled={planning}
                          className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-ground transition hover:opacity-90 disabled:opacity-40">
                    {planning ? "Working out the cost…" : "Review cost and train"}
                  </button>
                  {planError && <span className="text-sm text-red-600 dark:text-red-400">{planError}</span>}
                </div>
              )}
            </Assistant>
          )}

          {plan && run?.train.state === "waiting" && (
            <Assistant>
              <p>Here&apos;s what training costs before anything is spent:</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-line bg-surface p-4 text-sm sm:grid-cols-4">
                <div><dt className="text-faint">Examples</dt><dd className="mt-0.5 font-medium">{plan.examples.toLocaleString()}</dd></div>
                <div><dt className="text-faint">Passes over data</dt><dd className="mt-0.5 font-medium">{plan.epochs}</dd></div>
                <div><dt className="text-faint">Training steps</dt><dd className="mt-0.5 font-medium">{plan.steps.toLocaleString()}</dd></div>
                <div>
                  <dt className="text-faint">{plan.max_cost != null ? "Most it can cost" : "Estimated cost"}</dt>
                  <dd className="mt-0.5 font-medium">
                    {plan.max_cost != null ? `$${plan.max_cost.toFixed(2)}`
                      : plan.est_cost === null ? "shown by the trainer"
                      : plan.est_cost < 0.01 ? "under 1¢" : `$${plan.est_cost.toFixed(2)}`}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={startTraining} disabled={starting}
                        className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-ground transition hover:opacity-90 disabled:opacity-40">
                  {starting ? "Starting…" : "Start training"}
                </button>
                <button type="button" onClick={() => setPlan(null)}
                        className="rounded-full border border-line px-4 py-2 text-sm transition hover:bg-surface">Not yet</button>
                {startError && <span className="text-sm text-red-600 dark:text-red-400">{startError}</span>}
              </div>
              <p className="text-sm text-faint">
                This is the only step that costs money.{" "}
                {plan.trainer === "unsloth"
                  ? `It trains with Unsloth on one ${plan.gpu} GPU from your Hugging Face account, at $${plan.per_hour}/hr billed by the second. A time limit stops it at $${plan.max_cost?.toFixed(2)}.`
                  : `${plan.trainer === "tinker" ? "Tinker" : "Fireworks"} charges for the training tokens above.`}
              </p>
            </Assistant>
          )}

          {run?.train.state === "running" && (
            <Assistant>
              <p className="flex items-center gap-2 text-muted">
                <span className="size-2 animate-pulse rounded-full bg-accent" />
                {run.train.jobUrl && run.train.steps === 0
                  ? "Starting a cloud GPU and loading your model (a few minutes)…"
                  : `Training your model${run.train.totalSteps ? `: step ${run.train.steps} of ${run.train.totalSteps}` : "…"}`}
              </p>
              {run.train.jobUrl && (
                <p className="text-sm text-faint">
                  It runs in the cloud, so closing this page won&apos;t stop it.{" "}
                  <a href={run.train.jobUrl} target="_blank" rel="noreferrer" className="underline">See the job on Hugging Face</a>
                </p>
              )}
            </Assistant>
          )}

          {run?.train.state === "failed" && (
            <Assistant>
              <p>Training stopped before it finished:</p>
              <p className="rounded-xl border border-red-300/60 bg-red-50 px-4 py-3 font-mono text-sm text-red-800 dark:border-red-400/30 dark:bg-red-950/40 dark:text-red-200">
                {run.train.error ?? "See train.log in the run folder."}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={startTraining} disabled={starting}
                        className="rounded-full border border-line px-4 py-2 text-sm transition hover:bg-surface disabled:opacity-40">
                  {starting ? "Starting…" : "Try again"}
                </button>
                {startError && <span className="text-sm text-red-600 dark:text-red-400">{startError}</span>}
              </div>
            </Assistant>
          )}

          {run?.train.state === "done" && (
            <Assistant>
              <p><b>Your model is trained.</b> It learned from what you gave it, and it&apos;s yours to keep.</p>
              {run.train.hfRepo ? (
                <p>
                  It&apos;s in your private Hugging Face repo:{" "}
                  <a href={run.train.hfRepo} target="_blank" rel="noreferrer" className="underline">{run.train.hfRepo.replace("https://huggingface.co/", "")}</a>
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={takeHome} disabled={run.train.handback === "running"}
                          className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-ground transition hover:opacity-90 disabled:opacity-40">
                    {run.train.handback === "running" ? "Publishing to your Hugging Face…" : "Take it home"}
                  </button>
                  <span className="text-sm text-faint">
                    {run.train.handback === "failed" ? "That didn't finish. Try again; nothing gets retrained."
                      : "Saves the model to a private repo on your Hugging Face account."}
                  </span>
                  {handbackError && <span className="text-sm text-red-600 dark:text-red-400">{handbackError}</span>}
                </div>
              )}
            </Assistant>
          )}

          {run?.train.canChat && (
            <section aria-label="Talk to your model" className="space-y-4 border-t border-line pt-6">
              <div>
                <h3 className="font-display text-xl font-bold tracking-tight">Talk to your model</h3>
                <p className="text-sm text-muted">Ask anything. The original {model.name} and yours get the same question.</p>
              </div>

              {turns.map((t, i) => (
                <div key={i} className="space-y-3">
                  <p className="ml-auto w-fit max-w-[560px] rounded-3xl rounded-br-lg bg-ink px-5 py-3 text-ground">{t.q}</p>
                  {t.error ? (
                    <p className="text-sm text-red-600 dark:text-red-400">{t.error}</p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {([["Original", t.original, false], ["Yours", t.trained, true]] as const).map(([label, text, mine]) => (
                        <figure key={label} className={`rounded-2xl border p-4 text-sm ${mine ? "border-accent bg-surface" : "border-line"}`}>
                          <figcaption className={`mb-2 text-xs font-medium tracking-wide uppercase ${mine ? "text-accent" : "text-faint"}`}>
                            {label}
                          </figcaption>
                          {text === undefined
                            ? <p className="flex items-center gap-2 text-faint"><span className="size-2 animate-pulse rounded-full bg-accent" /> Thinking…</p>
                            : <p className="whitespace-pre-wrap leading-relaxed">{text || "(no answer)"}</p>}
                        </figure>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex gap-2">
                <label htmlFor="ask" className="sr-only">Ask your model</label>
                <input id="ask" value={question} onChange={(e) => setQuestion(e.target.value)} disabled={asking}
                       placeholder={asking ? "Both models are answering (about 30 seconds)…" : "Ask your model something…"}
                       className="min-w-0 flex-1 rounded-full border border-line bg-surface px-5 py-3 text-[15px] outline-none focus:border-accent disabled:opacity-60" />
                <button type="submit" disabled={asking || !question.trim()}
                        className="rounded-full bg-ink px-5 py-3 text-sm font-medium text-ground transition disabled:opacity-30">Ask</button>
              </form>
            </section>
          )}
        </section>

        {/* Run panel */}
        <aside className="border-t border-line bg-surface px-4 py-8 sm:px-8 lg:border-t-0 lg:border-l" aria-label="Your model">
          <p className="text-xs font-medium tracking-wide text-faint uppercase">Your model</p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">{model.name}, tuned for your goal</h2>

          <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
            <div><dt className="text-faint">Base model</dt><dd className="mt-0.5 font-medium">{model.name}</dd></div>
            <div><dt className="text-faint">Trainer</dt><dd className="mt-0.5 font-medium">{model.trainer ?? "None yet"}</dd></div>
            <div><dt className="text-faint">Method</dt><dd className="mt-0.5 font-medium">LoRA, rank {run?.train.loraRank ?? plan?.lora_rank ?? 32}</dd></div>
            <div>
              <dt className="text-faint">Passes over data</dt>
              <dd className="mt-0.5 font-medium">{run?.train.epochs ?? plan?.epochs ?? "sized to your data"}</dd>
            </div>
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
