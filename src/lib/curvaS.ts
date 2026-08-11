export function truncateAfterRealCompletion<T>(
  items: readonly T[],
  getRealPct: (item: T) => number,
): T[] {
  const completionIndex = items.findIndex((item) => getRealPct(item) >= 100);
  return completionIndex === -1 ? [...items] : items.slice(0, completionIndex + 1);
}
