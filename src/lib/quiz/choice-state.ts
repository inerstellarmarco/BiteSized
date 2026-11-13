export type ChoiceState = "idle" | "picked" | "correct" | "wrong-pick" | "dimmed";

// What a quiz choice should look like. Before the answer is revealed the
// learner's pick is highlighted. After it is revealed, the correct choice is
// green, a wrong pick is red, and the rest fade back.
export function choiceState(choiceId: string, selectedId: string | null, revealed: { correctChoiceId: string } | null): ChoiceState {
  if (!revealed) return choiceId === selectedId ? "picked" : "idle";
  if (choiceId === revealed.correctChoiceId) return "correct";
  if (choiceId === selectedId) return "wrong-pick";
  return "dimmed";
}
