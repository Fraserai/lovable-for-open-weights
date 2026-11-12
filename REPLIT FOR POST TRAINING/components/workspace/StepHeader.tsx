interface StepHeaderProps {
  index: number;
  title: string;
  description?: string;
}

export function StepHeader({ index, title, description }: StepHeaderProps) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border-strong font-mono text-[11px] text-fg-subtle">
        {index}
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-medium text-fg">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm leading-relaxed text-fg-muted">{description}</p>
        ) : null}
      </div>
    </div>
  );
}
