"use client";

import Link from "next/link";
import { useState } from "react";
import Composer, { type Brief } from "@/components/Composer";
import Studio from "@/components/Studio";
import { Logo } from "@/components/icons";
import { BRAND } from "@/lib/brand";

const NAV = ["How it works", "Models", "Security", "Pricing"];

export default function Home() {
  const [brief, setBrief] = useState<Brief | null>(null);

  if (brief) return <Studio brief={brief} onReset={() => setBrief(null)} />;

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div className="glow" aria-hidden />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-4 sm:gap-8 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <Logo className="size-7" />
          <span className="font-display text-xl font-bold tracking-tight">{BRAND.name}</span>
        </Link>
        <nav className="hidden items-center gap-7 text-[15px] text-muted md:flex" aria-label="Main">
          {NAV.map((n) => <a key={n} href="#" className="transition hover:text-ink">{n}</a>)}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <a href="#" className="hidden whitespace-nowrap rounded-xl border border-line bg-surface/70 px-3.5 py-2 text-sm backdrop-blur sm:inline-block transition hover:bg-surface">Log in</a>
          <a href="#" className="whitespace-nowrap rounded-xl bg-ink px-3.5 py-2 text-sm font-medium text-ground transition hover:opacity-90">Get started</a>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-[22vh] pt-10 text-center sm:px-6">
        <h1 className="font-display text-[clamp(40px,7vw,76px)] leading-[1.02] font-extrabold tracking-[-0.035em] text-balance">
          Train a model that&apos;s yours
        </h1>
        <p className="mt-4 max-w-xl text-lg text-balance text-muted sm:text-xl">
          Pick any open model, bring your content, and get back weights you own.
        </p>

        <div className="mt-10 w-full max-w-[760px]">
          <Composer onSubmit={setBrief} />
        </div>
      </main>
    </div>
  );
}
