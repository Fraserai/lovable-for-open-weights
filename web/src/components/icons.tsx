type P = { className?: string };
const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const Plus = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden><path d="M12 5v14M5 12h14" /></svg>
);
export const Mic = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);
export const ArrowUp = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} strokeWidth={2.2} aria-hidden><path d="M12 19V5M5 12l7-7 7 7" /></svg>
);
export const Chevron = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden><path d="m6 9 6 6 6-6" /></svg>
);
export const Close = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const Doc = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" />
  </svg>
);
export const Check = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} strokeWidth={2.2} aria-hidden><path d="m5 12 5 5 9-10" /></svg>
);

// The mark: three stacked plates (weights / model layers)
export const Logo = ({ className }: P) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden>
    <defs>
      <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#2dd4bf" /><stop offset=".55" stopColor="#4f73ff" /><stop offset="1" stopColor="#9b7bff" />
      </linearGradient>
    </defs>
    <rect x="3" y="4" width="26" height="6" rx="3" fill="url(#lg)" />
    <rect x="6" y="13" width="20" height="6" rx="3" fill="url(#lg)" opacity=".8" />
    <rect x="9" y="22" width="14" height="6" rx="3" fill="url(#lg)" opacity=".6" />
  </svg>
);
