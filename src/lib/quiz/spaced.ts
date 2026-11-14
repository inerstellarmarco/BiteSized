import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { asDate } from "@/lib/dates";
import { bites, lessons, questions, quizAnswers, quizAttempts, subLessons } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";
import { newId } from "@/lib/ids";
import type { Choice, QuestionType } from "@/lib/types";

export const SPACED_INTERVALS_DAYS = [1, 3, 7, 21] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export type SpacedEvent = {
  correct: boolean;
  at: Date;
};

export type SpacedState = {
  active: boolean;
  stage: number | null;
  intervalDays: number | null;
  lastReviewedAt: Date | null;
  dueAt: Date | null;
  isDue: boolean;
};

export type SpacedQuestionItem = {
  questionId: string;
  type: QuestionType;
  prompt: string;
  choices: Choice[];
  correctChoiceId: string;
  explanation: string;
  biteId: string;
  biteTitle: string;
  subLessonId: string;
  subLessonTitle: string;
  lessonCode: string;
  stage: number;
  intervalDays: number;
  lastReviewedAt: string;
  dueAt: string;
  isDue: boolean;
};

/**
 * Computes the 1 -> 3 -> 7 -> 21 day spaced-repetition schedule for a question
 * from the learner's chronological answer history.
 * - Any wrong answer starts (or resets) the question at stage 0 (due in 1 day).
 * - Each subsequent right answer while in the queue advances to the next stage (3d -> 7d -> 21d),
 *   and a right answer at stage 3 (21d) graduates the question out of the queue.
 */
export function computeSpacedState(events: readonly SpacedEvent[], now: Date = new Date()): SpacedState {
  let stage: number | null = null;
  let lastReviewedAt: Date | null = null;
  let dueAt: Date | null = null;

  for (const event of events) {
    if (!event.correct) {
      stage = 0;
      lastReviewedAt = event.at;
      dueAt = new Date(event.at.getTime() + SPACED_INTERVALS_DAYS[0] * DAY_MS);
    } else if (stage !== null) {
      const nextStage: number = stage + 1;
      if (nextStage < SPACED_INTERVALS_DAYS.length) {
        stage = nextStage;
        const days = SPACED_INTERVALS_DAYS[nextStage]!;
        lastReviewedAt = event.at;
        dueAt = new Date(event.at.getTime() + days * DAY_MS);
      } else {
        stage = null;
        lastReviewedAt = event.at;
        dueAt = null;
      }
    }
  }

  if (stage === null || !dueAt || !lastReviewedAt) {
    return {
      active: false,
      stage: null,
      intervalDays: null,
      lastReviewedAt,
      dueAt: null,
      isDue: false,
    };
  }

  const intervalDays = SPACED_INTERVALS_DAYS[stage]!;
  return {
    active: true,
    stage,
    intervalDays,
    lastReviewedAt,
    dueAt,
    isDue: dueAt.getTime() <= now.getTime(),
  };
}

