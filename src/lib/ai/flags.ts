import { and, desc, eq } from "drizzle-orm";
import { bites, contentFlags, questions } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";
import { updateBite } from "@/lib/content/ops";
import { newId } from "@/lib/ids";

export const FLAG_KINDS = ["revisit", "rework", "error", "diagram"] as const;
export type FlagKind = (typeof FLAG_KINDS)[number];

export async function addFlag(
  db: AppDatabase,
  input: { profileId: string; targetType: "bite" | "question"; targetId: string; kind: FlagKind; note?: string },
) {
  const id = newId("flg");
  await db.insert(contentFlags).values({
    id,
    profileId: input.profileId,
    targetType: input.targetType,
    targetId: input.targetId,
    kind: input.kind,
    note: input.note ?? "",
    status: "open",
  });
  return id;
}

export async function revisitList(db: AppDatabase, profileId: string) {
  return db
    .select()
    .from(contentFlags)
    .where(and(eq(contentFlags.profileId, profileId), eq(contentFlags.kind, "revisit"), eq(contentFlags.status, "open")))
    .orderBy(desc(contentFlags.createdAt));
}

export async function adminFlagList(db: AppDatabase) {
  const rows = await db
    .select()
    .from(contentFlags)
    .where(and(eq(contentFlags.status, "open")))
    .orderBy(desc(contentFlags.createdAt));
  return rows.filter((row) => row.kind === "rework" || row.kind === "error" || row.kind === "diagram");
}

export async function acceptFlagFix(db: AppDatabase, flagId: string, actorId: string, body: string) {
  const [flag] = await db.select().from(contentFlags).where(eq(contentFlags.id, flagId));
  if (!flag || flag.targetType !== "bite") return { ok: false as const, error: "That flag is not on a bite." };
  const [bite] = await db.select().from(bites).where(eq(bites.id, flag.targetId));
  if (!bite) return { ok: false as const, error: "The bite is gone." };
  await updateBite(db, bite.id, { body }, actorId);
  await db.update(contentFlags).set({ status: "accepted" }).where(eq(contentFlags.id, flagId));
  return { ok: true as const };
}

export async function questionText(db: AppDatabase, questionId: string) {
  const [question] = await db.select().from(questions).where(eq(questions.id, questionId));
  return question ?? null;
}
