import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireProfile } from "@/lib/auth/current";
import { applyImportAction, updateMappingAction } from "@/lib/actions/ai";
import { AdminNav } from "@/components/admin-nav";
import { ImportStart } from "@/components/import-start";
import { Button } from "@/components/ui/button";
import { importDrafts } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { countProposal, defaultMapping, propose, type Block, type HeadingRole, type LevelMapping } from "@/lib/import/parse";

const roles: HeadingRole[] = ["category", "sub_category", "lesson", "toolkit", "ignore"];

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const profile = await requireProfile();
  if (!profile.isAdmin) redirect("/home");
  const { draft: draftId } = await searchParams;
  const db = await getDb();
  const draft = draftId ? (await db.select().from(importDrafts).where(eq(importDrafts.id, draftId)))[0] : null;
  const mapping = (draft?.mapping as LevelMapping | undefined) ?? defaultMapping;
  const proposal = draft ? propose(draft.blocks as Block[], mapping) : null;
  const counts = proposal ? countProposal(proposal) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <AdminNav current="/admin/import" />
      <h1 className="font-display text-4xl">Import a Google Doc</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Paste a Doc shared as anyone with the link, or upload an HTML, Word, or outline export. Headings stay at their levels. Nothing is written until you apply the preview.
      </p>
      <ImportStart />
      {draft && proposal && counts ? (
        <section className="mt-8" data-testid="import-preview">
          <h2 className="font-display text-2xl">Preview</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            From {draft.sourceLabel}. {counts.categories} categories, {counts.lessons} lessons, {counts.subLessons} sub-lessons, {counts.topics} bite topics. Matching uses the heading code, then the title, so a second import does not duplicate A1.1.
          </p>
          <form
            className="mt-3 flex flex-wrap gap-2"
            action={async (formData) => {
              "use server";
              await updateMappingAction(draft.id, {
                h1: String(formData.get("h1")) as HeadingRole,
                h2: String(formData.get("h2")) as HeadingRole,
                h3: String(formData.get("h3")) as HeadingRole,
                h4: String(formData.get("h4")) as HeadingRole,
              });
            }}
          >
            {(["h1", "h2", "h3", "h4"] as const).map((level) => (
              <label key={level} className="text-sm">
                {level.toUpperCase()}
                <select name={level} defaultValue={mapping[level]} className="mt-1 block rounded-lg border border-input bg-card px-2 py-2">
                  {roles.map((role) => (
                    <option key={role} value={role}>{role.replace("_", " ")}</option>
                  ))}
                </select>
              </label>
            ))}
            <Button type="submit" variant="outline" className="self-end">Update mapping</Button>
          </form>
          <form action={applyImportAction} className="mt-4 space-y-3">
            <input type="hidden" name="draftId" value={draft.id} />
            {proposal.categories.map((category) => (
              <article key={category.code || category.title} className="rounded-2xl border border-border bg-card p-4">
                <label className="flex items-center gap-2 font-medium">
                  <input type="checkbox" name="include" value={category.code || category.title} defaultChecked={category.include} />
                  {category.title}
                  {category.code ? <span className="text-sm text-muted-foreground">{category.code}</span> : null}
                </label>
                <ul className="mt-2 space-y-2 pl-6 text-sm">
                  {category.subCategories.map((sub) => (
                    <li key={sub.code || sub.title}>
                      <span className="font-medium">{sub.title}</span>
                      {sub.levelTag ? <span className="ml-2 text-muted-foreground">{sub.levelTag}</span> : null}
                      <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                        {sub.lessons.map((lesson) => (
                          <li key={lesson.code || lesson.title}>
                            {lesson.title}
                            {lesson.prerequisiteCodes.length > 0 ? ` · after ${lesson.prerequisiteCodes.join(", ")}` : ""}
                            {lesson.subLessons.length > 0 ? ` · ${lesson.subLessons.map((item) => item.title).join(", ")}` : ""}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
            <Button type="submit" data-testid="import-apply">Apply import</Button>
          </form>
          <p className="mt-3 text-sm">
            <Link href="/admin/review" className="underline decoration-primary/50 underline-offset-4">Review queue</Link>
          </p>
        </section>
      ) : null}
    </div>
  );
}
