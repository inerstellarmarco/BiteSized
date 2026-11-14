import { describe, expect, it } from "vitest";
import { addFlag } from "@/lib/ai/flags";
import { learnOverlay } from "@/lib/ai/view";
import { createProfile } from "@/lib/auth/profiles";
import { loadCatalog } from "@/lib/content/catalog";
import { insertBite, insertQuestion } from "@/lib/content/ops";
import { suggestedNextSubLesson, unmetPrerequisites, unmetPrerequisitesForSubLesson } from "@/lib/content/prerequisites";
import { markBiteSeen } from "@/lib/content/progress";
import { biteProgress, lessons, subLessons } from "@/lib/db/schema";
import { computeQuizTrend, dismissRevisitFlag, loadLearnerDashboard } from "@/lib/learner/dashboard";
import { buildLearnerProgressExport } from "@/lib/learner/export";
import { getBiteNotesMap, listLearnerNotes, saveBiteNote } from "@/lib/learner/notes";
import { searchCourse } from "@/lib/learner/search";
import { computeStreak, learnerStreak, setDailyBiteGoal } from "@/lib/learner/streak";
import { explainChoice, quizQuestions, saveQuizAttempt, subLessonAttemptHistory } from "@/lib/quiz/attempts";
import { orderForRetake } from "@/lib/quiz/retake";
import { computeSpacedState, recordSpacedReview, SPACED_INTERVALS_DAYS, spacedQueue } from "@/lib/quiz/spaced";
import { makeStack, withDb } from "./helpers";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("phase 4: question types, retakes, and score history", () => {
  it("loads and grades multiple_choice, true_false, and predict_output questions", async () => {
    await withDb(async (db) => {
      const { subLessonId } = await makeStack(db);
      await createProfile(db, { name: "Ada", pin: "2468", isAdmin: false, id: "prf_ada" });
      const bite = await insertBite(db, { subLessonId, title: "Types", body: "All question types work.", id: "bit_types" });

      await insertQuestion(db, {
        biteId: bite.id,
        id: "q_mc",
        type: "multiple_choice",
        prompt: "Pick A",
        choices: [
          { id: "a", text: "A" },
          { id: "b", text: "B" },
        ],
        correctChoiceId: "a",
        explanation: "A is right.",
      });
      await insertQuestion(db, {
        biteId: bite.id,
        id: "q_tf",
        type: "true_false",
        prompt: "True or false: Python lists are mutable.",
        choices: [
          { id: "t", text: "True" },
          { id: "f", text: "False" },
        ],
        correctChoiceId: "t",
        explanation: "Lists can be changed in place.",
      });
      await insertQuestion(db, {
        biteId: bite.id,
        id: "q_po",
        type: "predict_output",
        prompt: "print(2 ** 3)",
        choices: [
          { id: "a", text: "6" },
          { id: "b", text: "8" },
        ],
        correctChoiceId: "b",
        explanation: "2 cubed is 8.",
      });

      const loaded = await quizQuestions(db, subLessonId);
      expect(loaded.skipped).toBe(0);
      expect(loaded.questions.map((q) => q.type)).toEqual(["multiple_choice", "true_false", "predict_output"]);

      expect((await explainChoice(db, "q_tf", "t"))?.correct).toBe(true);
      expect((await explainChoice(db, "q_po", "a"))?.correct).toBe(false);

      const catalog = await loadCatalog(db, "prf_ada");
      const subLesson = catalog?.categories[0]?.subCategories[0]?.lessons[0]?.subLessons[0];
      expect(subLesson?.questionCount).toBe(3);
    });
  });

  it("orders retakes with no repeats and keeps missed questions from coming straight back first", async () => {
    const items = [{ id: "q1" }, { id: "q2" }, { id: "q3" }, { id: "q1" }];
    // Deterministic RNG that would naturally place q2 at index 0 if not guarded
    const zeroRng = () => 0;
    const reordered = orderForRetake(items, ["q2"], zeroRng);
    expect(reordered).toHaveLength(3);
    expect(new Set(reordered.map((item) => item.id)).size).toBe(3);
    expect(reordered[0]?.id).not.toBe("q2");

    // Even when every question was missed, the last one missed ("q3") does not come back first
    const allMissed = orderForRetake([{ id: "q3" }, { id: "q1" }, { id: "q2" }], ["q1", "q2", "q3"], () => 0.99);
    expect(allMissed[0]?.id).not.toBe("q3");

    await withDb(async (db) => {
      const { subLessonId } = await makeStack(db);
      await createProfile(db, { name: "Ada", pin: "2468", isAdmin: false, id: "prf_ada" });
      const bite = await insertBite(db, { subLessonId, title: "Retake", body: "Retake test body.", id: "bit_retake" });
      for (const id of ["q_1", "q_2", "q_3"]) {
        await insertQuestion(db, {
          biteId: bite.id,
          id,
          type: "multiple_choice",
          prompt: `Question ${id}`,
          choices: [
            { id: "a", text: "Right" },
            { id: "b", text: "Wrong" },
          ],
          correctChoiceId: "a",
        });
      }

      await saveQuizAttempt(db, {
        profileId: "prf_ada",
        subLessonId,
        answers: [
          { questionId: "q_1", selectedChoiceId: "b" },
          { questionId: "q_2", selectedChoiceId: "a" },
          { questionId: "q_3", selectedChoiceId: "b" },
        ],
      });

      const history = await subLessonAttemptHistory(db, "prf_ada", subLessonId);
      expect(history).toHaveLength(1);
      expect(history[0]?.percent).toBe(33);
      expect(history[0]?.wrongIds.sort()).toEqual(["q_1", "q_3"]);

      const retake = await quizQuestions(db, subLessonId, { profileId: "prf_ada", random: () => 0 });
      expect(retake.isRetake).toBe(true);
      expect(retake.questions).toHaveLength(3);
      expect(retake.questions[0]?.id).toBe("q_2");
    });
  });
});

