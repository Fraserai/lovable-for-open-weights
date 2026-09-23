"use client";

import Link from "next/link";
import { useState } from "react";
import { shortModel, trainerOf, useRun } from "@/lib/client";
import { TRAINERS, type Trainer } from "@/lib/models";
import type { RunStatus } from "@/lib/runs";
import Chart from "./Chart";
import CompareChat from "./CompareChat";
import { Chat, External, Rocket } from "./icons";
import TrainTabs from "./train/TrainTabs";
import { btn, Dot, duration, ErrorNote, Pill } from "./ui";

/** Current run: where it is, how the loss is moving, then try it and take it home. */
export default function RunView({ id, justStarted }: { id: string; justStarted: boolean }) {
  const { run, missing, bump } = useRun(id, justStarted);

  if (missing) {
    return (
      <main className="mx-auto w-full max-w-[1240px] px-4 py-8 sm:px-8">
        <TrainTabs active="run" />
        <p className="text-muted">There&apos;s no run called {id}. <Link href="/runs" className="underline">See all runs</Link>.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1240px] px-4 py-8 sm:px-8">
      <TrainTabs active="run" runId={id} />
      {!run ? <p className="flex items-center gap-2 text-muted"><Dot /> Loading…</p> : <RunBody run={run} bump={bump} />}
    </main>
  );
}

function stateOf(run: RunStatus): { label: string; tone: "muted" | "accent" | "warn" | "bad" | "ink" } {
  if (run.status === "running") return { label: "Preparing data", tone: "warn" };
  if (run.status === "failed") return { label: "Data failed", tone: "bad" };
  if (run.train.state === "running") return { label: "Training", tone: "accent" };
  if (run.train.state === "done") return { label: "Trained", tone: "ink" };
  if (run.train.state === "failed") return { label: "Stopped", tone: "bad" };
  return { label: "Not started", tone: "muted" };
}

