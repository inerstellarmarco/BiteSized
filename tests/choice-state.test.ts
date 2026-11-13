import { describe, expect, it } from "vitest";
import { choiceState } from "@/lib/quiz/choice-state";

describe("choiceState", () => {
  it("highlights the learner's pick before the reveal", () => {
    expect(choiceState("a", "a", null)).toBe("picked");
    expect(choiceState("b", "a", null)).toBe("idle");
    expect(choiceState("a", null, null)).toBe("idle");
  });

  it("marks the correct choice green after the reveal", () => {
    expect(choiceState("a", "a", { correctChoiceId: "a" })).toBe("correct");
    expect(choiceState("a", "b", { correctChoiceId: "a" })).toBe("correct");
  });

  it("marks a wrong pick red and fades the rest", () => {
    expect(choiceState("b", "b", { correctChoiceId: "a" })).toBe("wrong-pick");
    expect(choiceState("c", "b", { correctChoiceId: "a" })).toBe("dimmed");
  });
});
