import { eq } from "drizzle-orm";
import { createSession } from "@/lib/auth/session";
import { verifyPinHash } from "@/lib/auth/pin";
import { pinAttempts, profiles } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";
import { asDate } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { PIN_FAILS_BEFORE_LOCK, PIN_IP_ATTEMPT_LIMIT, PIN_LOCK_MS, PIN_PROFILE_ATTEMPT_LIMIT, PIN_WINDOW_MS } from "@/lib/types";

export type SignInResult =
  | { ok: true; profileId: string; token: string; expiresAt: Date; trusted: boolean }
  | { ok: false; reason: "invalid" | "locked" | "rate_limited"; triesLeft?: number; lockedUntil?: string };

async function recordAttempt(db: AppDatabase, input: { profileId: string | null; ip: string; success: boolean; now: Date }) {
  await db.insert(pinAttempts).values({
    id: newId("pat"),
    profileId: input.profileId,
    ip: input.ip,
    success: input.success,
    attemptedAt: input.now,
  });
}

export async function attemptSignIn(
  db: AppDatabase,
  input: { profileId: string; pin: string; ip: string; trusted?: boolean; userAgent?: string; now?: Date },
): Promise<SignInResult> {
  const now = input.now ?? new Date();
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, input.profileId));
  if (!profile || profile.archivedAt) {
    await recordAttempt(db, { profileId: null, ip: input.ip, success: false, now });
    return { ok: false, reason: "invalid" };
  }

  const lockedUntil = asDate(profile.lockedUntil);
  if (lockedUntil && lockedUntil > now) {
    await recordAttempt(db, { profileId: profile.id, ip: input.ip, success: false, now });
    return { ok: false, reason: "locked", lockedUntil: lockedUntil.toISOString() };
  }

  let failedAttempts = profile.failedAttempts;
  if (lockedUntil && lockedUntil <= now && failedAttempts > 0) {
    failedAttempts = 0;
    await db.update(profiles).set({ failedAttempts: 0, lockedUntil: null, updatedAt: now }).where(eq(profiles.id, profile.id));
  }

  const since = now.getTime() - PIN_WINDOW_MS;
  const recent = await db.select().from(pinAttempts);
  const inWindow = recent.filter((row) => {
    const at = asDate(row.attemptedAt);
    return at ? at.getTime() >= since : false;
  });
  const profileCount = inWindow.filter((row) => row.profileId === profile.id).length;
  const ipCount = inWindow.filter((row) => row.ip === input.ip).length;
  if (profileCount >= PIN_PROFILE_ATTEMPT_LIMIT || ipCount >= PIN_IP_ATTEMPT_LIMIT) {
    await recordAttempt(db, { profileId: profile.id, ip: input.ip, success: false, now });
    return { ok: false, reason: "rate_limited" };
  }

  const matches = await verifyPinHash(input.pin, profile.pinHash);
  await recordAttempt(db, { profileId: profile.id, ip: input.ip, success: matches, now });
  if (!matches) {
    const nextFails = failedAttempts + 1;
    const locks = nextFails >= PIN_FAILS_BEFORE_LOCK;
    const until = locks ? new Date(now.getTime() + PIN_LOCK_MS) : null;
    await db
      .update(profiles)
      .set({ failedAttempts: nextFails, lockedUntil: until, updatedAt: now })
      .where(eq(profiles.id, profile.id));
    return {
      ok: false,
      reason: locks ? "locked" : "invalid",
      triesLeft: Math.max(0, PIN_FAILS_BEFORE_LOCK - nextFails),
      lockedUntil: until?.toISOString(),
    };
  }

  await db
    .update(profiles)
    .set({ failedAttempts: 0, lockedUntil: null, updatedAt: now })
    .where(eq(profiles.id, profile.id));
  const session = await createSession(db, {
    profileId: profile.id,
    trusted: input.trusted !== false,
    userAgent: input.userAgent,
    now,
  });
  return { ok: true, profileId: profile.id, token: session.token, expiresAt: session.expiresAt, trusted: session.trusted };
}