describe("phase 4: spaced repetition (1, 3, 7, 21 days)", () => {
  it("walks through 1 -> 3 -> 7 -> 21 days and graduates after the 21-day review", () => {
    expect(SPACED_INTERVALS_DAYS).toEqual([1, 3, 7, 21]);
    const t0 = new Date("2026-11-01T10:00:00.000Z");

    // Wrong answer -> stage 0 (1 day)
    const s0 = computeSpacedState([{ correct: false, at: t0 }], new Date(t0.getTime() + 12 * 3600_000));
    expect(s0.active).toBe(true);
    expect(s0.stage).toBe(0);
    expect(s0.intervalDays).toBe(1);
    expect(s0.isDue).toBe(false);

    const t1 = new Date(t0.getTime() + 1 * DAY_MS);
    expect(computeSpacedState([{ correct: false, at: t0 }], t1).isDue).toBe(true);

    // Right at day 1 -> stage 1 (3 days)
    const t2 = new Date(t1.getTime() + 3 * DAY_MS);
    const s1 = computeSpacedState(
      [
        { correct: false, at: t0 },
        { correct: true, at: t1 },
      ],
      t2,
    );
    expect(s1.stage).toBe(1);
    expect(s1.intervalDays).toBe(3);
    expect(s1.isDue).toBe(true);

    // Right at day 4 -> stage 2 (7 days)
    const t3 = new Date(t2.getTime() + 7 * DAY_MS);
    const s2 = computeSpacedState(
      [
        { correct: false, at: t0 },
        { correct: true, at: t1 },
        { correct: true, at: t2 },
      ],
      t3,
    );
    expect(s2.stage).toBe(2);
    expect(s2.intervalDays).toBe(7);
    expect(s2.isDue).toBe(true);

    // Right at day 11 -> stage 3 (21 days)
    const t4 = new Date(t3.getTime() + 21 * DAY_MS);
    const s3 = computeSpacedState(
      [
        { correct: false, at: t0 },
        { correct: true, at: t1 },
        { correct: true, at: t2 },
        { correct: true, at: t3 },
      ],
      t4,
    );
    expect(s3.stage).toBe(3);
    expect(s3.intervalDays).toBe(21);
    expect(s3.isDue).toBe(true);

    // Right at day 32 -> graduated!
    const done = computeSpacedState(
      [
        { correct: false, at: t0 },
        { correct: true, at: t1 },
        { correct: true, at: t2 },
        { correct: true, at: t3 },
        { correct: true, at: t4 },
      ],
      new Date(t4.getTime() + 30 * DAY_MS),
    );
    expect(done.active).toBe(false);
    expect(done.stage).toBeNull();
  });

  it("queues missed questions in the database and advances them on review", async () => {
    await withDb(async (db) => {
      const { subLessonId } = await makeStack(db);
      await createProfile(db, { name: "Ada", pin: "2468", isAdmin: false, id: "prf_ada" });
      const bite = await insertBite(db, { subLessonId, title: "Memory", body: "Spaced review bite.", id: "bit_mem" });
      await insertQuestion(db, {
        biteId: bite.id,
        id: "q_mem",
        type: "multiple_choice",
        prompt: "What is the first spaced interval?",
        choices: [
          { id: "a", text: "1 day" },
          { id: "b", text: "100 days" },
        ],
        correctChoiceId: "a",
        explanation: "Reviews start at 1 day.",
      });

      await saveQuizAttempt(db, {
        profileId: "prf_ada",
        subLessonId,
        answers: [{ questionId: "q_mem", selectedChoiceId: "b" }],
      });

      const twoDaysLater = new Date(Date.now() + 2 * DAY_MS);
      const queue = await spacedQueue(db, "prf_ada", twoDaysLater);
      expect(queue.due).toHaveLength(1);
      expect(queue.due[0]?.intervalDays).toBe(1);

      const reviewed = await recordSpacedReview(db, {
        profileId: "prf_ada",
        questionId: "q_mem",
        selectedChoiceId: "a",
        now: twoDaysLater,
      });
      expect(reviewed?.correct).toBe(true);
      expect(reviewed?.intervalDays).toBe(3);
    });
  });
});

