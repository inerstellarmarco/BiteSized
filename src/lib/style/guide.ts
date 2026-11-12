import { asc, desc, eq } from "drizzle-orm";
import { styleDrafts, styleExamples, styleVersions } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";
import { newId } from "@/lib/ids";
import { getLlmClient } from "@/lib/llm";
import { generateKeyBetween } from "fractional-indexing";

export const STYLE_EXAMPLE_CAP = 20;

export const defaultStyle = {
  tone: "Clear and friendly, like a patient tutor sitting next to you. No hype, no scolding, no jokes that crowd out the idea.",
  lengthGuide: "One idea. About 45 to 75 words, short enough to read in about 30 seconds on a phone.",
  readingLevel: "Everyday words. If a technical term is needed, say what it means in the same card.",
  analogyUse: "At most one short analogy, and only when it makes the idea concrete. Skip it when the plain version is already clear.",
  formatting: "One or two short paragraphs. No headings, no bullet lists, and no markdown inside the card.",
  temperature: "0.4",
};

export type StyleFields = typeof defaultStyle;

export async function ensureStyleDraft(db: AppDatabase) {
  const [existing] = await db.select().from(styleDrafts).where(eq(styleDrafts.id, "draft"));
  if (existing) return existing;
  await db.insert(styleDrafts).values({ id: "draft", ...defaultStyle });
  const [created] = await db.select().from(styleDrafts).where(eq(styleDrafts.id, "draft"));
  return created;
}

export async function saveStyleDraft(db: AppDatabase, fields: StyleFields) {
  await ensureStyleDraft(db);
  await db.update(styleDrafts).set({ ...fields, updatedAt: new Date() }).where(eq(styleDrafts.id, "draft"));
}

export async function listExamples(db: AppDatabase) {
  return db.select().from(styleExamples).orderBy(asc(styleExamples.position));
}

export async function addExample(db: AppDatabase, input: { title: string; body: string }) {
  const existing = await listExamples(db);
  if (existing.length >= STYLE_EXAMPLE_CAP) {
    return { ok: false as const, error: `Style examples are capped at ${STYLE_EXAMPLE_CAP}. Remove one first.` };
  }
  const position = generateKeyBetween(existing.at(-1)?.position ?? null, null);
  const id = newId("ex");
  await db.insert(styleExamples).values({ id, title: input.title.trim(), body: input.body.trim(), position });
  return { ok: true as const, id };
}

export async function removeExample(db: AppDatabase, id: string) {
  await db.delete(styleExamples).where(eq(styleExamples.id, id));
}

export async function listStyleVersions(db: AppDatabase) {
  return db.select().from(styleVersions).orderBy(desc(styleVersions.number));
}

export async function lockStyle(db: AppDatabase, actorId: string | null) {
  const draft = await ensureStyleDraft(db);
  if (!draft) throw new Error("Style draft is missing.");
  const examples = await listExamples(db);
  const versions = await listStyleVersions(db);
  const number = (versions[0]?.number ?? 0) + 1;
  const client = getLlmClient();
  const id = newId("sty");
  await db.insert(styleVersions).values({
    id,
    number,
    tone: draft.tone,
    lengthGuide: draft.lengthGuide,
    readingLevel: draft.readingLevel,
    analogyUse: draft.analogyUse,
    formatting: draft.formatting,
    temperature: draft.temperature,
    model: client.model,
    provider: client.providerId,
    examples: examples.map((example) => ({ title: example.title, body: example.body })),
    lockedBy: actorId,
  });
  return { id, number };
}

export async function latestLockedStyle(db: AppDatabase) {
  const [version] = await listStyleVersions(db);
  return version ?? null;
}