function RunBody({ run, bump }: { run: RunStatus; bump: (launched?: boolean) => void }) {
  const trainer = trainerOf(run.baseModel) as Trainer | null;
  const t = run.train;
  const state = stateOf(run);
  const pct = t.totalSteps ? Math.min(100, (t.steps / t.totalSteps) * 100) : 0;
  const perEpoch = t.totalSteps && t.epochs ? t.totalSteps / t.epochs : null;
  const last = t.metrics.at(-1);
  const eta = t.elapsedSec && t.steps && t.totalSteps && t.state === "running" ? (t.elapsedSec / t.steps) * (t.totalSteps - t.steps) : null;
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const retry = async () => {
    setRetrying(true);
    setRetryError(null);
    const res = await fetch(`/api/runs/${run.id}/train`, { method: "POST" });
    if (!res.ok) setRetryError((await res.json().catch(() => ({}))).error ?? "Could not start training.");
    else bump(true);
    setRetrying(false);
  };

  const stats: [string, React.ReactNode][] = [
    ["Step", t.totalSteps ? `${t.steps.toLocaleString()} / ${t.totalSteps.toLocaleString()}` : t.steps || "—"],
    ["Epoch", perEpoch ? (t.steps / perEpoch).toFixed(2) : "—"],
    ["Loss", last ? last.loss.toFixed(4) : "—"],
    ["Learning rate", last?.lr ? last.lr.toExponential(1) : "—"],
    ["Elapsed", duration(t.elapsedSec)],
    ["Time left", t.state === "done" ? "—" : duration(eta)],
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium tracking-widest text-faint uppercase">{trainer ? TRAINERS[trainer].label : "Run"} · {run.id}</p>
            <h2 className="mt-1 font-display text-2xl leading-tight font-bold tracking-tight text-balance">{run.goal ?? run.id}</h2>
            <p className="mt-1 text-sm text-muted">
              {shortModel(run.baseModel)}
              {run.rows ? ` · ${run.rows.toLocaleString()} examples` : ""}
              {run.sourceLabel ? ` · ${run.sourceLabel}` : run.files.length ? ` · ${run.files.length} file${run.files.length > 1 ? "s" : ""}` : ""}
            </p>
          </div>
          <Pill tone={state.tone}>{(state.label === "Training" || state.label === "Preparing data") && <Dot className="size-1.5" />}{state.label}</Pill>
        </div>

        {(t.state === "running" || t.state === "done") && (
          <div className="mt-5">
            <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Training progress">
              <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${t.state === "done" ? 100 : pct}%` }} />
            </div>
            <p className="mt-2 text-sm text-muted">
              {t.state === "done" ? "Training finished."
                : t.jobUrl && t.steps === 0 ? "Starting a cloud GPU and loading the model (a few minutes)…"
                : t.steps === 0 ? `Starting on ${trainer ? TRAINERS[trainer].label : "the trainer"}…`
                : `${pct.toFixed(0)}% · runs in the cloud, so closing this page won't stop it.`}
              {t.jobUrl && <> <a href={t.jobUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">Job on Hugging Face <External className="size-3" /></a></>}
            </p>
          </div>
        )}

        {(run.status !== "done" || t.state === "waiting") && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {run.status === "running" && <p className="flex items-center gap-2 text-sm text-muted"><Dot /> {run.stages.read !== "done" ? "Reading the data…" : "Writing training examples…"}</p>}
            {run.status === "failed" && <div className="w-full"><ErrorNote>{run.error}</ErrorNote></div>}
            {run.status === "done" && t.state === "waiting" && (
              <>
                <p className="text-sm text-muted">The data is ready. Review the settings and cost, then start.</p>
                <Link href={`/train?run=${run.id}`} className={btn.primary}><Rocket className="size-4" /> Continue setup</Link>
              </>
            )}
          </div>
        )}

        {t.state === "failed" && (
          <div className="mt-5 space-y-3">
            <ErrorNote>{t.error ?? "Training stopped. See train.log in the run folder."}</ErrorNote>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={retry} disabled={retrying} className={btn.ghost}>{retrying ? "Starting…" : "Try again"}</button>
              <Link href={`/train?run=${run.id}`} className={btn.ghost}>Change settings</Link>
            </div>
            {retryError && <ErrorNote>{retryError}</ErrorNote>}
          </div>
        )}
      </section>

      {(t.state !== "waiting" || t.metrics.length > 0) && (
        <>
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-3">
              {stats.map(([k, v]) => (
                <div key={k} className="bg-surface p-4">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="mt-1 font-mono text-base whitespace-nowrap tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <dl className="space-y-2.5 rounded-3xl border border-line bg-surface p-5 text-sm">
              {([
                ["Trains on", trainer ? TRAINERS[trainer].runsOn : "—"],
                ["Method", "LoRA · 16-bit"],
                ["LoRA rank", t.loraRank ?? "—"],
                ["Epochs", t.epochs ?? "—"],
                ["Learning rate", run.settings.learningRate?.toExponential(1) ?? "tuned for model"],
              ] as [string, React.ReactNode][]).map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="grid gap-5 md:grid-cols-2">
            <Chart title="Training loss" smooth points={t.metrics.map((m) => ({ x: m.step, y: m.loss }))}
                   empty={trainer === "Fireworks" ? "Fireworks reports metrics when the job ends." : undefined} />
            <Chart title="Learning rate" format={(v) => v.toExponential(1)}
                   points={t.metrics.filter((m) => m.lr != null).map((m) => ({ x: m.step, y: m.lr! }))} />
          </section>
        </>
      )}

      {t.state === "done" && <Finished run={run} bump={bump} />}
    </div>
  );
}

function Finished({ run, bump }: { run: RunStatus; bump: (launched?: boolean) => void }) {
  const [error, setError] = useState<string | null>(null);
  const t = run.train;

  const takeHome = async () => {
    setError(null);
    const res = await fetch(`/api/runs/${run.id}/fetch`, { method: "POST" });
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Could not start.");
    bump();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6" aria-label="Try your model">
        <div className="mb-4 flex items-center gap-2">
          <Chat className="size-5 text-accent" />
          <h2 className="font-display text-lg font-bold tracking-tight">Try it</h2>
        </div>
        {t.canChat
          ? <CompareChat runId={run.id} baseName={shortModel(run.baseModel)} />
          : <p className="text-sm text-muted">Side-by-side chat works for Tinker runs today. Take the model home to run it anywhere.</p>}
      </section>

      <section className="h-fit rounded-3xl border border-line bg-surface p-5 sm:p-6" aria-label="Take it home">
        <h2 className="font-display text-lg font-bold tracking-tight">Take it home</h2>
        <p className="mt-1 text-sm text-muted">The trained LoRA adapter is yours: open weights, no lock-in.</p>
        {t.hfRepo ? (
          <a href={t.hfRepo} target="_blank" rel="noreferrer" className={`${btn.ghost} mt-4 w-full`}>
            {t.hfRepo.replace("https://huggingface.co/", "")} <External className="size-3.5" />
          </a>
        ) : (
          <>
            <button type="button" onClick={takeHome} disabled={t.handback === "running"} className={`${btn.primary} mt-4 w-full`}>
              {t.handback === "running" ? <><Dot className="bg-ground" /> Publishing…</> : "Publish to my Hugging Face"}
            </button>
            <p className="mt-2 text-xs text-faint">
              {t.handback === "failed" ? "That didn't finish. Try again; nothing gets retrained." : "A private repo on your account, with a model card."}
            </p>
          </>
        )}
        {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      </section>
    </div>
  );
}
