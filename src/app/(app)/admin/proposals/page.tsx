import { asc, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/current";
import { approvePlacementAction } from "@/lib/actions/phase3";
import { AdminNav } from "@/components/admin-nav";
import { Button } from "@/components/ui/button";
import { lessons, subLessonProposals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";

export default async function ProposalsPage() {
  const profile = await requireProfile();
  if (!profile.isAdmin) redirect("/home");
  const db = await getDb();
  const pending = await db.select().from(subLessonProposals).where(eq(subLessonProposals.status, "pending"));
  const lessonRows = await db.select().from(lessons).where(isNull(lessons.archivedAt)).orderBy(asc(lessons.position));
  return (
    <div className="mx-auto max-w-2xl" data-testid="placement-approval">
      <AdminNav current="/admin/proposals" />
      <h1 className="font-display text-3xl md:text-4xl">Placement</h1>
      <p className="mt-1 text-sm text-muted-foreground">Confirm where a proposed sub-lesson belongs. Generation then waits in Review until you approve the bites.</p>
      {pending.length === 0 ? <p className="mt-6">No proposals waiting.</p> : null}
      <ul className="mt-4 space-y-4">
        {pending.map((proposal) => (
          <li key={proposal.id} className="rounded-2xl border border-border bg-card p-4">
            <p className="font-medium">{proposal.title}</p>
            {proposal.notes ? <p className="mt-1 text-sm text-muted-foreground">{proposal.notes}</p> : null}
            <p className="mt-2 text-sm">{proposal.suggestedReason}</p>
            <form action={approvePlacementAction} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="proposalId" value={proposal.id} />
              <label className="text-sm">
                Lesson
                <select name="lessonId" defaultValue={proposal.suggestedLessonId ?? ""} className="mt-1 block rounded-lg border border-input bg-background px-2 py-2" data-testid="placement-lesson">
                  {lessonRows.map((lesson) => (
                    <option key={lesson.id} value={lesson.id}>{lesson.code} {lesson.title}</option>
                  ))}
                </select>
              </label>
              <Button type="submit" data-testid="approve-placement">Approve placement</Button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
