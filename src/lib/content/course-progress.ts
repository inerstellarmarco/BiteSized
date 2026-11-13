export type ProgressItem = { seenCount: number; biteCount: number };

export type ProgressSummary = {
  seen: number;
  total: number;
  percent: number;
  status: "not-started" | "in-progress" | "complete" | "empty";
};

// Sums bite progress across sub-lessons. Items with no bites are ignored,
// and seen is capped at each item's bite count so overcounts never show >100%.
export function summarizeProgress(items: ProgressItem[]): ProgressSummary {
  let seen = 0;
  let total = 0;
  for (const item of items) {
    if (item.biteCount <= 0) continue;
    total += item.biteCount;
    seen += Math.min(Math.max(item.seenCount, 0), item.biteCount);
  }
  if (total === 0) return { seen: 0, total: 0, percent: 0, status: "empty" };
  const percent = Math.round((seen / total) * 100);
  const status = seen === 0 ? "not-started" : seen >= total ? "complete" : "in-progress";
  return { seen, total, percent, status };
}
