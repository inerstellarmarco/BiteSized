"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth/current";
import { importDrafts } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { blocksFromUpload, fetchGoogleDocHtml } from "@/lib/import/fetch-doc";
import { archiveEntity } from "@/lib/content/ops";
import { applyProposal } from "@/lib/import/apply";
import { defaultMapping, propose, type Block, type HeadingRole, type LevelMapping } from "@/lib/import/parse";
import { AI_UNAVAILABLE, getLlmClient, LlmUnavailableError } from "@/lib/llm";
import { sampleBites } from "@/lib/generation/pipeline";
import { batchApprove, discardBite, regenerateBite, saveBiteDraft, saveQuestionDraft } from "@/lib/generation/review";
import { addExample, ensureStyleDraft, listExamples, lockStyle, removeExample, saveStyleDraft, type StyleFields } from "@/lib/style/guide";
import { newId } from "@/lib/ids";
import type { Choice } from "@/lib/types";

async function adminId() {
  const profile = await getSessionProfile();
  if (!profile?.isAdmin) return null;
  return profile.id;
}

function mappingFrom(input: Partial<LevelMapping> | null): LevelMapping {
  const roles: HeadingRole[] = ["category", "sub_category", "lesson", "toolkit", "ignore"];
  const pick = (value: string | undefined, fallback: HeadingRole): HeadingRole =>
    roles.includes(value as HeadingRole) ? (value as HeadingRole) : fallback;
  return {
    h1: pick(input?.h1, defaultMapping.h1),
    h2: pick(input?.h2, defaultMapping.h2),
    h3: pick(input?.h3, defaultMapping.h3),
    h4: pick(input?.h4, defaultMapping.h4),
  };
}

export async function saveStyleAction(_prev: { error?: string; ok?: boolean } | null, formData: FormData) {
  if (!(await adminId())) return { error: "Only an admin can edit the style." };
  const fields: StyleFields = {
    tone: String(formData.get("tone") ?? ""),
    lengthGuide: String(formData.get("lengthGuide") ?? ""),
    readingLevel: String(formData.get("readingLevel") ?? ""),
    analogyUse: String(formData.get("analogyUse") ?? ""),
    formatting: String(formData.get("formatting") ?? ""),
    temperature: String(formData.get("temperature") ?? "0.4"),
  };
  if (Object.values(fields).some((value) => !value.trim())) return { error: "Fill in every part of the style guide." };
  const db = await getDb();
  await saveStyleDraft(db, fields);
  revalidatePath("/admin/style");
  return { ok: true };
}

export async function addExampleAction(_prev: { error?: string; ok?: boolean } | null, formData: FormData) {
  if (!(await adminId())) return { error: "Only an admin can add examples." };
  const db = await getDb();
  const result = await addExample(db, { title: String(formData.get("title") ?? ""), body: String(formData.get("body") ?? "") });
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/style");
  return { ok: true };
}

export async function removeExampleAction(id: string) {
  if (!(await adminId())) return { error: "Only an admin can remove examples." };
  const db = await getDb();
  await removeExample(db, id);
  revalidatePath("/admin/style");
  return { ok: true };
}

export async function lockStyleAction() {
  const actor = await adminId();
  if (!actor) return { error: "Only an admin can lock a style." };
  const db = await getDb();
  const locked = await lockStyle(db, actor);
  revalidatePath("/admin/style");
  return { ok: true, number: locked.number };
}

export async function tryStyleAction(_prev: { error?: string; samples?: { title: string; body: string; questions: { prompt: string }[] }[] } | null, formData: FormData) {
  if (!(await adminId())) return { error: "Only an admin can try the style." };
  const topic = String(formData.get("topic") ?? "").trim();
  if (!topic) return { error: "Name a topic to try." };
  const db = await getDb();
  const draft = await ensureStyleDraft(db);
  const examples = await listExamples(db);
  if (!draft) return { error: AI_UNAVAILABLE };
  try {
    const samples = await sampleBites(
      getLlmClient(),
      {
        tone: draft.tone,
        lengthGuide: draft.lengthGuide,
        readingLevel: draft.readingLevel,
        analogyUse: draft.analogyUse,
        formatting: draft.formatting,
        temperature: draft.temperature,
        examples: examples.map((example) => ({ title: example.title, body: example.body })),
      },
      topic,
    );
    return { samples: samples.map((sample) => ({ title: sample.title, body: sample.body, questions: sample.questions.map((question) => ({ prompt: question.prompt })) })) };
  } catch (error) {
    if (error instanceof LlmUnavailableError) return { error: AI_UNAVAILABLE };
    return { error: AI_UNAVAILABLE };
  }
}

