"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BRAND } from "@/lib/brand";
import { shortModel, useRuns } from "@/lib/client";
import { TRAINERS, type Trainer } from "@/lib/models";
import type { RunSummary } from "@/lib/runs";
import { Chat, Close, Flask, Layers, Logo, Menu, Plus } from "./icons";

const NAV = [
  { href: "/train", label: "Train", icon: Flask, match: (p: string) => p.startsWith("/train") || p.startsWith("/runs") },
  { href: "/chat", label: "Chat", icon: Chat, match: (p: string) => p.startsWith("/chat") },
  { href: "/models", label: "Models", icon: Layers, match: (p: string) => p.startsWith("/models") },
];

const STATE_DOT: Record<RunSummary["state"], string> = {
  preparing: "bg-amber-400 animate-pulse",
  ready: "bg-faint",
  training: "bg-accent animate-pulse",
  trained: "bg-accent",
  failed: "bg-red-500",
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [shownFor, setShownFor] = useState(pathname);
  // Close the phone drawer after navigating
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }

  return (
    <div className="flex min-h-dvh">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col border-r border-line bg-surface transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 ${
          open ? "translate-x-0 shadow-[var(--shadow)]" : "-translate-x-full"}`}
        aria-label="Sidebar"
      >
        <div className="flex items-center gap-2 px-4 pt-4 pb-3">
          <Link href="/" className="flex items-center gap-2 rounded-lg">
            <Logo className="size-7" />
            <span className="font-display text-lg font-bold tracking-tight">{BRAND.name}</span>
          </Link>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="ml-auto rounded-lg p-1.5 text-muted hover:bg-ground lg:hidden">
            <Close className="size-5" />
          </button>
        </div>

        <div className="px-3">
          <Link href="/" className="flex items-center justify-center gap-2 rounded-xl bg-ink px-3 py-2.5 text-sm font-medium text-ground transition hover:opacity-90">
            <Plus className="size-4" /> New model
          </Link>
        </div>

        <nav className="mt-4 space-y-0.5 px-3" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon, match }) => (
            <Link key={href} href={href} aria-current={match(pathname) ? "page" : undefined}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] text-muted transition hover:bg-ground hover:text-ink aria-[current=page]:bg-ground aria-[current=page]:font-medium aria-[current=page]:text-ink">
              <Icon className="size-[18px]" /> {label}
            </Link>
          ))}
        </nav>

        <Recents pathname={pathname} />
        <TrainerStatus />
      </aside>

      {open && <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-ink/30 lg:hidden" />}

      <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-ground/85 px-4 py-2.5 backdrop-blur lg:hidden">
          <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-1.5 text-muted hover:bg-surface">
            <Menu className="size-5" />
          </button>
          <Link href="/" className="flex items-center gap-2">
            <Logo className="size-6" />
            <span className="font-display font-bold tracking-tight">{BRAND.name}</span>
          </Link>
        </header>
        {children}
      </div>
    </div>
  );
}

function Recents({ pathname }: { pathname: string }) {
  const runs = useRuns(15_000);
  return (
    <div className="mt-6 flex min-h-0 flex-1 flex-col px-3">
      <div className="flex items-center justify-between px-3 pb-1.5">
        <p className="text-xs font-medium tracking-wide text-faint uppercase">Recent runs</p>
        <Link href="/runs" className="text-xs text-faint hover:text-ink">All</Link>
      </div>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-2">
        {runs === null && <li className="px-3 py-1.5 text-sm text-faint">Loading…</li>}
        {runs?.length === 0 && <li className="px-3 py-1.5 text-sm text-faint">No runs yet</li>}
        {runs?.slice(0, 12).map((r) => {
          const href = `/runs/${r.id}`;
          return (
            <li key={r.id}>
              <Link href={href} aria-current={pathname === href ? "page" : undefined}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm text-muted transition hover:bg-ground hover:text-ink aria-[current=page]:bg-ground aria-[current=page]:text-ink">
                <span className={`size-1.5 shrink-0 rounded-full ${STATE_DOT[r.state]}`} aria-label={r.state} />
                <span className="min-w-0 flex-1 truncate" title={`${r.goal ?? r.id} · ${shortModel(r.baseModel)}`}>{r.goal ?? r.id}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Which trainers this deployment can reach. Together is the next one to wire. */
function TrainerStatus() {
  const [status, setStatus] = useState<{ trainer: Trainer; connected: boolean }[] | null>(null);
  useEffect(() => {
    fetch("/api/trainers").then((r) => r.json()).then(setStatus).catch(() => setStatus([]));
  }, []);
  return (
    <div className="border-t border-line px-6 py-4">
      <p className="text-xs font-medium tracking-wide text-faint uppercase">Trainers</p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {(status ?? []).map((s) => (
          <li key={s.trainer} className="flex items-center gap-2" title={s.connected ? "Key set" : `Add ${TRAINERS[s.trainer].env} to .env`}>
            <span className={`size-1.5 rounded-full ${s.connected ? "bg-accent" : "bg-line"}`} />
            <span className={s.connected ? "" : "text-faint"}>{TRAINERS[s.trainer].label}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 text-faint">
          <span className="size-1.5 rounded-full border border-line" />Together <span className="text-xs">· next</span>
        </li>
      </ul>
    </div>
  );
}
