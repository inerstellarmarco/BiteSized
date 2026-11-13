export type ScoreTone = "perfect" | "strong" | "keep-going" | "none";

// How a quiz score should feel on the result screen.
export function scoreTone(correct: number, answered: number): ScoreTone {
  if (answered <= 0) return "none";
  if (correct >= answered) return "perfect";
  if (correct / answered >= 0.7) return "strong";
  return "keep-going";
}

export const SCORE_HEADLINES: Record<ScoreTone, string> = {
  perfect: "Every answer you gave was right.",
  strong: "Solid work. Most of it landed.",
  "keep-going": "Worth another look. The notes below show where.",
  none: "No answers to score yet.",
};

// Where "next sub-lesson" should take the learner: straight to the cards
// when there are some, otherwise to the sub-lesson page that says it is coming.
export function nextSubLessonHref(next: { id: string; biteCount: number } | null): string | null {
  if (!next) return null;
  return next.biteCount > 0 ? `/learn/${next.id}` : `/study/${next.id}`;
}
