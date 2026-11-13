// The actions a learner can take on a bite card. One list feeds both the
// "..." menu on phones and the row of buttons at the bottom of the card on
// desktop, so the two can never drift apart.
export type BiteActionId = "regenerate" | "revisit" | "rework" | "error" | "example";

export type BiteAction = { id: BiteActionId; label: string; testId?: string };

const LEARNER_ACTIONS: BiteAction[] = [
  { id: "regenerate", label: "Regenerate…", testId: "regenerate-menu" },
  { id: "revisit", label: "Revisit later" },
  { id: "rework", label: "Flag for rework", testId: "flag-rework" },
  { id: "error", label: "Report an error" },
];

const ADMIN_ACTIONS: BiteAction[] = [{ id: "example", label: "Use as style example", testId: "style-example" }];

export function biteActions(isAdmin: boolean): BiteAction[] {
  return isAdmin ? [...LEARNER_ACTIONS, ...ADMIN_ACTIONS] : [...LEARNER_ACTIONS];
}

// Bite bodies are plain text. A blank line starts a new paragraph.
export function bodyParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
