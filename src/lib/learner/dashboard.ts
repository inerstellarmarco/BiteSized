import { and, desc, eq, inArray } from "drizzle-orm";
import { revisitList } from "@/lib/ai/flags";
import { continueFor, loadCatalog, titleWithoutCode, type CourseCatalog } from "@/lib/content/catalog";
import { finishedCount, summarizeProgress } from "@/lib/content/course-progress";
import { suggestedNextSubLesson, unmetPrerequisites, type UnmetPrerequisite } from "@/lib/content/prerequisites";
import { asDate } from "@/lib/dates";
import { bites, contentFlags, lessons, questions, quizAttempts, subLessons } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";
import { listLearnerNotes, type BiteNoteWithContext } from "@/lib/learner/notes";
import { learnerStreak, type StreakSummary } from "@/lib/learner/streak";
import { spacedQueue, type SpacedQuestionItem } from "@/lib/quiz/spaced";

export type QuizTrendDirection = "up" | "steady" | "down" | "none";

export type QuizAttemptSummary = {
  id: string;
  subLessonId: string;
  subLessonTitle: string;
  lessonCode: string;
  correctCount: number;
  answeredCount: number;
  totalCount: number;
  percent: number;
  stoppedEarly: boolean;
  finishedAt: string;
};

export type QuizScoreTrend = {
  attemptsCount: number;
  averagePercent: number;
  trend: QuizTrendDirection;
  deltaPercent: number;
  recentAttempts: QuizAttemptSummary[];
};

export type RevisitItem = {
  id: string;
  targetType: "bite" | "question";
  targetId: string;
  title: string;
  subtitle: string;
  href: string;
  createdAt: string;
};

export type CategoryProgressRow = {
  id: string;
  code: string;
  title: string;
  seen: number;
  total: number;
  percent: number;
  subCategories: {
    id: string;
    code: string;
    title: string;
    levelTag: string;
    seen: number;
    total: number;
    percent: number;
    lessons: {
      id: string;
      code: string;
      title: string;
      seen: number;
      total: number;
      percent: number;
    }[];
  }[];
};

export function computeQuizTrend(percentsNewestFirst: readonly number[]): {
  averagePercent: number;
  trend: QuizTrendDirection;
  deltaPercent: number;
} {
  if (percentsNewestFirst.length === 0) {
    return { averagePercent: 0, trend: "none", deltaPercent: 0 };
  }
  const sum = percentsNewestFirst.reduce((acc, value) => acc + value, 0);
  const averagePercent = Math.round(sum / percentsNewestFirst.length);
  if (percentsNewestFirst.length < 2) {
    return { averagePercent, trend: "steady", deltaPercent: 0 };
  }
  const half = Math.max(1, Math.min(3, Math.floor(percentsNewestFirst.length / 2)));
  const recentSlice = percentsNewestFirst.slice(0, half);
  const previousSlice = percentsNewestFirst.slice(half, half * 2);
  const recentAvg = recentSlice.reduce((acc, val) => acc + val, 0) / recentSlice.length;
  const previousAvg = previousSlice.reduce((acc, val) => acc + val, 0) / previousSlice.length;
  const deltaPercent = Math.round(recentAvg - previousAvg);
  const trend: QuizTrendDirection = deltaPercent >= 5 ? "up" : deltaPercent <= -5 ? "down" : "steady";
  return { averagePercent, trend, deltaPercent };
}

export async function dismissRevisitFlag(db: AppDatabase, profileId: string, flagId: string) {
  await db
    .update(contentFlags)
    .set({ status: "resolved" })
    .where(and(eq(contentFlags.id, flagId), eq(contentFlags.profileId, profileId), eq(contentFlags.kind, "revisit")));
}

export async function enrichRevisitItems(db: AppDatabase, profileId: string): Promise<RevisitItem[]> {
  const flags = await revisitList(db, profileId);
  if (flags.length === 0) return [];

  const biteTargetIds = flags.filter((row) => row.targetType === "bite").map((row) => row.targetId);
  const questionTargetIds = flags.filter((row) => row.targetType === "question").map((row) => row.targetId);

  const questionRows = questionTargetIds.length
    ? await db.select().from(questions).where(inArray(questions.id, questionTargetIds))
    : [];
  const questionById = new Map(questionRows.map((row) => [row.id, row]));

  const allBiteIds = [...new Set([...biteTargetIds, ...questionRows.map((row) => row.biteId)])];
  const biteRows = allBiteIds.length ? await db.select().from(bites).where(inArray(bites.id, allBiteIds)) : [];
  const biteById = new Map(biteRows.map((row) => [row.id, row]));

  const subLessonIds = [...new Set(biteRows.map((row) => row.subLessonId))];
  const subLessonRows = subLessonIds.length
    ? await db.select().from(subLessons).where(inArray(subLessons.id, subLessonIds))
    : [];
  const subLessonById = new Map(subLessonRows.map((row) => [row.id, row]));

  const lessonIds = [...new Set(subLessonRows.map((row) => row.lessonId))];
  const lessonRows = lessonIds.length ? await db.select().from(lessons).where(inArray(lessons.id, lessonIds)) : [];
  const lessonById = new Map(lessonRows.map((row) => [row.id, row]));

  const out: RevisitItem[] = [];
  for (const flag of flags) {
    if (flag.targetType === "bite") {
      const bite = biteById.get(flag.targetId);
      if (!bite || bite.archivedAt) continue;
      const subLesson = subLessonById.get(bite.subLessonId);
      if (!subLesson || subLesson.archivedAt) continue;
      const lesson = lessonById.get(subLesson.lessonId);
      out.push({
        id: flag.id,
        targetType: "bite",
        targetId: bite.id,
        title: bite.title,
        subtitle: `${lesson?.code ?? ""} · ${subLesson.title}`.replace(/^ · /, ""),
        href: `/learn/${subLesson.id}?bite=${bite.id}`,
        createdAt: (asDate(flag.createdAt) ?? new Date()).toISOString(),
      });
    } else if (flag.targetType === "question") {
      const question = questionById.get(flag.targetId);
      if (!question || question.archivedAt) continue;
      const bite = biteById.get(question.biteId);
      if (!bite || bite.archivedAt) continue;
      const subLesson = subLessonById.get(bite.subLessonId);
      if (!subLesson || subLesson.archivedAt) continue;
      const lesson = lessonById.get(subLesson.lessonId);
      out.push({
        id: flag.id,
        targetType: "question",
        targetId: question.id,
        title: question.prompt,
        subtitle: `${lesson?.code ?? ""} · ${subLesson.title} · Quiz question`.replace(/^ · /, ""),
        href: `/quiz/${subLesson.id}`,
        createdAt: (asDate(flag.createdAt) ?? new Date()).toISOString(),
      });
    }
  }
  return out;
}