export async function startImportAction(_prev: { error?: string } | null, formData: FormData) {
  const actor = await adminId();
  if (!actor) return { error: "Only an admin can import." };
  const link = String(formData.get("link") ?? "").trim();
  const file = formData.get("file");
  let blocks: Block[] = [];
  let label = "Import";
  try {
    if (file instanceof File && file.size > 0) {
      if (file.size > 8_000_000) return { error: "That file is larger than 8 MB." };
      blocks = blocksFromUpload(file.name, new Uint8Array(await file.arrayBuffer()));
      label = file.name;
    } else if (link) {
      const html = await fetchGoogleDocHtml(link);
      blocks = (await import("@/lib/import/parse")).parseHtml(html);
      label = link;
    } else {
      return { error: "Paste a Google Doc link or upload an HTML, Word, or outline file." };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not read that document." };
  }
  if (blocks.length === 0) return { error: "No headings were found in that document." };
  const db = await getDb();
  const id = newId("imp");
  await db.insert(importDrafts).values({
    id,
    sourceLabel: label,
    blocks,
    mapping: defaultMapping,
    createdBy: actor,
  });
  redirect(`/admin/import?draft=${id}`);
}

export async function updateMappingAction(draftId: string, mapping: LevelMapping) {
  if (!(await adminId())) return { error: "Only an admin can change the mapping." };
  const db = await getDb();
  await db.update(importDrafts).set({ mapping }).where(eq(importDrafts.id, draftId));
  revalidatePath("/admin/import");
  return { ok: true };
}

export async function applyImportAction(formData: FormData): Promise<void> {
  const actor = await adminId();
  if (!actor) redirect("/home");
  const draftId = String(formData.get("draftId") ?? "");
  const includedCodes = formData.getAll("include").map(String);
  const db = await getDb();
  const [draft] = await db.select().from(importDrafts).where(eq(importDrafts.id, draftId));
  if (!draft) redirect("/admin/import");
  const proposal = propose(draft.blocks as Block[], mappingFrom(draft.mapping as LevelMapping));
  for (const category of proposal.categories) {
    category.include = includedCodes.includes(category.code || category.title);
  }
  // Outline only unless an admin clears the box to let the AI write lessons too.
  const structureOnly = formData.get("structureOnly") === "on";
  const result = await applyProposal(db, proposal, { structureOnly });
  // Items missing from the document stay put; only ones an admin ticked are archived (reversible).
  const archiveTypes = ["sub_category", "lesson", "sub_lesson"] as const;
  for (const entry of formData.getAll("archive").map(String)) {
    const [type, id] = entry.split(":");
    if (!id || !archiveTypes.some((item) => item === type)) continue;
    await archiveEntity(db, type as (typeof archiveTypes)[number], id, actor);
  }
  revalidatePath("/course");
  revalidatePath("/admin/review");
  if (result.firstSubLessonId) redirect(`/admin/review/${result.firstSubLessonId}`);
  redirect("/admin/review");
}

export async function approveSubLessonAction(subLessonId: string) {
  if (!(await adminId())) return { error: "Only an admin can approve." };
  const db = await getDb();
  const result = await batchApprove(db, subLessonId);
  if (!result.ok) return result;
  revalidatePath("/course");
  revalidatePath(`/admin/review/${subLessonId}`);
  return result;
}

export async function saveBiteAction(formData: FormData): Promise<void> {
  if (!(await adminId())) return;
  const db = await getDb();
  await saveBiteDraft(db, String(formData.get("biteId")), {
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
  });
  revalidatePath("/admin/review");
}

export async function saveQuestionAction(formData: FormData): Promise<void> {
  if (!(await adminId())) return;
  const choices: Choice[] = ["a", "b", "c", "d"].map((id) => ({ id, text: String(formData.get(`choice-${id}`) ?? "") })).filter((choice) => choice.text.trim());
  const db = await getDb();
  await saveQuestionDraft(db, String(formData.get("questionId")), {
    prompt: String(formData.get("prompt") ?? ""),
    choices,
    correctChoiceId: String(formData.get("correctChoiceId") ?? ""),
    explanation: String(formData.get("explanation") ?? ""),
  });
  revalidatePath("/admin/review");
}

export async function discardBiteAction(biteId: string) {
  if (!(await adminId())) return { error: "Only an admin can delete bites." };
  const db = await getDb();
  await discardBite(db, biteId);
  revalidatePath("/admin/review");
  return { ok: true };
}

export async function regenerateBiteAction(biteId: string) {
  if (!(await adminId())) return { error: "Only an admin can regenerate." };
  const db = await getDb();
  const result = await regenerateBite(db, biteId);
  revalidatePath("/admin/review");
  return result;
}

export async function continueQueueAction() {
  if (!(await adminId())) return;
  const db = await getDb();
  const { processDueJobs } = await import("@/lib/generation/pipeline");
  await processDueJobs(db, 5);
  revalidatePath("/admin/review");
}
