import { and, asc, eq, isNull } from "drizzle-orm";
import { bites, biteLinks, lessons, questions, subCategories, subLessons, categories } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";
import { archiveEntity } from "@/lib/content/ops";
import { checkAnswerKey, type AnswerDraft } from "@/lib/generation/answer-key";
import { generateForSubLesson } from "@/lib/generation/pipeline";
import { getLlmClient } from "@/lib/llm";
import type { Choice } from "@/lib/types";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function reviewQueue(db: AppDatabase) {
  const pendingBites = await db.select().from(bites).where(and(eq(bites.reviewStatus, "pending"), isNull(bites.archivedAt)));
  const ids = [...new Set(pendingBites.map((bite) => bite.subLessonId))];
  if (ids.length === 0) return [];
  const subs = await db.select().from(subLessons);
  const lessonRows = await db.select().from(lessons);
  return ids.map((id) => {
    const sub = subs.find((row) => row.id === id);
    const lesson = lessonRows.find((row) => row.id === sub?.lessonId);
    const bitesHere = pendingBites.filter((bite) => bite.subLessonId === id);
    return {
      id,
      title: sub?.title ?? "Sub-lesson",
      lessonCode: lesson?.code ?? "",
      lessonTitle: lesson?.title ?? "",
      pendingBites: bitesHere.length,
    };
  });
}

export async function loadReview(db: AppDatabase, subLessonId: string) {
  const [subLesson] = await db.select().from(subLessons).where(eq(subLessons.id, subLessonId));
  if (!subLesson) return null;
  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, subLesson.lessonId));
  const [subCategory] = lesson ? await db.select().from(subCategories).where(eq(subCategories.id, lesson.subCategoryId)) : [];
  const [category] = subCategory ? await db.select().from(categories).where(eq(categories.id, subCategory.categoryId)) : [];
  const biteRows = await db
    .select()
    .from(bites)
    .where(and(eq(bites.subLessonId, subLessonId), isNull(bites.archivedAt), eq(bites.reviewStatus, "pending")))
    .orderBy(asc(bites.position));
  const questionRows = biteRows.length
    ? await db.select().from(questions).where(isNull(questions.archivedAt)).orderBy(asc(questions.position))
    : [];
  const linkRows = biteRows.length ? await db.select().from(biteLinks) : [];
  return {
    subLesson,
    lesson,
    levelTag: subCategory?.levelTag ?? "",
    categoryTitle: category?.title ?? "",
    bites: biteRows.map((bite) => ({
      ...bite,
      crossLinks: linkRows.filter((link) => link.biteId === bite.id),
      questions: questionRows.filter((question) => question.biteId === bite.id && !question.archivedAt),
    })),
  };
}

export async function batchApprove(db: AppDatabase, subLessonId: string) {
  const detail = await loadReview(db, subLessonId);
  if (!detail) return { ok: false as const, error: "That sub-lesson is not available." };
  const flagged = detail.bites.flatMap((bite) => bite.questions).filter((question) => question.answerKeyStatus === "flagged");
  if (flagged.length > 0) {
    return { ok: false as const, error: `${flagged.length} flagged answer ${flagged.length === 1 ? "key needs" : "keys need"} a fix before approval.` };
  }
  const stamp = today();
  for (const bite of detail.bites) {
    await db.update(bites).set({ reviewStatus: "approved", lastReviewedOn: stamp, updatedAt: new Date() }).where(eq(bites.id, bite.id));
    for (const question of bite.questions) {
      await db.update(questions).set({ reviewStatus: "approved", updatedAt: new Date() }).where(eq(questions.id, question.id));
    }
  }
  return { ok: true as const, approved: detail.bites.length };
}

export async function saveBiteDraft(db: AppDatabase, biteId: string, input: { title: string; body: string }) {
  await db.update(bites).set({ title: input.title.trim(), body: input.body.trim(), updatedAt: new Date() }).where(eq(bites.id, biteId));
}

export async function saveQuestionDraft(
  db: AppDatabase,
  questionId: string,
  input: { prompt: string; choices: Choice[]; correctChoiceId: string; explanation: string },
) {
  const answer: AnswerDraft = input;
  const checked = await checkAnswerKey(getLlmClient(), answer);
  await db
    .update(questions)
    .set({
      prompt: input.prompt.trim(),
      choices: input.choices,
      correctChoiceId: input.correctChoiceId,
      explanation: input.explanation.trim(),
      answerKeyStatus: checked.status,
      answerKeyNote: checked.note,
      updatedAt: new Date(),
    })
    .where(eq(questions.id, questionId));
  return checked;
}

export async function discardBite(db: AppDatabase, biteId: string) {
  await archiveEntity(db, "bite", biteId);
  const rows = await db.select().from(questions).where(eq(questions.biteId, biteId));
  for (const question of rows) await archiveEntity(db, "question", question.id);
}

export async function regenerateBite(db: AppDatabase, biteId: string) {
  const [bite] = await db.select().from(bites).where(eq(bites.id, biteId));
  if (!bite) return { ok: false as const, error: "Missing bite." };
  await db.update(bites).set({ body: "", updatedAt: new Date() }).where(eq(bites.id, biteId));
  const existing = await db.select().from(questions).where(eq(questions.biteId, biteId));
  for (const question of existing) {
    if (question.reviewStatus === "pending") await archiveEntity(db, "question", question.id);
  }
  try {
    await generateForSubLesson(db, bite.subLessonId);
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "AI unavailable, try later" };
  }
  return { ok: true as const };
}
