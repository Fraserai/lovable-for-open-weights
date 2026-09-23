"use client";

import { Chevron } from "./icons";

// Shared building blocks for the app pages. Our own look (light-first, teal accent, display type),
// laid out the way Unsloth Studio's Train page is: one card per decision.

export const btn = {
  primary: "inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-ground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35",
  accent: "inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35 dark:text-ground",
  ghost: "inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2 text-sm transition hover:bg-ground disabled:cursor-not-allowed disabled:opacity-40",
  quiet: "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted transition hover:bg-ground hover:text-ink",
};

export const input =
  "w-full rounded-xl border border-line bg-ground px-3.5 py-2.5 text-sm outline-none transition placeholder:text-faint focus:border-accent disabled:opacity-60";

export function Card({ icon, title, subtitle, action, children, step }: {
  icon: React.ReactNode; title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; step?: number;
}) {
  return (
    <section className="@container rounded-3xl border border-line bg-surface p-5 sm:p-6" aria-label={title}>
      <header className="mb-5 flex flex-wrap items-start gap-3">
        <span className="relative grid size-10 shrink-0 place-items-center rounded-2xl bg-accent/10 text-accent">
          {icon}
          {step !== undefined && (
            <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full border-2 border-surface bg-ink font-mono text-[10px] text-ground">
              {step}
            </span>
          )}
        </span>
        <div className="min-w-[14rem] flex-1">
          <h2 className="font-display text-lg leading-tight font-bold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      {children}
    </section>
  );
}

export function Field({ label, hint, htmlFor, children, aside }: {
  label: string; hint?: string; htmlFor?: string; children: React.ReactNode; aside?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center gap-1.5">
        <label htmlFor={htmlFor} className="text-xs font-medium tracking-wide text-muted uppercase">{label}</label>
        {hint && (
          <span title={hint} aria-label={hint} className="grid size-4 cursor-help place-items-center rounded-full border border-line text-[10px] text-faint">?</span>
        )}
        {aside && <span className="ml-auto">{aside}</span>}
      </div>
      {children}
    </div>
  );
}

export function Select<T extends string>({ id, value, onChange, options, disabled }: {
  id?: string; value: T; onChange: (v: T) => void; options: { value: T; label: string; disabled?: boolean }[]; disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}
              className={`${input} appearance-none pr-9`}>
        {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      </select>
      <Chevron className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-faint" />
    </div>
  );
}

export function Segmented<T extends string | number>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string; disabled?: boolean; title?: string }[]; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-ground p-1">
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} disabled={o.disabled}
                title={o.title} onClick={() => onChange(o.value)}
                className="rounded-lg px-3 py-1.5 text-sm text-muted transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 aria-checked:bg-surface aria-checked:font-medium aria-checked:text-ink aria-checked:shadow-sm">
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pill({ tone = "muted", children }: { tone?: "muted" | "accent" | "warn" | "bad" | "ink"; children: React.ReactNode }) {
  const tones = {
    muted: "border-line text-muted",
    accent: "border-accent/30 bg-accent/10 text-accent",
    warn: "border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-300",
    bad: "border-red-400/40 bg-red-500/10 text-red-600 dark:text-red-300",
    ink: "border-ink bg-ink text-ground",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-xl border border-red-300/60 bg-red-50 px-3.5 py-2.5 text-sm text-red-800 dark:border-red-400/30 dark:bg-red-950/40 dark:text-red-200">
      {children}
    </p>
  );
}

export function Dot({ className = "" }: { className?: string }) {
  return <span className={`inline-block size-2 animate-pulse rounded-full bg-accent ${className}`} aria-hidden />;
}

export const money = (n: number | null | undefined) =>
  n == null ? "—" : n < 0.01 ? "under 1¢" : n < 1 ? `${Math.round(n * 100)}¢` : `$${n.toFixed(2)}`;

export const duration = (sec: number | null | undefined) => {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`;
};

export const ago = (ms: number) => {
  const s = (Date.now() - ms) / 1000;
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};
