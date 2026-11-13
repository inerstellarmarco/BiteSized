import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { subLessonLabel, loadCatalog } from "@/lib/content/catalog";
import { archiveEntity } from "@/lib/content/ops";
import { applyProposal, findMissing } from "@/lib/import/apply";
import { parseOutlineText, propose } from "@/lib/import/parse";
import { bites, lessons, subLessons } from "@/lib/db/schema";
import { withDb } from "./helpers";

const outline = (lessonTwo: string, extraSub = "") => `
[HEADING_1||] Track A: Foundations
[HEADING_2||] A1 Basics [Foundations]
[HEADING_3||] A1.1 First Lesson
[||] 1. Alpha
[|36|] • Topic one
[||] 2. Beta
[|36|] • Topic two
${extraSub}
[HEADING_3||] A1.2 ${lessonTwo}
[||] 1. Gamma
[|36|] • Topic three
[HEADING_1||] Track B: Next
[HEADING_2||] B1 More [Intermediate]
[HEADING_3||] B1.1 Another
[||] 1. Delta
[|36|] • Topic four
`;

describe("outline import and re-import", () => {
  it("builds the whole structure with no content and shows nothing to learn yet", async () => {
    await withDb(async (db) => {
      const result = await applyProposal(db, propose(parseOutlineText(outline("Second Lesson"))), { structureOnly: true });
      expect(result.created).toBeGreaterThan(0);
      const catalog = await loadCatalog(db, null);
      expect(catalog?.categories.map((item) => item.code)).toEqual(["A", "B"]);
      const flat = catalog!.categories.flatMap((c) => c.subCategories.flatMap((s) => s.lessons.flatMap((l) => l.subLessons)));
      expect(flat.length).toBe(4);
      expect(flat.every((item) => item.biteCount === 0)).toBe(true);
      const firstLesson = catalog!.categories[0].subCategories[0].lessons[0];
      expect(firstLesson.subLessons.map((item) => item.label)).toEqual(["A1.1a", "A1.1b"]);
    });
  });

  it("does not duplicate on re-import, renames in place, and keeps in-app additions", async () => {
    await withDb(async (db) => {
      await applyProposal(db, propose(parseOutlineText(outline("Second Lesson"))), { structureOnly: true });

      // An admin adds a lesson inside the app (no heading code, not in the document).
      const [module] = await db.select().from(lessons).where(eq(lessons.code, "A1.1"));
      await db.insert(lessons).values({
        id: "les_in_app",
        subCategoryId: module.subCategoryId,
        code: "",
        title: "Added in the app",
        prerequisiteIds: [],
        position: "z",
      });

      // The document is edited: lesson A1.2 is renamed.
      const second = propose(parseOutlineText(outline("Second Lesson, renamed")));
      await applyProposal(db, second, { structureOnly: true });

      const allLessons = await db.select().from(lessons);
      expect(allLessons.filter((row) => row.code === "A1.2")).toHaveLength(1);
      expect(allLessons.find((row) => row.code === "A1.2")?.title).toBe("A1.2 Second Lesson, renamed");
      expect(allLessons.find((row) => row.id === "les_in_app")?.archivedAt).toBeNull();
      expect(await db.select().from(subLessons)).toHaveLength(4);
      expect(await db.select().from(bites)).toHaveLength(4);
    });
  });

  it("lists what the document no longer mentions, and only archives what is chosen", async () => {
    await withDb(async (db) => {
      await applyProposal(db, propose(parseOutlineText(outline("Second Lesson"))), { structureOnly: true });
      const shorter = parseOutlineText(outline("Second Lesson").replace("[||] 2. Beta\n[|36|] • Topic two\n", ""));
      const proposal = propose(shorter);
      await applyProposal(db, proposal, { structureOnly: true });

      const missing = await findMissing(db, proposal);
      expect(missing.map((item) => item.label)).toEqual(["Beta"]);
      const beta = (await db.select().from(subLessons)).find((row) => row.title === "Beta");
      expect(beta?.archivedAt).toBeNull();

      await archiveEntity(db, "sub_lesson", missing[0].id, null);
      const after = await db.select().from(subLessons).where(eq(subLessons.id, missing[0].id));
      expect(after[0].archivedAt).not.toBeNull();
      expect(await findMissing(db, proposal)).toEqual([]);
    });
  });

  it("labels sub-lessons with short letters", () => {
    expect(subLessonLabel("B4.2", 0)).toBe("B4.2a");
    expect(subLessonLabel("B4.2", 2)).toBe("B4.2c");
    expect(subLessonLabel("B4.2", 26)).toBe("B4.2-27");
  });
});
