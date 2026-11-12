const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Formats a count as a compact string, e.g. 8_030_261_248 -> "8B", 1_200_000 -> "1.2M". */
export function formatCompactNumber(value: number): string {
  return compactNumberFormatter.format(value);
}
