import { asc, eq, isNull } from "drizzle-orm";
import { requireProfile } from "@/lib/auth/current";
import { proposeSubLessonAction } from "@/lib/actions/phase3";
import { ProposeForm } from "@/components/propose-form";
import { lessons, subLessonProposals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";

export default async function ProposePage() {
  const profile = await requireProfile();
  const db = await getDb();
  const mine = await db.select().from(subLessonProposals).where(eq(subLessonProposals.profileId, profile.id));
  const lessonRows = await db.select().from(lessons).where(isNull(lessons.archivedAt)).orderBy(asc(lessons.position));
  const titles = new Map(lessonRows.map((lesson) => [lesson.id, `${lesson.code} ${lesson.title}`]));
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-4xl">Propose a sub-lesson</h1>
      <p className="mt-1 text-sm text-muted-foreground">Suggest a title and any notes. The AI picks a place in the tree. An admin confirms it before anyone studies it.</p>
      <div className="mt-6">
        <ProposeForm action={proposeSubLessonAction} />
      </div>
      <ul className="mt-6 space-y-2 text-sm">
        {mine.map((proposal) => (
          <li key={proposal.id} className="rounded-xl border border-border bg-card px-3 py-2">
            <span className="font-medium">{proposal.title}</span>
            <span className="mt-1 block text-muted-foreground">
              {proposal.status} · {titles.get(proposal.suggestedLessonId ?? "") ?? "No suggestion yet"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
