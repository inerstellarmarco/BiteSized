export const QUESTION_TYPE_LABELS: Record<string, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True or false",
  predict_output: "Predict the output",
};

/**
 * Orders questions for a quiz retake:
 * - No duplicate questions within a retake
 * - Random order
 * - The question just missed (or any missed question from the last attempt, when a non-missed question exists)
 *   does not come straight back as the first question.
 */
export function orderForRetake<T extends { id: string }>(
  questions: readonly T[],
  lastMissedIds: readonly string[],
  random: () => number = Math.random,
): T[] {
  const unique: T[] = [];
  const seen = new Set<string>();
  for (const question of questions) {
    if (seen.has(question.id)) continue;
    seen.add(question.id);
    unique.push(question);
  }
  if (unique.length <= 1) return unique;

  const shuffled = [...unique];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(random() * (index + 1));
    const current = shuffled[index]!;
    shuffled[index] = shuffled[pick]!;
    shuffled[pick] = current;
  }

  const missedSet = new Set(lastMissedIds);
  const justMissedId = lastMissedIds.at(-1) ?? null;

  // Prefer starting with a question that was not missed at all in the previous attempt.
  if (missedSet.size > 0 && missedSet.has(shuffled[0]!.id)) {
    const nonMissedIndex = shuffled.findIndex((item) => !missedSet.has(item.id));
    if (nonMissedIndex > 0) {
      const first = shuffled[0]!;
      shuffled[0] = shuffled[nonMissedIndex]!;
      shuffled[nonMissedIndex] = first;
    } else if (justMissedId && shuffled[0]!.id === justMissedId) {
      // Every question in the sub-lesson was missed; make sure the last one missed is not first.
      const otherIndex = shuffled.findIndex((item) => item.id !== justMissedId);
      if (otherIndex > 0) {
        const first = shuffled[0]!;
        shuffled[0] = shuffled[otherIndex]!;
        shuffled[otherIndex] = first;
      }
    }
  }

  return shuffled;
}
