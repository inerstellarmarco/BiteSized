import { createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { profiles, sessions } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";
import { asDate } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { SHORT_SESSION_HOURS, TRUSTED_SESSION_DAYS } from "@/lib/types";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  db: AppDatabase,
  input: { profileId: string; trusted: boolean; userAgent?: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const token = randomBytes(32).toString("base64url");
  const lifetime = input.trusted ? TRUSTED_SESSION_DAYS * 24 * 60 * 60 * 1000 : SHORT_SESSION_HOURS * 60 * 60 * 1000;
  const expiresAt = new Date(now.getTime() + lifetime);
  await db.insert(sessions).values({
    id: newId("ses"),
    profileId: input.profileId,
    tokenHash: hashToken(token),
    trusted: input.trusted,
    userAgent: input.userAgent ?? "",
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
  });
  return { token, expiresAt, trusted: input.trusted };
}

export async function profileForToken(db: AppDatabase, token: string, now = new Date()) {
  const [session] = await db.select().from(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  const expires = asDate(session?.expiresAt);
  if (!session || !expires || expires <= now) return null;
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, session.profileId));
  if (!profile || profile.archivedAt) return null;
  return { profile, session };
}

export async function deleteSession(db: AppDatabase, token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}
