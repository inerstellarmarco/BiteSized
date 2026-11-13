import { describe, expect, it } from "vitest";
import { biteActions, bodyParagraphs } from "@/lib/bite-actions";

describe("biteActions", () => {
  it("gives learners the four card actions in order", () => {
    expect(biteActions(false).map((action) => action.label)).toEqual([
      "Regenerate…",
      "Revisit later",
      "Flag for rework",
      "Report an error",
    ]);
  });

  it("adds the style example action for admins only", () => {
    expect(biteActions(false).some((action) => action.id === "example")).toBe(false);
    const admin = biteActions(true);
    expect(admin[admin.length - 1]).toEqual({ id: "example", label: "Use as style example", testId: "style-example" });
  });

  it("keeps the test ids the browser tests rely on", () => {
    const ids = biteActions(true).map((action) => action.testId);
    expect(ids).toContain("regenerate-menu");
    expect(ids).toContain("flag-rework");
    expect(ids).toContain("style-example");
  });
});

describe("bodyParagraphs", () => {
  it("returns a single paragraph for a body with no blank lines", () => {
    expect(bodyParagraphs("One idea.")).toEqual(["One idea."]);
  });

  it("splits on blank lines and trims each paragraph", () => {
    expect(bodyParagraphs("First.\n\n  Second. \n \nThird.")).toEqual(["First.", "Second.", "Third."]);
  });

  it("returns nothing for an empty body", () => {
    expect(bodyParagraphs("")).toEqual([]);
    expect(bodyParagraphs("  \n\n ")).toEqual([]);
  });
});
