import { and, eq } from "drizzle-orm";
import { takeRegeneration } from "@/lib/ai/usage";
import { validateMermaid } from "@/lib/ai/diagrams";
import { bites, contentFlags, personalBites } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";
import { asDate } from "@/lib/dates";
import { updateBite } from "@/lib/content/ops";
import { newId } from "@/lib/ids";
import { AI_UNAVAILABLE, getLlmClient, LlmUnavailableError, type LlmProvider } from "@/lib/llm";
import { latestLockedStyle } from "@/lib/style/guide";

export const REGENERATE_PRESETS = [
  { id: "simpler", label: "Make it simpler", instruction: "Rewrite the bite in simpler words. Keep the same fact." },
  { id: "analogy", label: "Give an analogy", instruction: "Rewrite the bite with one short analogy. Keep the fact accurate." },
  { id: "different", label: "Explain it differently", instruction: "Explain the same fact from a different angle. Do not add a new fact." },
] as const;

export type PresetId = (typeof REGENERATE_PRESETS)[number]["id"];

export function presetById(id: string) {
  return REGENERATE_PRESETS.find((preset) => preset.id === id) ?? null;
}

export async function draftRegeneration(
  db: AppDatabase,
  input: { profileId: string; biteId: string; preset: PresetId; provider?: LlmProvider; now?: Date },
) {
  const preset = presetById(input.preset);
  if (!preset) return { ok: false as const, message: "Choose one of the three rewrite options." };
  const style = await latestLockedStyle(db);
  if (!style) return { ok: false as const, message: "An admin needs to lock a style before rewriting." };
  const [bite] = await db.select().from(bites).where(eq(bites.id, input.biteId));
  if (!bite || bite.archivedAt || bite.reviewStatus !== "approved") return { ok: false as const, message: "That bite is not available." };
  const slot = await takeRegeneration(db, input.profileId, input.now);
  if (!slot.ok) return { ok: false as const, limited: true, message: slot.message, remaining: 0 };
  const provider = input.provider ?? getLlmClient();
  let raw = "";
  try {
    raw = await provider.complete({
      system: `Tone: ${style.tone}\nLength: ${style.lengthGuide}\nReading level: ${style.readingLevel}\nAnalogies: ${style.analogyUse}\nFormatting: ${style.formatting}\nReturn JSON with title, body, and an optional mermaid diagram.`,
      user: `TASK: regenerate\nPRESET: ${preset.id}\nINSTRUCTION: ${preset.instruction}\nTITLE: ${bite.title}\nBODY: ${bite.body}`,
      temperature: Number(style.temperature) || 0.4,
      json: true,
    });
  } catch (error) {
    return { ok: false as const, message: error instanceof LlmUnavailableError ? AI_UNAVAILABLE : AI_UNAVAILABLE, remaining: slot.remaining };
  }
  let parsed: { title?: string; body?: string; diagram?: string };
  try {
    parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { title?: string; body?: string; diagram?: string };
  } catch {
    return { ok: false as const, message: AI_UNAVAILABLE, remaining: slot.remaining };
  }
  if (!parsed.body?.trim()) return { ok: false as const, message: AI_UNAVAILABLE, remaining: slot.remaining };
  let diagram: string | null = parsed.diagram?.trim() || null;
  let diagramFlagged = false;
  if (diagram) {
    const check = validateMermaid(diagram);
    if (!check.ok) {
      diagramFlagged = true;
      await db.insert(contentFlags).values({
        id: newId("flg"),
        profileId: input.profileId,
        targetType: "bite",
        targetId: bite.id,
        kind: "diagram",
        note: check.reason,
        status: "open",
      });
      diagram = null;
    }
  }
  return {
    ok: true as const,
    title: parsed.title?.trim() || bite.title,
    body: parsed.body.trim(),
    diagram,
    diagramFlagged,
    remaining: slot.remaining,
    limit: slot.limit,
    basedOnUpdatedAt: asDate(bite.updatedAt)?.toISOString() ?? new Date().toISOString(),
  };
}

export async function savePersonalVersion(
  db: AppDatabase,
  input: { profileId: string; biteId: string; title: string; body: string; diagram: string | null; basedOnUpdatedAt: string },
) {
  const based = new Date(input.basedOnUpdatedAt);
  await db
    .insert(personalBites)
    .values({
      profileId: input.profileId,
      biteId: input.biteId,
      title: input.title,
      body: input.body,
      diagram: input.diagram,
      basedOnUpdatedAt: based,
      showing: "personal",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [personalBites.profileId, personalBites.biteId],
      set: {
        title: input.title,
        body: input.body,
        diagram: input.diagram,
        basedOnUpdatedAt: based,
        showing: "personal",
        updatedAt: new Date(),
      },
    });
}

export async function overwriteOriginal(
  db: AppDatabase,
  input: { biteId: string; title: string; body: string; diagram: string | null; actorId: string },
) {
  await updateBite(db, input.biteId, { title: input.title, body: input.body, diagram: input.diagram }, input.actorId);
}

export async function setPersonalShowing(db: AppDatabase, profileId: string, biteId: string, showing: "personal" | "original") {
  await db
    .update(personalBites)
    .set({ showing, updatedAt: new Date() })
    .where(and(eq(personalBites.profileId, profileId), eq(personalBites.biteId, biteId)));
}