describe("phase 4: prerequisites, notes, streaks, search, dashboard, and export", () => {
  it("warns on unmet prerequisites and suggests the prerequisite lesson first", async () => {
    await withDb(async (db) => {
      const { subLessonId } = await makeStack(db);
      const subCategoryId = "sub_test";
      const lessonId = "les_test";
      await createProfile(db, { name: "Ada", pin: "2468", isAdmin: false, id: "prf_ada" });
      await insertBite(db, { subLessonId, title: "First step", body: "Foundation card.", id: "bit_prereq_1" });

      await db.insert(lessons).values({
        id: "les_advanced",
        subCategoryId,
        code: "T1.2",
        title: "T1.2 Advanced Topic",
        prerequisiteIds: [lessonId],
        position: "a1",
      });
      await db.insert(subLessons).values({
        id: "sll_advanced",
        lessonId: "les_advanced",
        title: "Deep Dive",
        position: "a0",
      });
      await insertBite(db, { subLessonId: "sll_advanced", title: "Second step", body: "Advanced card.", id: "bit_prereq_2" });

      const catalogBefore = (await loadCatalog(db, "prf_ada"))!;
      expect(unmetPrerequisites(catalogBefore, "les_advanced").map((item) => item.id)).toEqual([lessonId]);
      expect(unmetPrerequisitesForSubLesson(catalogBefore, "sll_advanced").map((item) => item.id)).toEqual([lessonId]);
      expect(suggestedNextSubLesson(catalogBefore)?.id).toBe(subLessonId);

      await markBiteSeen(db, "prf_ada", "bit_prereq_1");
      const catalogAfter = (await loadCatalog(db, "prf_ada"))!;
      expect(unmetPrerequisites(catalogAfter, "les_advanced")).toEqual([]);
      expect(suggestedNextSubLesson(catalogAfter)?.id).toBe("sll_advanced");
    });
  });

  it("saves private notes per profile, searches course + notes, tracks streaks, and exports learner progress", async () => {
    await withDb(async (db) => {
      const { subLessonId } = await makeStack(db);
      await createProfile(db, { name: "Ada", pin: "2468", isAdmin: false, id: "prf_ada" });
      await createProfile(db, { name: "Bob", pin: "1357", isAdmin: false, id: "prf_bob" });

      const bite = await insertBite(db, {
        subLessonId,
        title: "Vector Embeddings",
        body: "Embeddings map meaning into coordinates so cosine similarity finds neighbours.",
        id: "bit_vec",
      });

      // Private notes are isolated per profile
      await saveBiteNote(db, { profileId: "prf_ada", biteId: bite.id, note: "Ask client about pgvector index size" });
      expect((await getBiteNotesMap(db, "prf_ada"))[bite.id]).toBe("Ask client about pgvector index size");
      expect((await getBiteNotesMap(db, "prf_bob"))[bite.id]).toBeUndefined();

      const overlayAda = await learnOverlay(db, "prf_ada", [bite.id]);
      expect(overlayAda.notes[bite.id]).toBe("Ask client about pgvector index size");
      expect(await listLearnerNotes(db, "prf_ada")).toHaveLength(1);

      // Search finds both bite content and the learner's own private note (but not another learner's note)
      const noteMatchesAda = await searchCourse(db, { query: "pgvector", profileId: "prf_ada" });
      expect(noteMatchesAda.some((item) => item.kind === "note" && item.href.includes(bite.id))).toBe(true);
      const noteMatchesBob = await searchCourse(db, { query: "pgvector", profileId: "prf_bob" });
      expect(noteMatchesBob).toHaveLength(0);

      const contentMatches = await searchCourse(db, { query: "cosine similarity", profileId: "prf_bob" });
      expect(contentMatches.some((item) => item.kind === "bite" && item.title === "Vector Embeddings")).toBe(true);

      // Daily goal and streak calculation
      await setDailyBiteGoal(db, "prf_ada", 3);
      const now = new Date("2026-11-14T15:00:00.000Z");
      const streakStats = computeStreak(
        [
          "2026-11-12T10:00:00.000Z",
          "2026-11-13T10:00:00.000Z",
          "2026-11-14T09:00:00.000Z",
          "2026-11-14T10:00:00.000Z",
          "2026-11-14T11:00:00.000Z",
        ],
        3,
        now,
      );
      expect(streakStats).toEqual({
        todayBites: 3,
        goal: 3,
        goalMetToday: true,
        currentStreak: 3,
        longestStreak: 3,
        activeDays: 3,
      });

      await db.insert(biteProgress).values({ profileId: "prf_ada", biteId: bite.id, seenAt: now });
      const liveStreak = await learnerStreak(db, "prf_ada", now);
      expect(liveStreak.goal).toBe(3);
      expect(liveStreak.todayBites).toBe(1);
      expect(liveStreak.currentStreak).toBe(1);

      // Revisit list + dismissal + quiz trend + dashboard + export
      const flagId = await addFlag(db, { profileId: "prf_ada", targetType: "bite", targetId: bite.id, kind: "revisit" });
      expect(computeQuizTrend([90, 85, 50, 40]).trend).toBe("up");

      const dashboard = await loadLearnerDashboard(db, "prf_ada", now);
      expect(dashboard?.overall.seen).toBe(1);
      expect(dashboard?.revisit).toHaveLength(1);
      expect(dashboard?.notes).toHaveLength(1);

      const exported = await buildLearnerProgressExport(db, "prf_ada", now);
      expect(exported?.format).toBe("bite-sized.learner-progress");
      expect(exported?.profile.name).toBe("Ada");
      expect(exported?.notes).toHaveLength(1);
      expect(exported?.seenBites).toHaveLength(1);

      await dismissRevisitFlag(db, "prf_ada", flagId);
      const afterDismiss = await loadLearnerDashboard(db, "prf_ada", now);
      expect(afterDismiss?.revisit).toHaveLength(0);
    });
  });
});
