import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { activeBites } from "@/lib/content/ops";
import { asDate } from "@/lib/dates";
import { learnerCursors, questions, quizAnswers, quizAttempts } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";
import { newId } from "@/lib/ids";
import { orderForRetake } from "@/lib/quiz/retake";
import { scoreQuiz, type ScoreAnswer } from "@/lib/quiz/score";
import { QUESTION_TYPES, type Choice, type QuestionType } from "@/lib/types";

export type PublicQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  choices: Choice[];
  biteTitle: string;
};

export type AttemptHistoryEntry = {
  id: string;
  correctCount: number;
  answeredCount: number;
  totalCount: number;
  percent: number;
  stoppedEarly: boolean;
  finishedAt: string;
  wrongIds: string[];
};

export async function subLessonAttemptHistory(
  db: AppDatabase,
  profileId: string,
  subLessonId: string,
): Promise<AttemptHistoryEntry[]> {
  const attempts = await db
    .select()
    .from(quizAttempts)
    .where(and(eq(quizAttempts.profileId, profileId), eq(quizAttempts.subLessonId, subLessonId)))
    .orderBy(desc(quizAttempts.finishedAt), desc(quizAttempts.startedAt));
  if (attempts.length === 0) return [];

  const attemptIds = attempts.map((row) => row.id);
  const answers = await db
    .select()
    .from(quizAnswers)
    .where(inArray(quizAnswers.attemptId, attemptIds));

  const wrongByAttempt = new Map<string, string[]>();
  for (const answer of answers) {
    if (answer.correct) continue;
    const list = wrongByAttempt.get(answer.attemptId) ?? [];
    list.push(answer.questionId);
    wrongByAttempt.set(answer.attemptId, list);
  }

  return attempts.map((attempt) => ({
    id: attempt.id,
    correctCount: attempt.correctCount,
    answeredCount: attempt.answeredCount,
    totalCount: attempt.totalCount,
    percent: attempt.answeredCount === 0 ? 0 : Math.round((attempt.correctCount / attempt.answeredCount) * 100),
    stoppedEarly: attempt.stoppedEarly,
    finishedAt: (asDate(attempt.finishedAt) ?? new Date()).toISOString(),
    wrongIds: wrongByAttempt.get(attempt.id) ?? [],
  }));
}

export async function quizQuestions(
  db: AppDatabase,
  subLessonId: string,
  options?: {
    profileId?: string;
    retake?: boolean;
    lastMissedIds?: string[];
    random?: () => number;
  },
) {
  const bitesInLesson = await activeBites(db, subLessonId);
  const biteIds = bitesInLesson.map((bite) => bite.id);
  if (biteIds.length === 0) {
    return {
      questions: [] as PublicQuestion[],
      answerKey: [],
      skipped: 0,
      isRetake: false,
      history: [] as AttemptHistoryEntry[],
    };
  }
  const rows = await db
    .select()
    .from(questions)
    .where(and(inArray(questions.biteId, biteIds), isNull(questions.archivedAt), eq(questions.reviewStatus, "approved")))
    .orderBy(asc(questions.position));
  const biteOrder = new Map(bitesInLesson.map((bite, index) => [bite.id, index]));
  const biteTitle = new Map(bitesInLesson.map((bite) => [bite.id, bite.title]));
  const ordered = rows.sort((a, b) => {
    const biteDiff = (biteOrder.get(a.biteId) ?? 0) - (biteOrder.get(b.biteId) ?? 0);
    if (biteDiff !== 0) return biteDiff;
    return a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
  });
  const playable = ordered.filter((row) => QUESTION_TYPES.includes(row.type));

  const history = options?.profileId ? await subLessonAttemptHistory(db, options.profileId, subLessonId) : [];
  const isRetake = Boolean(options?.retake || history.length > 0);
  const lastMissedIds = options?.lastMissedIds ?? history[0]?.wrongIds ?? [];
  const arranged = isRetake ? orderForRetake(playable, lastMissedIds, options?.random) : playable;

  return {
    skipped: ordered.length - playable.length,
    isRetake,
    history,
    questions: arranged.map((row) => ({
      id: row.id,
      type: row.type,
      prompt: row.prompt,
      choices: row.choices,
      biteTitle: biteTitle.get(row.biteId) ?? "",
    })),
    answerKey: arranged.map((row) => ({
      id: row.id,
      correctChoiceId: row.correctChoiceId,
      explanation: row.explanation,
    })),
  };
}

export async function saveQuizAttempt(
  db: AppDatabase,
  input: {
    profileId: string;
    subLessonId: string;
    answers: ScoreAnswer[];
    stoppedEarly?: boolean;
  },
) {
  const quiz = await quizQuestions(db, input.subLessonId);
  const score = scoreQuiz(quiz.answerKey, input.answers);
  const stoppedEarly = input.stoppedEarly === true || score.stoppedEarly;
  const now = new Date();
  const attemptId = newId("qza");
  await db.insert(quizAttempts).values({
    id: attemptId,
    profileId: input.profileId,
    subLessonId: input.subLessonId,
    correctCount: score.correct,
    answeredCount: score.answered,
    totalCount: score.total,
    stoppedEarly,
    startedAt: now,
    finishedAt: now,
  });
  const key = new Map(quiz.answerKey.map((question) => [question.id, question]));
  const savedWrong: string[] = [];
  const seen = new Set<string>();
  for (const answer of input.answers) {
    if (!answer.selectedChoiceId || seen.has(answer.questionId)) continue;
    const question = key.get(answer.questionId);
    if (!question) continue;
    seen.add(answer.questionId);
    const correct = question.correctChoiceId === answer.selectedChoiceId;
    if (!correct) savedWrong.push(question.id);
    await db.insert(quizAnswers).values({
      id: newId("qan"),
      attemptId,
      questionId: question.id,
      selectedChoiceId: answer.selectedChoiceId,
      correct,
    });
  }
  await db
    .insert(learnerCursors)
    .values({
      profileId: input.profileId,
      subLessonId: input.subLessonId,
      biteId: null,
      mode: "quiz",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: learnerCursors.profileId,
      set: { subLessonId: input.subLessonId, mode: "quiz", updatedAt: now },
    });
  // biteId is left as the last learn card so Continue still opens a bite.
  return {
    attemptId,
    correct: score.correct,
    answered: score.answered,
    total: score.total,
    stoppedEarly,
    wrongIds: savedWrong,
    explanations: quiz.answerKey
      .filter((question) => savedWrong.includes(question.id))
      .map((question) => ({
        id: question.id,
        explanation: question.explanation,
        prompt: quiz.questions.find((item) => item.id === question.id)?.prompt ?? "",
      })),
  };
}

export async function explainChoice(db: AppDatabase, questionId: string, choiceId: string) {
  const [question] = await db.select().from(questions).where(and(eq(questions.id, questionId), isNull(questions.archivedAt)));
  if (!question || !QUESTION_TYPES.includes(question.type)) return null;
  return {
    correct: question.correctChoiceId === choiceId,
    correctChoiceId: question.correctChoiceId,
    explanation: question.explanation,
  };
}
