import type { Choice } from "@/lib/types";
import { AI_UNAVAILABLE, LlmUnavailableError, type LlmProvider } from "@/lib/llm";

export type AnswerDraft = {
  prompt: string;
  choices: Choice[];
  correctChoiceId: string;
  explanation: string;
};

export function structuralAnswerCheck(question: AnswerDraft): { ok: boolean; note: string } {
  if (question.choices.length < 2) return { ok: false, note: "A question needs at least two choices." };
  const ids = question.choices.map((choice) => choice.id);
  if (new Set(ids).size !== ids.length) return { ok: false, note: "Choice ids are not unique." };
  const texts = question.choices.map((choice) => choice.text.trim().toLowerCase());
  if (new Set(texts).size !== texts.length) return { ok: false, note: "Two choices say the same thing." };
  const matches = ids.filter((id) => id === question.correctChoiceId).length;
  if (matches !== 1) return { ok: false, note: "The question needs exactly one correct choice." };
  if (!question.prompt.trim() || !question.explanation.trim()) return { ok: false, note: "Prompt and explanation are required." };
  return { ok: true, note: "" };
}

export async function checkAnswerKey(provider: LlmProvider, question: AnswerDraft): Promise<{ status: "confirmed" | "flagged"; note: string }> {
  const structural = structuralAnswerCheck(question);
  if (!structural.ok) return { status: "flagged", note: structural.note };
  try {
    const raw = await provider.complete({
      system: "You check multiple-choice questions. Reply as JSON with verdict confirmed or flagged, and a short note. Flag a question when more than one choice could be defended.",
      user: `TASK: answer-check\nPROMPT: ${question.prompt}\nCHOICES:\n${question.choices.map((choice) => `- ${choice.id}: ${choice.text}`).join("\n")}\nMARKED CORRECT: ${question.correctChoiceId}\nEXPLANATION: ${question.explanation}`,
      temperature: 0,
      json: true,
    });
    const parsed = JSON.parse(raw) as { verdict?: string; note?: string };
    if (parsed.verdict !== "confirmed") {
      return { status: "flagged", note: parsed.note || "The checker was not sure this has one clear answer." };
    }
    return { status: "confirmed", note: parsed.note || "One clear answer." };
  } catch (error) {
    if (error instanceof LlmUnavailableError) return { status: "flagged", note: AI_UNAVAILABLE };
    return { status: "flagged", note: "The checker could not read an answer key." };
  }
}
