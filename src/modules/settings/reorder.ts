/** Pure reorder helpers for drag-to-reorder lists and their keyboard alternative (move up / move down). */

/** Move the item at `from` to index `to` (drag and drop). Out-of-range indexes return an unchanged copy. */
export function moveToIndex<T>(ids: readonly T[], from: number, to: number): T[] {
  const out = [...ids];
  if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) return out;
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

/** Move `id` by `delta` positions (negative = up). Moves clamp at the ends; unknown ids return the list unchanged. */
export function moveItem<T>(ids: readonly T[], id: T, delta: number): T[] {
  const from = ids.indexOf(id);
  if (from < 0) return [...ids];
  const to = Math.min(ids.length - 1, Math.max(0, from + delta));
  return moveToIndex(ids, from, to);
}

/** Sequence numbers (1-based) for an ordered id list: the values stored in `sequence`. */
export function sequencesFor(ids: readonly string[]): { id: string; sequence: number }[] {
  return ids.map((id, i) => ({ id, sequence: i + 1 }));
}

/** True when `next` is a permutation of `current` (same ids, no additions or drops). */
export function isPermutation(current: readonly string[], next: readonly string[]): boolean {
  if (current.length !== next.length) return false;
  const a = [...current].sort();
  const b = [...next].sort();
  return a.every((x, i) => x === b[i]);
}
