"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth/current";
import { addExample } from "@/lib/style/guide";
import { draftRegeneration, overwriteOriginal, presetById, savePersonalVersion, setPersonalShowing } from "@/lib/ai/regenerate";
import { acceptFlagFix, addFlag, type FlagKind } from "@/lib/ai/flags";
import { approveProposal, createProposal } from "@/lib/ai/proposals";
import { setDailyCap } from "@/lib/ai/usage";
import { bites, hearts, questions } from "@/lib/db/schema";
import { getDb } from "@/lib/db";

async function profile() {
  return getSessionProfile();
}

export async function regenerateAction(biteId: string, preset: string) {
  const learner = await profile();
  if (!learner) return { ok: false as const, message: "Sign in again." };
  const chosen = presetById(preset);
  if (!chosen) return { ok: false as const, message: "Choose one of the three rewrite options." };
  const db = await getDb();
  const draft = await draftRegeneration(db, { profileId: learner.id, biteId, preset: chosen.id });
  return draft;
}

export async function saveRegenerationAction(input: {
  biteId: string;
  title: string;
  body: string;
  diagram: string | null;
  basedOnUpdatedAt: string;
  mode: "personal" | "everyone" | "both";
}) {
  const learner = await profile();
  if (!learner) return { ok: false as const, message: "Sign in again." };
  if (input.mode !== "personal" && !learner.isAdmin) return { ok: false as const, message: "Only an admin can change the original." };
  const db = await getDb();
  if (input.mode === "personal" || input.mode === "both") {
    await savePersonalVersion(db, { profileId: learner.id, ...input });
  }
  if (input.mode === "everyone" || input.mode === "both") {
    await overwriteOriginal(db, { biteId: input.biteId, title: input.title, body: input.body, diagram: input.diagram, actorId: learner.id });
  }
  revalidatePath("/learn");
  return { ok: true as const };
}

export async function showOriginalAction(biteId: string, showing: "personal" | "original") {
  const learner = await profile();
  if (!learner) return;
  const db = await getDb();
  await setPersonalShowing(db, learner.id, biteId, showing);
  revalidatePath("/learn");
}

export async function toggleHeartAction(targetType: "bite" | "question", targetId: string) {
  const learner = await profile();
  if (!learner) return { hearted: false };
  const db = await getDb();
  const existing = await db
    .select()
    .from(hearts)
    .where(and(eq(hearts.profileId, learner.id), eq(hearts.targetType, targetType), eq(hearts.targetId, targetId)));
  if (existing.length > 0) {
    await db.delete(hearts).where(and(eq(hearts.profileId, learner.id), eq(hearts.targetType, targetType), eq(hearts.targetId, targetId)));
    revalidatePath("/favourites");
    return { hearted: false };
  }
  await db.insert(hearts).values({ profileId: learner.id, targetType, targetId });
  revalidatePath("/favourites");
  return { hearted: true };
}

export async function flagAction(targetType: "bite" | "question", targetId: string, kind: FlagKind, note = "") {
  const learner = await profile();
  if (!learner) return { ok: false as const, message: "Sign in again." };
  const db = await getDb();
  await addFlag(db, { profileId: learner.id, targetType, targetId, kind, note });
  revalidatePath("/admin/flags");
  revalidatePath("/revisit");
  return { ok: true as const, message: kind === "revisit" ? "Saved to your revisit list." : "Sent to the admins." };
}

export async function addStyleExampleAction(targetType: "bite" | "question", targetId: string) {
  const learner = await profile();
  if (!learner?.isAdmin) return { ok: false as const, error: "Only an admin can add style examples." };
  const db = await getDb();
  if (targetType === "bite") {
    const [bite] = await db.select().from(bites).where(eq(bites.id, targetId));
    if (!bite) return { ok: false as const, error: "Missing bite." };
    return addExample(db, { title: bite.title, body: bite.body });
  }
  const [question] = await db.select().from(questions).where(eq(questions.id, targetId));
  if (!question) return { ok: false as const, error: "Missing question." };
  const correct = question.choices.find((choice) => choice.id === question.correctChoiceId)?.text ?? "";
  return addExample(db, { title: question.prompt, body: `${question.prompt}\nAnswer: ${correct}\n${question.explanation}` });
}

export async function setCapAction(formData: FormData) {
  const learner = await profile();
  if (!learner?.isAdmin) return;
  const cap = Number(formData.get("cap"));
  if (!Number.isFinite(cap) || cap < 1) return;
  const db = await getDb();
  await setDailyCap(db, cap);
  revalidatePath("/admin/style");
}

export async function proposeSubLessonAction(_prev: { error?: string; ok?: boolean } | null | undefined, formData: FormData) {
  const learner = await profile();
  if (!learner) return { error: "Sign in again." };
  const title = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!title) return { error: "Give the sub-lesson a title." };
  const db = await getDb();
  try {
    await createProposal(db, { profileId: learner.id, title, notes });
  } catch {
    return { error: "AI unavailable, try later" };
  }
  revalidatePath("/propose");
  revalidatePath("/admin/proposals");
  return { ok: true };
}

export async function approvePlacementAction(formData: FormData) {
  const learner = await profile();
  if (!learner?.isAdmin) return;
  const db = await getDb();
  await approveProposal(db, String(formData.get("proposalId")), String(formData.get("lessonId")));
  revalidatePath("/admin/proposals");
  revalidatePath("/admin/review");
}

export async function regenerateFlagAction(formData: FormData) {
  const learner = await profile();
  if (!learner?.isAdmin) return;
  const flagId = String(formData.get("flagId") ?? "");
  const biteId = String(formData.get("biteId") ?? "");
  const db = await getDb();
  const draft = await draftRegeneration(db, { profileId: learner.id, biteId, preset: "different" });
  if (!draft.ok) return;
  await overwriteOriginal(db, { biteId, title: draft.title, body: draft.body, diagram: draft.diagram, actorId: learner.id });
  const { acceptFlagFix } = await import("@/lib/ai/flags");
  await acceptFlagFix(db, flagId, learner.id, draft.body);
  revalidatePath("/admin/flags");
}

export async function acceptFlagAction(formData: FormData) {
  const learner = await profile();
  if (!learner?.isAdmin) return;
  const db = await getDb();
  await acceptFlagFix(db, String(formData.get("flagId")), learner.id, String(formData.get("body") ?? ""));
  revalidatePath("/admin/flags");
  revalidatePath("/learn");
}
