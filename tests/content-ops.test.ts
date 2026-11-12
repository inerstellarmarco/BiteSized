import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { archiveEntity, insertBite, moveEntity, restoreEntity, updateBite, activeBites } from "@/lib/content/ops";
import { markBiteSeen, subLessonProgress } from "@/lib/content/progress";
import { bites, contentRevisions } from "@/lib/db/schema";
import { createProfile } from "@/lib/auth/profiles";
import { makeStack, withDb } from "./helpers";

describe("content model", () => {
  it("inserts and moves by touching one row", async () => {
    await withDb(async (db) => {
      const { subLessonId } = await makeStack(db);
      const first = await insertBite(db, { subLessonId, title: "One", body: "First", id: "bit_one" });
      const second = await insertBite(db, { subLessonId, title: "Two", body: "Second", id: "bit_two" });
      const third = await insertBite(db, { subLessonId, title: "Three", body: "Third", id: "bit_three" });
      const before = await db.select().from(bites);
      const positions = new Map(before.map((row) => [row.id, row.position]));

      await insertBite(db, { subLessonId, title: "Between", body: "Inserted", id: "bit_between", toIndex: 1 });
      const afterInsert = await db.select().from(bites);
      for (const row of afterInsert) {
        if (positions.has(row.id)) expect(row.position).toBe(positions.get(row.id));
      }
      const order = (await activeBites(db, subLessonId)).map((row) => row.id);
      expect(order).toEqual(["bit_one", "bit_between", "bit_two", "bit_three"]);

      const stable = new Map((await db.select().from(bites)).map((row) => [row.id, row.position]));
      await moveEntity(db, "bite", third.id, 0);
      const afterMove = await db.select().from(bites);
      const moved = afterMove.find((row) => row.id === third.id);
      expect(moved?.id).toBe(third.id);
      expect(moved?.position).not.toBe(stable.get(third.id));
      for (const row of afterMove) {
        if (row.id !== third.id) expect(row.position).toBe(stable.get(row.id));
      }
      expect((await activeBites(db, subLessonId)).map((row) => row.id)[0]).toBe(third.id);
      expect(first.id).toBe("bit_one");
      expect(second.position).toBe(positions.get(second.id));
    });
  });

  it("archives, restores, and keeps version history", async () => {
    await withDb(async (db) => {
      const { subLessonId } = await makeStack(db);
      const bite = await insertBite(db, { subLessonId, title: "Draft", body: "Old", id: "bit_hist" });
      await updateBite(db, bite.id, { body: "New" }, "prf_editor");
      const revisions = await db.select().from(contentRevisions).where(eq(contentRevisions.entityId, bite.id));
      const update = revisions.find((row) => row.op === "update");
      expect(update?.snapshot).toMatchObject({ body: "Old" });
      expect((await db.select().from(bites).where(eq(bites.id, bite.id)))[0]?.body).toBe("New");

      await archiveEntity(db, "bite", bite.id);
      expect(await activeBites(db, subLessonId)).toHaveLength(0);
      await restoreEntity(db, "bite", bite.id);
      expect((await activeBites(db, subLessonId)).map((row) => row.id)).toEqual([bite.id]);
      const ops = (await db.select().from(contentRevisions).where(eq(contentRevisions.entityId, bite.id))).map((row) => row.op);
      expect(ops).toContain("archive");
      expect(ops).toContain("restore");
    });
  });

  it("recomputes progress from the bites that are current", async () => {
    await withDb(async (db) => {
      const { subLessonId } = await makeStack(db);
      const profile = await createProfile(db, { name: "Ada", pin: "2468", isAdmin: false, id: "prf_ada" });
      expect(profile.ok).toBe(true);
      const a = await insertBite(db, { subLessonId, title: "A", body: "A", id: "bit_a" });
      const b = await insertBite(db, { subLessonId, title: "B", body: "B", id: "bit_b" });
      await markBiteSeen(db, "prf_ada", a.id);
      await markBiteSeen(db, "prf_ada", b.id);
      expect(await subLessonProgress(db, "prf_ada", subLessonId)).toMatchObject({ seen: 2, total: 2, ratio: 1 });

      await archiveEntity(db, "bite", b.id);
      expect(await subLessonProgress(db, "prf_ada", subLessonId)).toMatchObject({ seen: 1, total: 1, ratio: 1 });

      await insertBite(db, { subLessonId, title: "C", body: "C", id: "bit_c" });
      expect(await subLessonProgress(db, "prf_ada", subLessonId)).toMatchObject({ seen: 1, total: 2, ratio: 0.5 });

      await restoreEntity(db, "bite", b.id);
      expect(await subLessonProgress(db, "prf_ada", subLessonId)).toMatchObject({ seen: 2, total: 3 });
    });
  });
});
