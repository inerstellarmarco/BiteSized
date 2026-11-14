"use server";

import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { dismissRevisitFlag } from "@/lib/learner/dashboard";
import { saveBiteNote } from "@/lib/learner/notes";
import { setDailyBiteGoal } from "@/lib/learner/streak";
import { recordSpacedReview } from "@/lib/quiz/spaced";

export async function saveBiteNoteAction(biteId: string, note: string) {
  const learner = await getSessionProfile();
  if (!learner) return { ok: false as const, message: "Sign in again." };
  const db = await getDb();
  const saved = await saveBiteNote(db, { profileId: learner.id, biteId, note });
  revalidatePath("/learn");
  revalidatePath("/home");
  revalidatePath("/search");
  return { ok: true as const, note: saved.note };
}

export async function updateDailyGoalAction(goal: number) {
  const learner = await getSessionProfile();
  if (!learner) return { ok: false as const, message: "Sign in again." };
  const db = await getDb();
  const saved = await setDailyBiteGoal(db, learner.id, goal);
  revalidatePath("/home");
  revalidatePath("/settings");
  return { ok: true as const, goal: saved };
}

export async function dismissRevisitAction(flagId: string) {
  const learner = await getSessionProfile();
  if (!learner) return { ok: false as const };
  const db = await getDb();
  await dismissRevisitFlag(db, learner.id, flagId);
  revalidatePath("/home");
  return { ok: true as const };
}

export async function answerSpacedReviewAction(questionId: string, selectedChoiceId: string) {
  const learner = await getSessionProfile();
  if (!learner) return null;
  const db = await getDb();
  const result = await recordSpacedReview(db, {
    profileId: learner.id,
    questionId,
    selectedChoiceId,
  });
  revalidatePath("/review");
  revalidatePath("/home");
  return result;
}
