import { generateKeyBetween } from "fractional-indexing";

export function comparePosition(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function keyForInsert(occupied: string[], orderedActive: string[], index: number): string {
  const clamped = Math.max(0, Math.min(index, orderedActive.length));
  const prev = clamped === 0 ? null : orderedActive[clamped - 1];
  const next = clamped >= orderedActive.length ? null : orderedActive[clamped];
  return unusedKey(occupied, prev, next);
}

export function keyForMove(occupied: string[], orderedOthers: string[], index: number): string {
  return keyForInsert(occupied, orderedOthers, index);
}

function unusedKey(occupied: string[], prev: string | null, next: string | null): string {
  const taken = new Set(occupied);
  let key = generateKeyBetween(prev, next);
  let guard = 0;
  while (taken.has(key) && guard < 12) {
    key = generateKeyBetween(key, next);
    guard += 1;
  }
  if (taken.has(key)) {
    throw new Error("Could not find a free position key.");
  }
  return key;
}
