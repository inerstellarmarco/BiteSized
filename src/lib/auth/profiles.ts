import { and, eq, isNull } from "drizzle-orm";
import { hashPin, validatePinFormat, verifyPinHash } from "@/lib/auth/pin";
import { profiles } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";
import { newId } from "@/lib/ids";
import { MAX_PROFILES, type FontSize, type ThemePreference } from "@/lib/types";

export type ProfileFailure = { ok: false; code: string; error: string };
export type ProfileSuccess = { ok: true; id: string };

async function activeProfiles(db: AppDatabase) {
  return db.select().from(profiles).where(isNull(profiles.archivedAt));
}

async function activeAdminCount(db: AppDatabase, exceptId?: string) {
  const rows = await activeProfiles(db);
  return rows.filter((row) => row.isAdmin && row.id !== exceptId).length;
}

export async function createProfile(
  db: AppDatabase,
  input: { name: string; pin: string; isAdmin: boolean; id?: string },
): Promise<ProfileSuccess | ProfileFailure> {
  const name = input.name.trim();
  if (!name || name.length > 40) {
    return { ok: false, code: "invalid_name", error: "Use a name of 1 to 40 characters." };
  }
  const pinError = validatePinFormat(input.pin, input.isAdmin);
  if (pinError) return { ok: false, code: "invalid_pin", error: pinError };
  const active = await activeProfiles(db);
  if (active.length >= MAX_PROFILES) {
    return { ok: false, code: "profile_limit", error: "This family already has 3 profiles." };
  }
  if (active.some((row) => row.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    return { ok: false, code: "duplicate_name", error: "A profile with that name already exists." };
  }
  const id = input.id ?? newId("prf");
  await db.insert(profiles).values({
    id,
    name,
    pinHash: await hashPin(input.pin),
    isAdmin: input.isAdmin,
  });
  return { ok: true, id };
}

export async function setAdmin(
  db: AppDatabase,
  profileId: string,
  isAdmin: boolean,
): Promise<ProfileSuccess | ProfileFailure> {
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId));
  if (!profile || profile.archivedAt) return { ok: false, code: "not_found", error: "That profile is not available." };
  if (profile.isAdmin && !isAdmin) {
    const others = await activeAdminCount(db, profileId);
    if (others < 1) {
      return {
        ok: false,
        code: "last_admin",
        error: "The last admin cannot be demoted. Add another admin first.",
      };
    }
  }
  await db.update(profiles).set({ isAdmin, updatedAt: new Date() }).where(eq(profiles.id, profileId));
  return { ok: true, id: profileId };
}

export async function archiveProfile(
  db: AppDatabase,
  profileId: string,
  actorId?: string,
): Promise<ProfileSuccess | ProfileFailure> {
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId));
  if (!profile || profile.archivedAt) return { ok: false, code: "not_found", error: "That profile is not available." };
  if (actorId && actorId === profileId) {
    return { ok: false, code: "self_remove", error: "You cannot remove the profile you are using." };
  }
  if (profile.isAdmin) {
    const others = await activeAdminCount(db, profileId);
    if (others < 1) {
      return {
        ok: false,
        code: "last_admin",
        error: "The last admin cannot be removed. Add another admin first.",
      };
    }
  }
  await db.update(profiles).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(profiles.id, profileId));
  return { ok: true, id: profileId };
}

export async function restoreProfile(db: AppDatabase, profileId: string): Promise<ProfileSuccess | ProfileFailure> {
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId));
  if (!profile) return { ok: false, code: "not_found", error: "That profile is not available." };
  if (!profile.archivedAt) return { ok: true, id: profileId };
  const active = await activeProfiles(db);
  if (active.length >= MAX_PROFILES) {
    return { ok: false, code: "profile_limit", error: "Restore needs a free profile slot. Three are already in use." };
  }
  if (active.some((row) => row.name.toLocaleLowerCase() === profile.name.toLocaleLowerCase())) {
    return { ok: false, code: "duplicate_name", error: "An active profile already uses that name." };
  }
  await db.update(profiles).set({ archivedAt: null, updatedAt: new Date() }).where(eq(profiles.id, profileId));
  return { ok: true, id: profileId };
}

export async function adminResetPin(
  db: AppDatabase,
  input: { actorId: string; targetId: string; pin: string },
): Promise<ProfileSuccess | ProfileFailure> {
  if (input.actorId === input.targetId) {
    return { ok: false, code: "self", error: "Change your own PIN from settings, where the current PIN is required." };
  }
  const [actor] = await db.select().from(profiles).where(eq(profiles.id, input.actorId));
  if (!actor?.isAdmin || actor.archivedAt) return { ok: false, code: "forbidden", error: "Only an admin can reset a PIN." };
  const [target] = await db.select().from(profiles).where(eq(profiles.id, input.targetId));
  if (!target || target.archivedAt) return { ok: false, code: "not_found", error: "That profile is not available." };
  const pinError = validatePinFormat(input.pin, target.isAdmin);
  if (pinError) return { ok: false, code: "invalid_pin", error: pinError };
  await db
    .update(profiles)
    .set({
      pinHash: await hashPin(input.pin),
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(profiles.id, target.id));
  return { ok: true, id: target.id };
}

export async function changeOwnPin(
  db: AppDatabase,
  input: { profileId: string; currentPin: string; nextPin: string },
): Promise<ProfileSuccess | ProfileFailure> {
  const [profile] = await db.select().from(profiles).where(and(eq(profiles.id, input.profileId), isNull(profiles.archivedAt)));
  if (!profile) return { ok: false, code: "not_found", error: "That profile is not available." };
  const matches = await verifyPinHash(input.currentPin, profile.pinHash);
  if (!matches) return { ok: false, code: "invalid_pin", error: "The current PIN does not match." };
  const pinError = validatePinFormat(input.nextPin, profile.isAdmin);
  if (pinError) return { ok: false, code: "invalid_pin", error: pinError };
  await db
    .update(profiles)
    .set({ pinHash: await hashPin(input.nextPin), failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(profiles.id, profile.id));
  return { ok: true, id: profile.id };
}

export async function updatePreferences(
  db: AppDatabase,
  profileId: string,
  prefs: { theme?: ThemePreference; fontSize?: FontSize },
) {
  await db
    .update(profiles)
    .set({ ...prefs, updatedAt: new Date() })
    .where(eq(profiles.id, profileId));
}

export async function emergencyResetPin(db: AppDatabase, name: string, pin: string) {
  const trimmed = name.trim();
  const rows = await activeProfiles(db);
  const matches = rows.filter((row) => row.name === trimmed);
  if (matches.length !== 1) {
    throw new Error(`Expected one active profile named "${trimmed}", found ${matches.length}.`);
  }
  const profile = matches[0];
  const pinError = validatePinFormat(pin, profile.isAdmin);
  if (pinError) throw new Error(pinError);
  await db
    .update(profiles)
    .set({
      pinHash: await hashPin(pin),
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(profiles.id, profile.id));
  return profile.id;
}

export async function listProfiles(db: AppDatabase) {
  const rows = await db.select().from(profiles);
  return rows.sort((a, b) => {
    const left = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
    const right = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
    return left - right;
  });
}
