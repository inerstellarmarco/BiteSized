import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { emergencyResetPin, archiveProfile, createProfile, setAdmin } from "@/lib/auth/profiles";
import { attemptSignIn } from "@/lib/auth/signin";
import { profileForToken } from "@/lib/auth/session";
import { profiles, sessions } from "@/lib/db/schema";
import { TRUSTED_SESSION_DAYS } from "@/lib/types";
import { withDb } from "./helpers";

const start = new Date("2026-11-12T12:00:00.000Z");

describe("PIN lockout and admins", () => {
  it("locks a profile after repeated wrong PINs and allows a trusted device", async () => {
    await withDb(async (db) => {
      const created = await createProfile(db, { name: "Eric", pin: "family-admin", isAdmin: true, id: "prf_eric" });
      expect(created.ok).toBe(true);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const wrong = await attemptSignIn(db, {
          profileId: "prf_eric",
          pin: "nope-nope",
          ip: "10.0.0.8",
          now: new Date(start.getTime() + attempt * 1000),
        });
        expect(wrong.ok).toBe(false);
        if (!wrong.ok) expect(wrong.reason).toBe("invalid");
      }
      const fifth = await attemptSignIn(db, {
        profileId: "prf_eric",
        pin: "nope-nope",
        ip: "10.0.0.8",
        now: new Date(start.getTime() + 4000),
      });
      expect(fifth).toMatchObject({ ok: false, reason: "locked" });
      const duringLock = await attemptSignIn(db, {
        profileId: "prf_eric",
        pin: "family-admin",
        ip: "10.0.0.8",
        now: new Date(start.getTime() + 5000),
      });
      expect(duringLock).toMatchObject({ ok: false, reason: "locked" });

      const later = await attemptSignIn(db, {
        profileId: "prf_eric",
        pin: "family-admin",
        ip: "10.0.0.8",
        trusted: true,
        now: new Date(start.getTime() + 16 * 60 * 1000),
      });
      expect(later.ok).toBe(true);
      if (later.ok) {
        const days = (later.expiresAt.getTime() - (start.getTime() + 16 * 60 * 1000)) / (24 * 60 * 60 * 1000);
        expect(days).toBeCloseTo(TRUSTED_SESSION_DAYS, 0);
        const session = await profileForToken(db, later.token, later.expiresAt);
        expect(session).toBeNull();
        const still = await profileForToken(db, later.token, new Date(later.expiresAt.getTime() - 1000));
        expect(still?.profile.name).toBe("Eric");
      }
      const [row] = await db.select().from(sessions);
      expect(row?.trusted).toBe(true);
    });
  });

  it("rate limits a profile that keeps trying", async () => {
    await withDb(async (db) => {
      await createProfile(db, { name: "Sam", pin: "1357", isAdmin: false, id: "prf_sam" });
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await attemptSignIn(db, {
          profileId: "prf_sam",
          pin: "0000",
          ip: "10.1.1.1",
          now: new Date(start.getTime() + attempt * 1000),
        });
        await db.update(profiles).set({ failedAttempts: 0, lockedUntil: null }).where(eq(profiles.id, "prf_sam"));
      }
      const blocked = await attemptSignIn(db, {
        profileId: "prf_sam",
        pin: "1357",
        ip: "10.9.9.9",
        now: new Date(start.getTime() + 9000),
      });
      expect(blocked).toMatchObject({ ok: false, reason: "rate_limited" });
    });
  });

  it("refuses to remove or demote the last admin", async () => {
    await withDb(async (db) => {
      await createProfile(db, { name: "Eric", pin: "family-admin", isAdmin: true, id: "prf_eric" });
      expect(await setAdmin(db, "prf_eric", false)).toMatchObject({ ok: false, code: "last_admin" });
      expect(await archiveProfile(db, "prf_eric")).toMatchObject({ ok: false, code: "last_admin" });

      const second = await createProfile(db, { name: "Nia", pin: "nia-admin-pass", isAdmin: true, id: "prf_nia" });
      expect(second.ok).toBe(true);
      expect(await setAdmin(db, "prf_eric", false)).toMatchObject({ ok: true });
      expect(await archiveProfile(db, "prf_nia")).toMatchObject({ ok: false, code: "last_admin" });

      expect((await createProfile(db, { name: "Jo", pin: "2468", isAdmin: false })).ok).toBe(true);
      expect((await createProfile(db, { name: "Max", pin: "3690", isAdmin: false })).ok).toBe(false);

      await emergencyResetPin(db, "Nia", "fresh-passphrase");
      const signedIn = await attemptSignIn(db, { profileId: "prf_nia", pin: "fresh-passphrase", ip: "local", now: start });
      expect(signedIn.ok).toBe(true);
    });
  });
});
