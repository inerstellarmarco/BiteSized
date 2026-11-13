import { describe, expect, it } from "vitest";
import { summarizeProgress } from "@/lib/content/course-progress";

describe("summarizeProgress", () => {
  it("reports empty when no sub-lesson has bites", () => {
    expect(summarizeProgress([])).toEqual({ seen: 0, total: 0, percent: 0, status: "empty" });
    expect(summarizeProgress([{ seenCount: 0, biteCount: 0 }]).status).toBe("empty");
  });

  it("reports not-started when nothing has been seen", () => {
    expect(summarizeProgress([{ seenCount: 0, biteCount: 4 }])).toEqual({ seen: 0, total: 4, percent: 0, status: "not-started" });
  });

  it("sums progress across sub-lessons and ignores ones without bites", () => {
    const result = summarizeProgress([
      { seenCount: 1, biteCount: 2 },
      { seenCount: 0, biteCount: 0 },
      { seenCount: 2, biteCount: 2 },
    ]);
    expect(result).toEqual({ seen: 3, total: 4, percent: 75, status: "in-progress" });
  });

  it("reports complete when every bite is seen", () => {
    expect(summarizeProgress([{ seenCount: 3, biteCount: 3 }]).status).toBe("complete");
  });

  it("caps overcounted seen values at the bite count", () => {
    expect(summarizeProgress([{ seenCount: 9, biteCount: 3 }])).toEqual({ seen: 3, total: 3, percent: 100, status: "complete" });
  });
});
