"use client";

import { TRAINERS, type ModelOption } from "@/lib/models";
import type { TrainPlan } from "@/lib/runs";
import { Check, Rocket } from "../icons";
import { btn, Dot, ErrorNote, money, Pill } from "../ui";

export type Readiness = { label: string; done: boolean }[];

/** The sticky right-hand summary: everything about the run at a glance, cost last, then Start. */
export default function RunPreview({ model, dataLabel, plan, planning, planError, checklist, starting, startError, onStart }: {
  model: ModelOption; dataLabel: string | null; plan: TrainPlan | null; planning: boolean; planError: string | null;
  checklist: Readiness; starting: boolean; startError: string | null; onStart: () => void;
}) {
  const trainer = model.trainer ? TRAINERS[model.trainer] : null;
  const ready = checklist.every((c) => c.done) && !!plan?.ok && !planning;
  const status = planning ? <Pill tone="muted"><Dot className="size-1.5" /> Checking</Pill>
    : ready ? <Pill tone="accent">Ready</Pill> : <Pill>Not ready</Pill>;
  const cost = !plan ? "—"
    : plan.max_cost != null ? `at most ${money(plan.max_cost)}`
    : plan.est_cost != null ? `about ${money(plan.est_cost)}`
    : "shown by the trainer";

  const rows: [string, React.ReactNode][] = [
    ["Method", <>LoRA <span className="text-faint">· 16-bit</span></>],
    ["LoRA rank", plan?.lora_rank ?? "—"],
    ["Length", plan ? `${plan.steps.toLocaleString()} steps · ${plan.epochs} epoch${plan.epochs > 1 ? "s" : ""}` : "—"],
    ["Batch", plan?.batch_size ?? "—"],
    ["Context", plan?.max_length ? plan.max_length.toLocaleString() : "—"],
    ["Learning rate", plan?.learning_rate ? plan.learning_rate.toExponential(1) : "—"],
    ["Examples", plan ? plan.examples.toLocaleString() : "—"],
  ];

  return (
    <aside className="rounded-3xl border border-line bg-surface p-5 lg:sticky lg:top-6" aria-label="Run preview">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Run preview</p>
        {status}
      </div>

      <p className="mt-5 text-[11px] font-medium tracking-widest text-faint uppercase">{trainer?.label ?? "No trainer"}</p>
      <p className="mt-0.5 font-display text-2xl leading-tight font-bold tracking-tight break-words">{model.name}</p>
      <p className="mt-1 truncate font-mono text-xs text-muted">{dataLabel ?? "No data yet"}</p>

      <dl className="mt-5 space-y-2.5 border-t border-line pt-4 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right font-mono tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <dl className="mt-4 space-y-2.5 border-t border-line pt-4 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted">Trains on</dt>
          <dd className="text-right">{trainer?.runsOn ?? "—"}{plan?.gpu ? ` · ${plan.gpu}` : ""}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted">Cost</dt>
          <dd className="text-right font-display text-lg font-bold tabular-nums">{cost}</dd>
        </div>
      </dl>

      {!ready && (
        <ul className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm" aria-label="Still to do">
          {checklist.map((c) => (
            <li key={c.label} className={`flex items-center gap-2 ${c.done ? "text-muted" : ""}`}>
              <span className={`grid size-4 place-items-center rounded-full border ${c.done ? "border-accent bg-accent text-surface" : "border-line"}`}>
                {c.done && <Check className="size-2.5" />}
              </span>
              {c.label}
            </li>
          ))}
        </ul>
      )}

      {plan && !plan.ok && <div className="mt-4"><ErrorNote>Some training examples failed the checks. Use different data.</ErrorNote></div>}
      {planError && <div className="mt-4"><ErrorNote>{planError}</ErrorNote></div>}

      <button type="button" onClick={onStart} disabled={!ready || starting} className={`${btn.accent} mt-5 w-full`}>
        <Rocket className="size-4" /> {starting ? "Starting…" : "Start training"}
      </button>
      {startError && <div className="mt-3"><ErrorNote>{startError}</ErrorNote></div>}
      <p className="mt-3 text-center text-xs text-faint">
        The only step that costs money{trainer ? `: ${trainer.label} bills ${trainer.billing}` : ""}.
      </p>
    </aside>
  );
}
