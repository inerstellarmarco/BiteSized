import type { LlmProvider, LlmRequest } from "@/lib/llm/types";

function field(user: string, label: string): string {
  const match = new RegExp(`^${label}:\\s*(.+)$`, "m").exec(user);
  return match?.[1]?.trim() ?? "";
}

function topicsFrom(user: string): string[] {
  const block = user.split("TOPICS:")[1] ?? "";
  const lines = block
    .split("\n")
    .map((line) => line.replace(/^-\s*/, "").trim())
    .filter((line) => line.length > 0 && !line.startsWith("NOTES:") && !line.startsWith("TASK:"));
  return lines.slice(0, 3);
}

function questionsFor(title: string) {
  return [
    {
      prompt: `Which statement best matches ${title}?`,
      choices: [
        { id: "a", text: `${title} is the idea this card is about` },
        { id: "b", text: "It is a kind of database password" },
        { id: "c", text: "It only matters in a spreadsheet" },
        { id: "d", text: "It means the opposite of the card" },
      ],
      correctChoiceId: "a",
      explanation: `The card is about ${title}. The other lines are distractors.`,
    },
    {
      prompt: `What should you do first when you meet ${title}?`,
      choices: [
        { id: "a", text: "Skip it" },
        { id: "b", text: "Name the idea in plain words before you trust the details" },
        { id: "c", text: "Memorise a slogan" },
        { id: "d", text: "Ignore the source" },
      ],
      correctChoiceId: "b",
      explanation: "Name the idea first. That is the habit these cards are building.",
    },
  ];
}

export function mockComplete(input: LlmRequest): string {
  if (input.user.includes("TASK: place")) {
    const code = input.user.match(/\b([A-Z]\d+\.\d+)\b/)?.[1] ?? "";
    return JSON.stringify({ lessonCode: code, reason: "It continues that lesson." });
  }
  if (input.user.includes("TASK: regenerate")) {
    const preset = field(input.user, "PRESET");
    const title = field(input.user, "TITLE") || "this idea";
    const body =
      preset === "analogy"
        ? `${title} is like a labelled jar. Read the label before you use what is inside.`
        : preset === "different"
          ? `Another way to see ${title}: start from what you want, then walk back to the first step.`
          : `Simply put, ${title} is one idea. Name it, then stop.`;
    const diagram = input.user.includes("BAD_DIAGRAM") ? "this will not render ((((" : "flowchart TD\n  A[Start] --> B[Idea]";
    return JSON.stringify({ title, body, diagram });
  }
  if (input.user.includes("TASK: answer-check")) {
    if (input.user.includes("DOUBTFUL")) {
      return JSON.stringify({ verdict: "flagged", note: "More than one choice could be defended." });
    }
    return JSON.stringify({ verdict: "confirmed", note: "One clear answer." });
  }

  if (input.user.includes("TASK: questions")) {
    const title = field(input.user, "BITE") || "this idea";
    return JSON.stringify({ questions: questionsFor(title) });
  }

  const listed = topicsFrom(input.user);
  const topic = field(input.user, "TOPIC") || listed[0] || "the idea";
  const titles = listed.length > 0 ? listed : [topic, `A second look at ${topic}`];
  const bites = titles.slice(0, 3).map((title, index) => ({
    title,
    body:
      index === 0
        ? `Here is the idea in everyday words: ${title}. Picture one real example, name it, and stop. You can hold that in about half a minute.`
        : `When this shows up in real work, say what ${title} means before you use it. A short check now saves a long muddle later.`,
  }));
  return JSON.stringify({ bites });
}

export const mockProvider: LlmProvider = {
  id: "mock",
  async complete(input) {
    return mockComplete(input);
  },
};
