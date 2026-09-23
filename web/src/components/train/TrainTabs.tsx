"use client";

import Link from "next/link";
import { useRuns } from "@/lib/client";

/** The Train area's header, like Unsloth Studio's: Configure · Current run · History. */
export default function TrainTabs({ active, runId, title = "Train", subtitle = "Set up a run, watch it train, take the model home" }: {
  active: "configure" | "run" | "history"; runId?: string; title?: string; subtitle?: string;
}) {
  const runs = useRuns();
  // "Current run": this page's run, else whatever is training now, else the newest
  const current = runId ?? runs?.find((r) => r.state === "training")?.id ?? runs?.[0]?.id;
  const tabs = [
    { key: "configure", label: "Configure", href: runId ? `/train?run=${runId}` : "/train" },
    { key: "run", label: "Current run", href: current ? `/runs/${current}` : null },
    { key: "history", label: "History", href: "/runs" },
  ] as const;

  return (
    <div className="mb-6">
      <h1 className="font-display text-[clamp(28px,4vw,40px)] leading-tight font-extrabold tracking-[-0.03em]">{title}</h1>
      <p className="mt-1 text-muted">{subtitle}</p>
      <nav className="mt-5 flex gap-6 border-b border-line" aria-label="Train">
        {tabs.map((t) => t.href ? (
          <Link key={t.key} href={t.href} aria-current={active === t.key ? "page" : undefined}
                className="-mb-px border-b-2 border-transparent pb-2.5 text-sm text-muted transition hover:text-ink aria-[current=page]:border-ink aria-[current=page]:font-medium aria-[current=page]:text-ink">
            {t.label}
          </Link>
        ) : (
          <span key={t.key} className="pb-2.5 text-sm text-faint">{t.label}</span>
        ))}
      </nav>
    </div>
  );
}
