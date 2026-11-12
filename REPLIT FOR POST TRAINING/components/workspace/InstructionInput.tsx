interface InstructionInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const PLACEHOLDER =
  "Train this model to become highly capable at answering questions about Australian superannuation using the data I provide.";

export function InstructionInput({ value, onChange, disabled }: InstructionInputProps) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      placeholder={PLACEHOLDER}
      rows={5}
      className="w-full resize-none rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-fg placeholder:text-fg-subtle outline-none transition-colors focus:border-border-strong disabled:cursor-not-allowed disabled:opacity-60"
    />
  );
}