export function buildCategoryBreakdown(catalog: CourseCatalog): CategoryProgressRow[] {
  return catalog.categories.map((category) => {
    const catSubLessons = category.subCategories.flatMap((subCategory) =>
      subCategory.lessons.flatMap((lesson) => lesson.subLessons),
    );
    const catSummary = summarizeProgress(catSubLessons);
    return {
      id: category.id,
      code: category.code,
      title: category.title,
      seen: catSummary.seen,
      total: catSummary.total,
      percent: catSummary.percent,
      subCategories: category.subCategories.map((subCategory) => {
        const subCatSubLessons = subCategory.lessons.flatMap((lesson) => lesson.subLessons);
        const subSummary = summarizeProgress(subCatSubLessons);
        return {
          id: subCategory.id,
          code: subCategory.code,
          title: titleWithoutCode(subCategory.code, subCategory.title),
          levelTag: subCategory.levelTag,
          seen: subSummary.seen,
          total: subSummary.total,
          percent: subSummary.percent,
          lessons: subCategory.lessons.map((lesson) => {
            const lesSummary = summarizeProgress(lesson.subLessons);
            return {
              id: lesson.id,
              code: lesson.code,
              title: titleWithoutCode(lesson.code, lesson.title),
              seen: lesSummary.seen,
              total: lesSummary.total,
              percent: lesSummary.percent,
            };
          }),
        };
      }),
    };
  });
}

export async function loadLearnerDashboard(db: AppDatabase, profileId: string, now: Date = new Date()) {
  const catalog = await loadCatalog(db, profileId);
  if (!catalog) {
    return null;
  }

  const allSubLessons = catalog.categories.flatMap((category) =>
    category.subCategories.flatMap((subCategory) => subCategory.lessons.flatMap((lesson) => lesson.subLessons)),
  );
  const subLessonById = new Map(
    catalog.categories.flatMap((category) =>
      category.subCategories.flatMap((subCategory) =>
        subCategory.lessons.flatMap((lesson) =>
          lesson.subLessons.map((subLesson) => [subLesson.id, { subLesson, lesson }] as const),
        ),
      ),
    ),
  );

  const [next, streak, spaced, revisit, notes, attemptRows] = await Promise.all([
    continueFor(db, profileId, catalog),
    learnerStreak(db, profileId, now),
    spacedQueue(db, profileId, now),
    enrichRevisitItems(db, profileId),
    listLearnerNotes(db, profileId),
    db
      .select()
      .from(quizAttempts)
      .where(eq(quizAttempts.profileId, profileId))
      .orderBy(desc(quizAttempts.finishedAt), desc(quizAttempts.startedAt)),
  ]);

  const overall = summarizeProgress(allSubLessons);
  const lessonsDone = finishedCount(allSubLessons);
  const suggested = suggestedNextSubLesson(catalog);
  const nextUnmetPrerequisites: UnmetPrerequisite[] = next ? unmetPrerequisites(catalog, next.lessonId) : [];

  const attemptSummaries: QuizAttemptSummary[] = attemptRows.map((attempt) => {
    const found = subLessonById.get(attempt.subLessonId);
    const percent = attempt.answeredCount === 0 ? 0 : Math.round((attempt.correctCount / attempt.answeredCount) * 100);
    return {
      id: attempt.id,
      subLessonId: attempt.subLessonId,
      subLessonTitle: found?.subLesson.title ?? "Quiz",
      lessonCode: found?.lesson.code ?? "",
      correctCount: attempt.correctCount,
      answeredCount: attempt.answeredCount,
      totalCount: attempt.totalCount,
      percent,
      stoppedEarly: attempt.stoppedEarly,
      finishedAt: (asDate(attempt.finishedAt) ?? new Date()).toISOString(),
    };
  });

  const trendStats = computeQuizTrend(attemptSummaries.map((item) => item.percent));
  const quizTrend: QuizScoreTrend = {
    attemptsCount: attemptSummaries.length,
    averagePercent: trendStats.averagePercent,
    trend: trendStats.trend,
    deltaPercent: trendStats.deltaPercent,
    recentAttempts: attemptSummaries.slice(0, 6),
  };

  const categoriesBreakdown = buildCategoryBreakdown(catalog);

  return {
    catalog,
    overall,
    lessonsDone,
    next,
    nextUnmetPrerequisites,
    suggested,
    streak: streak as StreakSummary,
    spaced: spaced as { due: SpacedQuestionItem[]; upcoming: SpacedQuestionItem[]; all: SpacedQuestionItem[] },
    revisit,
    notes: notes as BiteNoteWithContext[],
    quizTrend,
    categoriesBreakdown,
  };
}