export async function spacedQueue(db: AppDatabase, profileId: string, now: Date = new Date()) {
  const attempts = await db
    .select()
    .from(quizAttempts)
    .where(eq(quizAttempts.profileId, profileId))
    .orderBy(asc(quizAttempts.finishedAt), asc(quizAttempts.startedAt));
  if (attempts.length === 0) {
    return { due: [] as SpacedQuestionItem[], upcoming: [] as SpacedQuestionItem[], all: [] as SpacedQuestionItem[] };
  }

  const attemptIds = attempts.map((attempt) => attempt.id);
  const attemptTime = new Map(attempts.map((attempt) => [attempt.id, asDate(attempt.finishedAt) ?? new Date()]));
  const attemptOrder = new Map(attempts.map((attempt, index) => [attempt.id, index]));

  const answers = await db
    .select()
    .from(quizAnswers)
    .where(inArray(quizAnswers.attemptId, attemptIds));

  answers.sort((left, right) => {
    const orderDiff = (attemptOrder.get(left.attemptId) ?? 0) - (attemptOrder.get(right.attemptId) ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });

  const eventsByQuestion = new Map<string, SpacedEvent[]>();
  for (const answer of answers) {
    const at = attemptTime.get(answer.attemptId) ?? new Date();
    const list = eventsByQuestion.get(answer.questionId) ?? [];
    list.push({ correct: answer.correct, at });
    eventsByQuestion.set(answer.questionId, list);
  }

  const activeStates = new Map<string, SpacedState>();
  for (const [questionId, events] of eventsByQuestion.entries()) {
    const state = computeSpacedState(events, now);
    if (state.active) activeStates.set(questionId, state);
  }

  if (activeStates.size === 0) {
    return { due: [] as SpacedQuestionItem[], upcoming: [] as SpacedQuestionItem[], all: [] as SpacedQuestionItem[] };
  }

  const questionRows = await db
    .select()
    .from(questions)
    .where(and(inArray(questions.id, [...activeStates.keys()]), isNull(questions.archivedAt), eq(questions.reviewStatus, "approved")));
  if (questionRows.length === 0) {
    return { due: [] as SpacedQuestionItem[], upcoming: [] as SpacedQuestionItem[], all: [] as SpacedQuestionItem[] };
  }

  const biteIds = [...new Set(questionRows.map((row) => row.biteId))];
  const biteRows = await db
    .select()
    .from(bites)
    .where(and(inArray(bites.id, biteIds), isNull(bites.archivedAt), eq(bites.reviewStatus, "approved")));
  const biteById = new Map(biteRows.map((row) => [row.id, row]));

  const subLessonIds = [...new Set(biteRows.map((row) => row.subLessonId))];
  const subLessonRows = subLessonIds.length
    ? await db.select().from(subLessons).where(and(inArray(subLessons.id, subLessonIds), isNull(subLessons.archivedAt)))
    : [];
  const subLessonById = new Map(subLessonRows.map((row) => [row.id, row]));

  const lessonIds = [...new Set(subLessonRows.map((row) => row.lessonId))];
  const lessonRows = lessonIds.length
    ? await db.select().from(lessons).where(and(inArray(lessons.id, lessonIds), isNull(lessons.archivedAt)))
    : [];
  const lessonById = new Map(lessonRows.map((row) => [row.id, row]));

  const items: SpacedQuestionItem[] = [];
  for (const question of questionRows) {
    const state = activeStates.get(question.id);
    const bite = biteById.get(question.biteId);
    if (!state || !state.active || state.stage === null || !state.intervalDays || !state.dueAt || !state.lastReviewedAt || !bite) continue;
    const subLesson = subLessonById.get(bite.subLessonId);
    if (!subLesson) continue;
    const lesson = lessonById.get(subLesson.lessonId);
    items.push({
      questionId: question.id,
      type: question.type,
      prompt: question.prompt,
      choices: question.choices,
      correctChoiceId: question.correctChoiceId,
      explanation: question.explanation,
      biteId: bite.id,
      biteTitle: bite.title,
      subLessonId: subLesson.id,
      subLessonTitle: subLesson.title,
      lessonCode: lesson?.code ?? "",
      stage: state.stage,
      intervalDays: state.intervalDays,
      lastReviewedAt: state.lastReviewedAt.toISOString(),
      dueAt: state.dueAt.toISOString(),
      isDue: state.isDue,
    });
  }

  items.sort((left, right) => left.dueAt.localeCompare(right.dueAt));
  return {
    due: items.filter((item) => item.isDue),
    upcoming: items.filter((item) => !item.isDue),
    all: items,
  };
}

export async function recordSpacedReview(
  db: AppDatabase,
  input: {
    profileId: string;
    questionId: string;
    selectedChoiceId: string;
    now?: Date;
  },
) {
  const [question] = await db
    .select()
    .from(questions)
    .where(and(eq(questions.id, input.questionId), isNull(questions.archivedAt)));
  if (!question) return null;
  const [bite] = await db.select().from(bites).where(eq(bites.id, question.biteId));
  if (!bite) return null;

  const now = input.now ?? new Date();
  const correct = question.correctChoiceId === input.selectedChoiceId;
  const attemptId = newId("qza");
  await db.insert(quizAttempts).values({
    id: attemptId,
    profileId: input.profileId,
    subLessonId: bite.subLessonId,
    correctCount: correct ? 1 : 0,
    answeredCount: 1,
    totalCount: 1,
    stoppedEarly: true,
    startedAt: now,
    finishedAt: now,
  });
  await db.insert(quizAnswers).values({
    id: newId("qan"),
    attemptId,
    questionId: question.id,
    selectedChoiceId: input.selectedChoiceId,
    correct,
  });

  const queue = await spacedQueue(db, input.profileId, now);
  const updated = queue.all.find((item) => item.questionId === question.id) ?? null;

  return {
    correct,
    correctChoiceId: question.correctChoiceId,
    explanation: question.explanation,
    stage: updated?.stage ?? null,
    intervalDays: updated?.intervalDays ?? null,
    dueAt: updated?.dueAt ?? null,
    graduated: correct && updated === null,
  };
}
