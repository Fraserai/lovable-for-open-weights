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
export const ArrowRight = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
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
export const Spark = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
  </svg>
);
export const Flask = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
    <path d="M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" /><path d="M7.5 15h9" />
  </svg>
);
export const Chat = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
    <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z" />
  </svg>
);
export const Layers = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
    <path d="m12 3 9 5-9 5-9-5 9-5z" /><path d="m3 13 9 5 9-5" />
  </svg>
);
export const Database = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
    <ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" /><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5" />
  </svg>
);
export const Sliders = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" />
  </svg>
);
export const Target = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
    <circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".6" fill="currentColor" />
  </svg>
);
export const FileCog = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4M14 3v5h5M14 3l5 5v3" /><circle cx="17" cy="17" r="2.5" />
    <path d="M17 13v1.5M17 19.5V21M13 17h1.5M19.5 17H21" />
  </svg>
);
export const Rocket = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
    <path d="M14 4c3-1 5.5-1 6-.5s.5 3-.5 6L13 16l-5-5 6-7z" /><path d="M8 11l-3.5.5L3 14l4 1M13 16l-.5 3.5L10 21l-1-4" />
    <circle cx="15.5" cy="8.5" r="1.3" />
  </svg>
);
export const Upload = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
    <path d="M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </svg>
);
export const Search = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></svg>
);
export const Eye = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
    <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" /><circle cx="12" cy="12" r="2.8" />
  </svg>
);
export const Menu = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const External = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
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
