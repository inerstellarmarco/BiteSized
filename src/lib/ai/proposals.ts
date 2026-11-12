import { asc, eq, isNull } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { lessons, subLessons, subLessonProposals } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";
import { enqueueSubLesson, processDueJobs } from "@/lib/generation/pipeline";
import { newId } from "@/lib/ids";
import { getLlmClient, type LlmProvider } from "@/lib/llm";
import { latestLockedStyle } from "@/lib/style/guide";

export async function suggestLesson(db: AppDatabase, title: string, notes: string, provider: LlmProvider = getLlmClient()) {
  const lessonRows = await db.select().from(lessons).where(isNull(lessons.archivedAt)).orderBy(asc(lessons.position));
  const raw = await provider.complete({
    system: "Choose the lesson a new sub-lesson belongs under. Return JSON with lessonCode and reason.",
    user: `TASK: place\nTITLE: ${title}\nNOTES: ${notes}\nLESSONS:\n${lessonRows.map((lesson) => `${lesson.code} ${lesson.title}`).join("\n")}`,
    temperature: 0,
    json: true,
  });
  const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { lessonCode?: string; reason?: string };
  const match = lessonRows.find((lesson) => lesson.code === parsed.lessonCode) ?? lessonRows[0];
  return { lessonId: match?.id ?? null, reason: parsed.reason ?? "Suggested from the course tree." };
}

export async function createProposal(db: AppDatabase, input: { profileId: string; title: string; notes: string; provider?: LlmProvider }) {
  const suggestion = await suggestLesson(db, input.title, input.notes, input.provider);
  const id = newId("prp");
  await db.insert(subLessonProposals).values({
    id,
    profileId: input.profileId,
    title: input.title.trim(),
    notes: input.notes.trim(),
    status: "pending",
    suggestedLessonId: suggestion.lessonId,
    suggestedReason: suggestion.reason,
  });
  return { id, ...suggestion };
}

export async function approveProposal(db: AppDatabase, proposalId: string, lessonId: string) {
  const [proposal] = await db.select().from(subLessonProposals).where(eq(subLessonProposals.id, proposalId));
  if (!proposal || proposal.status !== "pending") return { ok: false as const, error: "That proposal is not waiting." };
  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId));
  if (!lesson) return { ok: false as const, error: "Choose a lesson for this sub-lesson." };
  const siblings = await db.select().from(subLessons).where(eq(subLessons.lessonId, lessonId));
  const position = generateKeyBetween(siblings.map((row) => row.position).sort().at(-1) ?? null, null);
  const subLessonId = newId("sll");
  await db.insert(subLessons).values({ id: subLessonId, lessonId, title: proposal.title, position });
  await db.update(subLessonProposals).set({ status: "approved", createdSubLessonId: subLessonId }).where(eq(subLessonProposals.id, proposalId));
  const style = await latestLockedStyle(db);
  if (style) {
    await enqueueSubLesson(db, subLessonId, style.id);
    await processDueJobs(db, 1);
  }
  return { ok: true as const, subLessonId };
}
