"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { attemptSignIn } from "@/lib/auth/signin";
import { clearSessionCookie, getSessionProfile, requestIp, setPreferenceCookies, setSessionCookie } from "@/lib/auth/current";
import {
  adminResetPin,
  archiveProfile,
  changeOwnPin,
  createProfile,
  restoreProfile,
  setAdmin,
  updatePreferences,
} from "@/lib/auth/profiles";
import { loadCatalog } from "@/lib/content/catalog";
import { markBiteSeen } from "@/lib/content/progress";
import { getDb } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { explainChoice, saveQuizAttempt } from "@/lib/quiz/attempts";
import type { FontSize, ThemePreference } from "@/lib/types";
import { importPackageFiles, unzipPackage } from "@/lib/packages/io";
import { looksLikeOutlineFile, outlineFileMessage } from "@/lib/packages/outline-hint";

export type SignInState = { error: string } | null;

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const profileId = String(formData.get("profileId") ?? "");
  const pin = String(formData.get("pin") ?? "");
  const trusted = formData.get("trusted") === "on";
  const db = await getDb();
  const result = await attemptSignIn(db, {
    profileId,
    pin,
    ip: await requestIp(),
    trusted,
    userAgent: "web",
  });
  if (!result.ok) {
    if (result.reason === "locked") {
      const when = result.lockedUntil
        ? new Date(result.lockedUntil).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" })
        : "later";
      return { error: `Too many wrong PINs. This profile is locked until ${when}.` };
    }
    if (result.reason === "rate_limited") {
      return { error: "Too many tries. Wait a few minutes, then try again." };
    }
    const left = result.triesLeft ?? 0;
    return { error: left > 0 ? `That PIN does not match. ${left} ${left === 1 ? "try" : "tries"} left.` : "That PIN does not match." };
  }
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, result.profileId));
  await setSessionCookie(result.token, result.trusted, profile?.theme ?? "system", profile?.fontSize ?? "md");
  redirect("/home");
}

export async function signOutAction() {
  await clearSessionCookie();
  redirect("/");
}

export async function markSeenAction(biteId: string) {
  const profile = await getSessionProfile();
  if (!profile) return;
  const db = await getDb();
  await markBiteSeen(db, profile.id, biteId);
  revalidatePath("/course");
  revalidatePath("/home");
}

export async function gradeChoiceAction(questionId: string, choiceId: string) {
  const profile = await getSessionProfile();
  if (!profile) return null;
  const db = await getDb();
  return explainChoice(db, questionId, choiceId);
}

export async function finishQuizAction(input: {
  subLessonId: string;
  answers: { questionId: string; selectedChoiceId: string | null }[];
  stoppedEarly: boolean;
}) {
  const profile = await getSessionProfile();
  if (!profile) return null;
  const db = await getDb();
  const result = await saveQuizAttempt(db, {
    profileId: profile.id,
    subLessonId: input.subLessonId,
    answers: input.answers,
    stoppedEarly: input.stoppedEarly,
  });
  const catalog = await loadCatalog(db, profile.id);
  revalidatePath("/course");
  revalidatePath("/home");
  return { ...result, catalogReady: Boolean(catalog) };
}

export async function savePreferencesAction(theme: ThemePreference, fontSize: FontSize) {
  const profile = await getSessionProfile();
  if (!profile) return;
  const db = await getDb();
  await updatePreferences(db, profile.id, { theme, fontSize });
  await setPreferenceCookies(theme, fontSize);
  revalidatePath("/", "layout");
}

export async function changePinAction(_prev: { error?: string; ok?: boolean } | null, formData: FormData) {
  const profile = await getSessionProfile();
  if (!profile) return { error: "Sign in again." };
  const db = await getDb();
  const result = await changeOwnPin(db, {
    profileId: profile.id,
    currentPin: String(formData.get("current") ?? ""),
    nextPin: String(formData.get("next") ?? ""),
  });
  if (!result.ok) return { error: result.error };
  return { ok: true };
}

async function requireAdmin() {
  const profile = await getSessionProfile();
  if (!profile?.isAdmin) return null;
  return profile;
}

export async function addProfileAction(_prev: { error?: string; ok?: boolean } | null, formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) return { error: "Only an admin can add a profile." };
  const db = await getDb();
  const result = await createProfile(db, {
    name: String(formData.get("name") ?? ""),
    pin: String(formData.get("pin") ?? ""),
    isAdmin: formData.get("isAdmin") === "on",
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true };
}

export async function resetPinAction(_prev: { error?: string; ok?: boolean } | null, formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) return { error: "Only an admin can reset a PIN." };
  const db = await getDb();
  const result = await adminResetPin(db, {
    actorId: admin.id,
    targetId: String(formData.get("profileId") ?? ""),
    pin: String(formData.get("pin") ?? ""),
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin");
  return { ok: true };
}

export async function setAdminAction(profileId: string, isAdmin: boolean) {
  const admin = await requireAdmin();
  if (!admin) return { error: "Only an admin can change roles." };
  const db = await getDb();
  const result = await setAdmin(db, profileId, isAdmin);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin");
  revalidatePath("/home");
  return { ok: true };
}

export async function removeProfileAction(profileId: string) {
  const admin = await requireAdmin();
  if (!admin) return { error: "Only an admin can remove a profile." };
  const db = await getDb();
  const result = await archiveProfile(db, profileId, admin.id);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true };
}

export async function restoreProfileAction(profileId: string) {
  const admin = await requireAdmin();
  if (!admin) return { error: "Only an admin can restore a profile." };
  const db = await getDb();
  const result = await restoreProfile(db, profileId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin");
  return { ok: true };
}

export async function importCourseAction(_prev: { error?: string; ok?: boolean } | null, formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) return { error: "Only an admin can import a course." };
  const file = formData.get("package");
  if (!(file instanceof File)) return { error: "Choose a package zip." };
  if (looksLikeOutlineFile(file.name)) return { error: outlineFileMessage(file.name) };
  if (file.size > 5_000_000) return { error: "That package is larger than 5 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const files = unzipPackage(bytes);
    const db = await getDb();
    await importPackageFiles(db, files, { replace: false, includeLearners: false, includeHistory: false });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Import failed." };
  }
  revalidatePath("/course");
  revalidatePath("/home");
  return { ok: true };
}

