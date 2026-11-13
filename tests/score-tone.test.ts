import { describe, expect, it } from "vitest";
import { nextSubLessonHref, scoreTone } from "@/lib/quiz/score-tone";

describe("scoreTone", () => {
  it("is none when nothing was answered", () => {
    expect(scoreTone(0, 0)).toBe("none");
  });

  it("is perfect when every answer was right", () => {
    expect(scoreTone(5, 5)).toBe("perfect");
  });

  it("is strong at 70% or more", () => {
    expect(scoreTone(7, 10)).toBe("strong");
    expect(scoreTone(4, 5)).toBe("strong");
  });

  it("is keep-going below 70%", () => {
    expect(scoreTone(6, 10)).toBe("keep-going");
    expect(scoreTone(0, 3)).toBe("keep-going");
  });
});

describe("nextSubLessonHref", () => {
  it("is null when there is no next sub-lesson", () => {
    expect(nextSubLessonHref(null)).toBeNull();
  });

  it("goes straight to the cards when the next sub-lesson has bites", () => {
    expect(nextSubLessonHref({ id: "sll_x", biteCount: 3 })).toBe("/learn/sll_x");
  });

  it("goes to the sub-lesson page when the next one has no bites yet", () => {
    expect(nextSubLessonHref({ id: "sll_y", biteCount: 0 })).toBe("/study/sll_y");
  });
});
