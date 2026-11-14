import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { insertBite, insertQuestion } from "@/lib/content/ops";
import { createProfile } from "@/lib/auth/profiles";
import { quizAnswers, quizAttempts } from "@/lib/db/schema";
import { saveQuizAttempt } from "@/lib/quiz/attempts";
import { scoreQuiz } from "@/lib/quiz/score";
import { makeStack, withDb } from "./helpers";

describe("quiz scoring", () => {
  it("scores answered questions and flags wrong ones", () => {
    const score = scoreQuiz(
      [
        { id: "q1", correctChoiceId: "a" },
        { id: "q2", correctChoiceId: "b" },
        { id: "q3", correctChoiceId: "c" },
      ],
      [
        { questionId: "q1", selectedChoiceId: "a" },
        { questionId: "q2", selectedChoiceId: "a" },
      ],
    );
    expect(score).toEqual({
      correct: 1,
      answered: 2,
      total: 3,
      wrongIds: ["q2"],
      stoppedEarly: true,
    });
  });

  it("stores the attempt and the questions that were wrong", async () => {
    await withDb(async (db) => {
      const { subLessonId } = await makeStack(db);
      await createProfile(db, { name: "Ada", pin: "2468", isAdmin: false, id: "prf_ada" });
      const bite = await insertBite(db, { subLessonId, title: "Card", body: "Body", id: "bit_card" });
      await insertQuestion(db, {
        biteId: bite.id,
        id: "q_right",
        type: "multiple_choice",
        prompt: "Right one?",
        choices: [
          { id: "a", text: "Yes" },
          { id: "b", text: "No" },
        ],
        correctChoiceId: "a",
      });
      await insertQuestion(db, {
        biteId: bite.id,
        id: "q_wrong",
        type: "multiple_choice",
        prompt: "Wrong one?",
        choices: [
          { id: "a", text: "Yes" },
          { id: "b", text: "No" },
        ],
        correctChoiceId: "b",
      });
      await insertQuestion(db, {
        biteId: bite.id,
        id: "q_tf",
        type: "true_false",
        prompt: "True or false: 1 + 1 == 2",
        choices: [
          { id: "t", text: "True" },
          { id: "f", text: "False" },
        ],
        correctChoiceId: "t",
      });
      await insertQuestion(db, {
        biteId: bite.id,
        id: "q_predict",
        type: "predict_output",
        prompt: "What does len([10, 20, 30]) return?",
        choices: [
          { id: "a", text: "2" },
          { id: "b", text: "3" },
        ],
        correctChoiceId: "b",
      });
      const saved = await saveQuizAttempt(db, {
        profileId: "prf_ada",
        subLessonId,
        answers: [
          { questionId: "q_right", selectedChoiceId: "a" },
          { questionId: "q_wrong", selectedChoiceId: "a" },
          { questionId: "q_tf", selectedChoiceId: "t" },
          { questionId: "q_predict", selectedChoiceId: "b" },
        ],
        stoppedEarly: false,
      });
      expect(saved.correct).toBe(3);
      expect(saved.total).toBe(4);
      expect(saved.wrongIds).toEqual(["q_wrong"]);
      expect(saved.stoppedEarly).toBe(false);
      const [attempt] = await db.select().from(quizAttempts).where(eq(quizAttempts.profileId, "prf_ada"));
      expect(attempt).toMatchObject({ correctCount: 3, answeredCount: 4, totalCount: 4 });
      const wrong = await db.select().from(quizAnswers).where(eq(quizAnswers.correct, false));
      expect(wrong.map((row) => row.questionId)).toEqual(["q_wrong"]);
    });
  });
});
