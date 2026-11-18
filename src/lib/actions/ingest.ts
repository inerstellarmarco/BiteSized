"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import {
  analyzeIngestItem,
  approveIngestKeyword,
  dismissIngestKeyword,
  processQueuedIngestBatch,
  queueIngestSubmission,
  type PlacementMode,
} from "@/lib/ingest/analyze";
import { syncEmailInboxToQueue } from "@/lib/ingest/imap";

export async function submitIngestSourceAction(formData: FormData) {
  const profile = await requireProfile();
  if (!profile.isAdmin) throw new Error("Admin access required.");
  const url = String(formData.get("url") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();
  const curatorNote = String(formData.get("curatorNote") ?? "").trim();
  const analyzeNow = formData.get("analyzeNow") !== "false";

  if (!url && !text) return;

  const db = await getDb();
  const queued = await queueIngestSubmission(db, {
    url: url || undefined,
    text: text || undefined,
    curatorNote: curatorNote || undefined,
  });

  if (analyzeNow) {
    await analyzeIngestItem(db, queued.id);
  }

  revalidatePath("/admin/inbox");
}

export async function syncAndProcessInboxBatchAction() {
  const profile = await requireProfile();
  if (!profile.isAdmin) throw new Error("Admin access required.");
  const db = await getDb();
  await syncEmailInboxToQueue(db, 15);
  await processQueuedIngestBatch(db, 5);
  revalidatePath("/admin/inbox");
}

export async function analyzeSingleItemAction(formData: FormData) {
  const profile = await requireProfile();
  if (!profile.isAdmin) throw new Error("Admin access required.");
  const itemId = String(formData.get("itemId") ?? "").trim();
  if (!itemId) return;
  const db = await getDb();
  await analyzeIngestItem(db, itemId);
  revalidatePath("/admin/inbox");
}

export async function approveIngestKeywordAction(formData: FormData) {
  const profile = await requireProfile();
  if (!profile.isAdmin) throw new Error("Admin access required.");
  const keywordId = String(formData.get("keywordId") ?? "").trim();
  const placementModeRaw = String(formData.get("placementMode") ?? "append_to_sub_lesson");
  const placementMode: PlacementMode =
    placementModeRaw === "create_sub_lesson" ? "create_sub_lesson" : "append_to_sub_lesson";
  const lessonId = String(formData.get("lessonId") ?? "").trim();
  const subLessonId = String(formData.get("subLessonId") ?? "").trim();

  if (!keywordId) return;
  const db = await getDb();
  await approveIngestKeyword(db, {
    keywordId,
    placementMode,
    lessonId: lessonId || undefined,
    subLessonId: subLessonId || undefined,
    profileId: profile.id,
  });

  revalidatePath("/admin/inbox");
  revalidatePath("/course");
  revalidatePath("/home");
}

export async function dismissIngestKeywordAction(formData: FormData) {
  const profile = await requireProfile();
  if (!profile.isAdmin) throw new Error("Admin access required.");
  const keywordId = String(formData.get("keywordId") ?? "").trim();
  if (!keywordId) return;
  const db = await getDb();
  await dismissIngestKeyword(db, keywordId);
  revalidatePath("/admin/inbox");
}
