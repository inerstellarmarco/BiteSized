import { describe, expect, it } from "vitest";
import { addedBiteId, applySource, buildQuestion, parseBiteSource, SOURCE_NOTE_HIGH, SOURCE_NOTE_MEDIUM, type SubLessonFile } from "@/lib/packages/bite-source";

const body = "A list keeps items in order and you can change it. Think of a shopping list on the fridge: you add, cross out and reorder as the week goes on, and it is still the same list.";

const sample = `// a note
@@ sll_one | Lesson > Sub-lesson
## First idea
${body}

Second paragraph of the same card, split by a blank line.
?? What does a list keep?
+ The order of its items
- Only unique items
- Only numbers
- Nothing at all
= A list is ordered, so the first item stays first until you change it.
## Second idea
~m
${body}
?? Pick the true statement.
+ You can change a list
- A list is fixed forever
- A list is a number
- A list has no order
= Lists are mutable.
`;

function file(): SubLessonFile {
  const bite = (id: string, title: string, position: string) => ({
    id,
    title,
    body: "",
    sourceNote: "Outline topic · confidence: unset",
    lastReviewedOn: null,
    diagram: null,
    position,
    archivedAt: null,
    crossLinks: [{ id: "lnk_1" }],
    questions: [],
  });
  return { id: "sll_one", title: "Sub-lesson", bites: [bite("bit_aaa", "First idea", "a0"), bite("bit_bbb", "Second  Idea", "a1")] };
}

describe("parseBiteSource", () => {
  it("reads sub-lessons, bites, paragraphs and questions", () => {
    const parsed = parseBiteSource(sample);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("sll_one");
    expect(parsed[0].bites.map((bite) => bite.title)).toEqual(["First idea", "Second idea"]);
    expect(parsed[0].bites[0].body.split("\n\n")).toHaveLength(2);
    expect(parsed[0].bites[0].questions[0]).toEqual({
      prompt: "What does a list keep?",
      correct: "The order of its items",
      wrong: ["Only unique items", "Only numbers", "Nothing at all"],
      explanation: "A list is ordered, so the first item stays first until you change it.",
    });
    expect(parsed[0].bites[1].medium).toBe(true);
  });

  it("rejects a bite with no question, a short body, or a question with the wrong number of answers", () => {
    expect(() => parseBiteSource(`@@ sll_one\n## T\n${body}\n`)).toThrow(/no question/);
    expect(() => parseBiteSource("@@ sll_one\n## T\nToo short.\n?? Q\n+ a\n- b\n- c\n- d\n= e\n")).toThrow(/shorter/);
    expect(() => parseBiteSource(`@@ sll_one\n## T\n${body}\n?? Q\n+ a\n- b\n- c\n= e\n`)).toThrow(/3 wrong/);
    expect(() => parseBiteSource(`@@ sll_one\n## T\n${body}\n?? Q\n+ a\n- b\n- b\n- d\n= e\n`)).toThrow(/repeats/);
  });
});

describe("applySource", () => {
  it("fills bodies and questions and keeps ids, order and cross links", () => {
    const merged = applySource(file(), parseBiteSource(sample)[0]);
    expect(merged.bites.map((bite) => bite.id)).toEqual(["bit_aaa", "bit_bbb"]);
    expect(merged.bites[0].body).toContain("shopping list");
    expect(merged.bites[0].crossLinks).toEqual([{ id: "lnk_1" }]);
    expect(merged.bites[0].sourceNote).toBe(SOURCE_NOTE_HIGH);
    expect(merged.bites[1].sourceNote).toBe(SOURCE_NOTE_MEDIUM);
    expect(merged.bites[0].questions[0].id).toBe("q_aaa_1");
  });

  it("gives the same result when run twice", () => {
    const source = parseBiteSource(sample)[0];
    const once = applySource(file(), source);
    expect(applySource(once, source)).toEqual(once);
  });

  it("fails loudly when a title is not in the outline", () => {
    const source = parseBiteSource(sample.replace("## First idea", "## Some other idea"))[0];
    expect(() => applySource(file(), source)).toThrow(/no bite titled/);
  });

  it("adds an extra bite right after the one before it", () => {
    const source = parseBiteSource(sample.replace("## Second idea", "##+ An extra idea"))[0];
    const merged = applySource(file(), source);
    expect(merged.bites.map((bite) => bite.title)).toEqual(["First idea", "An extra idea", "Second  Idea"]);
    expect(merged.bites[1].id).toBe(addedBiteId("sll_one", "An extra idea"));
    expect(merged.bites[1].position > merged.bites[0].position).toBe(true);
    expect(merged.bites[1].position < merged.bites[2].position).toBe(true);
    expect(applySource(merged, source)).toEqual(merged);
  });
});

describe("archiving a duplicate", () => {
  it("archives the named bite and leaves the rest alone", () => {
    const cut = sample.slice(0, sample.indexOf("## Second idea"));
    const source = parseBiteSource(cut.replace("## First idea", ["-- Second idea", "## First idea"].join("\n")))[0];
    expect(source.archive).toEqual(["Second idea"]);
    const merged = applySource(file(), source);
    expect(merged.bites[0].archivedAt).toBeNull();
    expect(merged.bites[1].archivedAt).not.toBeNull();
    expect(applySource(merged, source)).toEqual(merged);
  });
});

describe("buildQuestion", () => {
  it("places the correct answer in a stable slot with four choices", () => {
    const source = { prompt: "Q", correct: "right", wrong: ["w1", "w2", "w3"], explanation: "because" };
    const built = buildQuestion("q_x_1", "a0", source);
    expect(built.choices.map((choice) => choice.id)).toEqual(["a", "b", "c", "d"]);
    expect(built.choices.find((choice) => choice.id === built.correctChoiceId)?.text).toBe("right");
    expect(buildQuestion("q_x_1", "a0", source)).toEqual(built);
  });

  it("does not always put the correct answer in the same place", () => {
    const source = { prompt: "Q", correct: "right", wrong: ["w1", "w2", "w3"], explanation: "because" };
    const slots = new Set(Array.from({ length: 40 }, (_, index) => buildQuestion(`q_${index}_1`, "a0", source).correctChoiceId));
    expect(slots.size).toBeGreaterThan(1);
  });
});
