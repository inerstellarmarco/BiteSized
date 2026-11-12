import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { validateMermaid } from "@/lib/ai/diagrams";
import { adminFlagList, addFlag, revisitList } from "@/lib/ai/flags";
import { approveProposal, createProposal } from "@/lib/ai/proposals";
import { draftRegeneration, overwriteOriginal, savePersonalVersion, setPersonalShowing } from "@/lib/ai/regenerate";
import { setDailyCap, usageToday } from "@/lib/ai/usage";
import { learnOverlay } from "@/lib/ai/view";
import { bites, contentRevisions, personalBites, questions, subLessons } from "@/lib/db/schema";
import { LlmUnavailableError, type LlmProvider } from "@/lib/llm";
import { completeWithFailover } from "@/lib/llm/failover";
import { mockProvider } from "@/lib/llm/mock";
import { addExample, ensureStyleDraft, lockStyle, STYLE_EXAMPLE_CAP } from "@/lib/style/guide";
import { createProfile } from "@/lib/auth/profiles";
import { makeStack, withDb } from "./helpers";

const request = { system: "s", user: "u", temperature: 0 };

describe("phase 3", () => {
  it("fails over from a rate-limited provider to the backup", async () => {
    const primary: LlmProvider = {
      id: "gemini",
      async complete() {
        throw new LlmUnavailableError("rate limited");
      },
    };
    const backup: LlmProvider = { id: "openai", async complete() { return "from-backup"; } };
    expect(await completeWithFailover(primary, backup, request)).toBe("from-backup");
    const alsoDown: LlmProvider = { id: "openai", async complete() { throw new LlmUnavailableError(); } };
    await expect(completeWithFailover(primary, alsoDown, request)).rejects.toBeInstanceOf(LlmUnavailableError);
  });

  it("stops at the daily cap with a message", async () => {
    await withDb(async (db) => {
      await createProfile(db, { name: "Cap", pin: "2468", isAdmin: false, id: "prf_cap" });
      await setDailyCap(db, 2);
      const { subLessonId } = await makeStack(db);
      await db.insert(bites).values({ id: "bit_cap", subLessonId, title: "Cap", body: "A long enough original bite for the rewrite.", position: "a0", reviewStatus: "approved" });
      await ensureStyleDraft(db);
      await lockStyle(db, null);
      const a = await draftRegeneration(db, { profileId: "prf_cap", biteId: "bit_cap", preset: "simpler", provider: mockProvider });
      const b = await draftRegeneration(db, { profileId: "prf_cap", biteId: "bit_cap", preset: "analogy", provider: mockProvider });
      const c = await draftRegeneration(db, { profileId: "prf_cap", biteId: "bit_cap", preset: "different", provider: mockProvider });
      expect(a.ok && b.ok).toBe(true);
      expect(c.ok).toBe(false);
      if (!c.ok) expect(c.message).toMatch(/all 2 regenerations/);
      expect((await usageToday(db, "prf_cap")).remaining).toBe(0);
    });
  });

  it("keeps a personal version and badges an updated original", async () => {
    await withDb(async (db) => {
      await createProfile(db, { name: "Me", pin: "2468", isAdmin: false, id: "prf_me" });
      const { subLessonId } = await makeStack(db);
      await db.insert(bites).values({ id: "bit_me", subLessonId, title: "Shared", body: "Original words.", position: "a0", reviewStatus: "approved" });
      await savePersonalVersion(db, {
        profileId: "prf_me",
        biteId: "bit_me",
        title: "Mine",
        body: "My words.",
        diagram: null,
        basedOnUpdatedAt: new Date(Date.now() - 60_000).toISOString(),
      });
      await overwriteOriginal(db, { biteId: "bit_me", title: "Shared", body: "Newer original.", diagram: null, actorId: "prf_admin" });
      const view = await learnOverlay(db, "prf_me", ["bit_me"]);
      expect(view.personal.bit_me?.body).toBe("My words.");
      expect(view.personal.bit_me?.stale).toBe(true);
      await setPersonalShowing(db, "prf_me", "bit_me", "original");
      const switched = await learnOverlay(db, "prf_me", ["bit_me"]);
      expect(switched.personal.bit_me?.showing).toBe("original");
      const [still] = await db.select().from(personalBites).where(eq(personalBites.biteId, "bit_me"));
      expect(still?.body).toBe("My words.");
      const revisions = await db.select().from(contentRevisions).where(eq(contentRevisions.entityId, "bit_me"));
      expect(revisions.some((row) => row.op === "update")).toBe(true);
    });
  });

  it("caps style examples at 20", async () => {
    await withDb(async (db) => {
      for (let index = 0; index < STYLE_EXAMPLE_CAP; index += 1) {
        const added = await addExample(db, { title: `Example ${index}`, body: `Body ${index}` });
        expect(added.ok).toBe(true);
      }
      const overflow = await addExample(db, { title: "One more", body: "No." });
      expect(overflow.ok).toBe(false);
    });
  });

  it("sends rework and errors to admins and keeps revisit private", async () => {
    await withDb(async (db) => {
      await createProfile(db, { name: "Me", pin: "2468", isAdmin: false, id: "prf_me" });
      await addFlag(db, { profileId: "prf_me", targetType: "bite", targetId: "bit_x", kind: "revisit" });
      await addFlag(db, { profileId: "prf_me", targetType: "bite", targetId: "bit_x", kind: "rework", note: "Too hard" });
      await addFlag(db, { profileId: "prf_me", targetType: "question", targetId: "q_x", kind: "error", note: "Wrong fact" });
      expect((await revisitList(db, "prf_me")).map((row) => row.kind)).toEqual(["revisit"]);
      const admin = await adminFlagList(db);
      expect(admin.map((row) => row.kind).sort()).toEqual(["error", "rework"]);
    });
  });

  it("drops a diagram that would not render and flags it", async () => {
    expect(validateMermaid("flowchart TD\n  A[Start] --> B[Idea]").ok).toBe(true);
    expect(validateMermaid("this will not render (((").ok).toBe(false);
    await withDb(async (db) => {
      await createProfile(db, { name: "Me", pin: "2468", isAdmin: false, id: "prf_me" });
      const { subLessonId } = await makeStack(db);
      await db.insert(bites).values({ id: "bit_diagram", subLessonId, title: "Diagram", body: "Original diagram bite text.", position: "a0", reviewStatus: "approved" });
      await ensureStyleDraft(db);
      await lockStyle(db, null);
      const bad: LlmProvider = { id: "mock", async complete(input) { return mockProvider.complete({ ...input, user: `${input.user}\nBAD_DIAGRAM` }); } };
      const draft = await draftRegeneration(db, { profileId: "prf_me", biteId: "bit_diagram", preset: "simpler", provider: bad });
      expect(draft.ok).toBe(true);
      if (draft.ok) {
        expect(draft.diagram).toBeNull();
        expect(draft.diagramFlagged).toBe(true);
      }
      expect((await adminFlagList(db)).some((row) => row.kind === "diagram")).toBe(true);
    });
  });

  it("approves a suggested place and generates a pending sub-lesson", async () => {
    await withDb(async (db) => {
      await createProfile(db, { name: "Me", pin: "2468", isAdmin: false, id: "prf_me" });
      await makeStack(db);
      await ensureStyleDraft(db);
      await lockStyle(db, null);
      const created = await createProposal(db, { profileId: "prf_me", title: "Mutability in practice", notes: "A short extra.", provider: mockProvider });
      expect(created.lessonId).toBe("les_test");
      const approved = await approveProposal(db, created.id, "les_test");
      expect(approved.ok).toBe(true);
      if (approved.ok) {
        const [sub] = await db.select().from(subLessons).where(eq(subLessons.id, approved.subLessonId));
        expect(sub?.title).toBe("Mutability in practice");
        const pending = await db.select().from(bites).where(eq(bites.subLessonId, approved.subLessonId));
        expect(pending.some((bite) => bite.reviewStatus === "pending")).toBe(true);
        const asked = await db.select().from(questions).where(eq(questions.biteId, pending[0]?.id ?? ""));
        expect(asked.length).toBeGreaterThan(0);
        expect(asked.every((question) => question.reviewStatus === "pending")).toBe(true);
      }
    });
  });
});
