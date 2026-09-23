"use client";

import Link from "next/link";
import { shortModel, trainerOf, useRuns } from "@/lib/client";
import type { RunSummary } from "@/lib/runs";
import TrainTabs from "./train/TrainTabs";
import { ago, btn, Pill } from "./ui";

const STATE: Record<RunSummary["state"], { label: string; tone: "muted" | "accent" | "warn" | "bad" | "ink" }> = {
  preparing: { label: "Preparing data", tone: "warn" },
  ready: { label: "Ready to train", tone: "muted" },
  training: { label: "Training", tone: "accent" },
  trained: { label: "Trained", tone: "ink" },
  failed: { label: "Stopped", tone: "bad" },
};

/** Every run, newest first: the Train area's History tab. */
export default function RunHistory() {
  const runs = useRuns(10_000);
  return (
    <main className="mx-auto w-full max-w-[1240px] px-4 py-8 sm:px-8">
      <TrainTabs active="history" />
      {runs === null && <p className="text-faint">Loading…</p>}
      {runs?.length === 0 && (
        <div className="rounded-3xl border border-dashed border-line p-10 text-center">
          <p className="text-muted">No runs yet.</p>
          <Link href="/train" className={`${btn.primary} mt-4`}>Set up a run</Link>
        </div>
      )}
      {runs && runs.length > 0 && (
        <div className="overflow-hidden rounded-3xl border border-line bg-surface">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="border-b border-line text-xs tracking-wide text-faint uppercase">
              <tr>
                <th className="px-5 py-3 font-medium">Run</th>
                <th className="hidden w-40 px-5 py-3 font-medium md:table-cell">Model</th>
                <th className="hidden w-28 px-5 py-3 font-medium sm:table-cell">Examples</th>
                <th className="w-36 px-5 py-3 font-medium">Status</th>
                <th className="hidden w-28 px-5 py-3 text-right font-medium sm:table-cell">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {runs.map((r) => (
                <tr key={r.id} className="relative transition hover:bg-ground">
                  <td className="px-5 py-3.5">
                    <Link href={`/runs/${r.id}`} className="block truncate font-medium after:absolute after:inset-0">{r.goal ?? r.id}</Link>
                    <span className="block truncate font-mono text-xs text-faint">{r.id}</span>
                  </td>
                  <td className="hidden px-5 py-3.5 md:table-cell">
                    <span className="block truncate">{shortModel(r.baseModel)}</span>
                    <span className="text-xs text-faint">{trainerOf(r.baseModel)}</span>
                  </td>
                  <td className="hidden px-5 py-3.5 font-mono tabular-nums sm:table-cell">{r.rows?.toLocaleString() ?? "—"}</td>
                  <td className="px-5 py-3.5"><Pill tone={STATE[r.state].tone}>{STATE[r.state].label}</Pill></td>
                  <td className="hidden px-5 py-3.5 text-right text-muted sm:table-cell">{ago(r.updated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
