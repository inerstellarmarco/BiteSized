import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { asDate } from "@/lib/dates";
import {
  biteProgress,
  contentFlags,
  hearts,
  learnerCursors,
  personalBites,
  profiles,
  quizAnswers,
  quizAttempts,
} from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";
import { loadLearnerDashboard } from "@/lib/learner/dashboard";
import { listLearnerNotes } from "@/lib/learner/notes";
import { learnerStreak } from "@/lib/learner/streak";
import { spacedQueue } from "@/lib/quiz/spaced";

export async function buildLearnerProgressExport(db: AppDatabase, profileId: string, now: Date = new Date()) {
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId));
  if (!profile) return null;

  const [dashboard, streak, spaced, notes, progressRows, cursorRows, attemptRows, heartRows, personalRows, flagRows] =
    await Promise.all([
      loadLearnerDashboard(db, profileId, now),
      learnerStreak(db, profileId, now),
      spacedQueue(db, profileId, now),
      listLearnerNotes(db, profileId),
      db.select().from(biteProgress).where(eq(biteProgress.profileId, profileId)).orderBy(asc(biteProgress.seenAt)),
      db.select().from(learnerCursors).where(eq(learnerCursors.profileId, profileId)),
      db.select().from(quizAttempts).where(eq(quizAttempts.profileId, profileId)).orderBy(desc(quizAttempts.finishedAt)),
      db.select().from(hearts).where(eq(hearts.profileId, profileId)),
      db.select().from(personalBites).where(eq(personalBites.profileId, profileId)),
      db
        .select()
        .from(contentFlags)
        .where(and(eq(contentFlags.profileId, profileId), eq(contentFlags.kind, "revisit"))),
    ]);

  const attemptIds = attemptRows.map((row) => row.id);
  const answerRows = attemptIds.length
    ? await db.select().from(quizAnswers).where(inArray(quizAnswers.attemptId, attemptIds))
    : [];

  return {
    format: "bite-sized.learner-progress",
    formatVersion: 1,
    exportedAt: now.toISOString(),
    profile: {
      id: profile.id,
      name: profile.name,
      isAdmin: profile.isAdmin,
      theme: profile.theme,
      fontSize: profile.fontSize,
    },
    course: dashboard?.catalog.course
      ? {
          id: dashboard.catalog.course.id,
          title: dashboard.catalog.course.title,
        }
      : null,
    summary: {
      bitesSeen: dashboard?.overall.seen ?? progressRows.length,
      totalBites: dashboard?.overall.total ?? 0,
      percentComplete: dashboard?.overall.percent ?? 0,
      subLessonsFinished: dashboard?.lessonsDone.finished ?? 0,
      totalSubLessons: dashboard?.lessonsDone.total ?? 0,
      quizzesTaken: attemptRows.length,
      averageQuizPercent: dashboard?.quizTrend.averagePercent ?? 0,
      quizTrend: dashboard?.quizTrend.trend ?? "none",
      dueReviewsCount: spaced.due.length,
      upcomingReviewsCount: spaced.upcoming.length,
    },
    streak,
    categories: dashboard?.categoriesBreakdown ?? [],
    cursor: cursorRows[0]
      ? {
          subLessonId: cursorRows[0].subLessonId,
          biteId: cursorRows[0].biteId,
          mode: cursorRows[0].mode,
          updatedAt: (asDate(cursorRows[0].updatedAt) ?? now).toISOString(),
        }
      : null,
    seenBites: progressRows.map((row) => ({
      biteId: row.biteId,
      seenAt: (asDate(row.seenAt) ?? now).toISOString(),
    })),
    quizAttempts: attemptRows.map((attempt) => ({
      id: attempt.id,
      subLessonId: attempt.subLessonId,
      correctCount: attempt.correctCount,
      answeredCount: attempt.answeredCount,
      totalCount: attempt.totalCount,
      stoppedEarly: attempt.stoppedEarly,
      startedAt: (asDate(attempt.startedAt) ?? now).toISOString(),
      finishedAt: (asDate(attempt.finishedAt) ?? now).toISOString(),
      answers: answerRows
        .filter((ans) => ans.attemptId === attempt.id)
        .map((ans) => ({
          questionId: ans.questionId,
          selectedChoiceId: ans.selectedChoiceId,
          correct: ans.correct,
        })),
    })),
    spacedRepetition: {
      due: spaced.due.map((item) => ({
        questionId: item.questionId,
        prompt: item.prompt,
        stage: item.stage,
        intervalDays: item.intervalDays,
        dueAt: item.dueAt,
      })),
      upcoming: spaced.upcoming.map((item) => ({
        questionId: item.questionId,
        prompt: item.prompt,
        stage: item.stage,
        intervalDays: item.intervalDays,
        dueAt: item.dueAt,
      })),
    },
    notes,
    revisitFlags: flagRows.map((row) => ({
      id: row.id,
      targetType: row.targetType,
      targetId: row.targetId,
      status: row.status,
      createdAt: (asDate(row.createdAt) ?? now).toISOString(),
    })),
    hearts: heartRows.map((row) => ({
      targetType: row.targetType,
      targetId: row.targetId,
      createdAt: (asDate(row.createdAt) ?? now).toISOString(),
    })),
    personalBites: personalRows.map((row) => ({
      biteId: row.biteId,
      title: row.title,
      body: row.body,
      diagram: row.diagram,
      showing: row.showing,
      updatedAt: (asDate(row.updatedAt) ?? now).toISOString(),
    })),
  };
}
