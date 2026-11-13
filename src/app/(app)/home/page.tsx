import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireProfile } from "@/lib/auth/current";
import { listProfiles } from "@/lib/auth/profiles";
import { continueFor, loadCatalog } from "@/lib/content/catalog";
import { finishedCount, summarizeProgress } from "@/lib/content/course-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { quizAttempts } from "@/lib/db/schema";
import { BookOpen } from "lucide-react";
import { getDb } from "@/lib/db";

export default async function HomePage() {
  const profile = await requireProfile();
  const db = await getDb();
  const catalog = await loadCatalog(db, profile.id);
  const profiles = await listProfiles(db);
  const admins = profiles.filter((item) => item.isAdmin && !item.archivedAt);
  const next = catalog ? await continueFor(db, profile.id, catalog) : null;
  const attempts = catalog ? await db.select({ id: quizAttempts.id }).from(quizAttempts).where(eq(quizAttempts.profileId, profile.id)) : [];

  const allSubLessons = catalog
    ? catalog.categories.flatMap((category) => category.subCategories.flatMap((subCategory) => subCategory.lessons.flatMap((lesson) => lesson.subLessons)))
    : [];
  const overall = summarizeProgress(allSubLessons);
  const lessonsDone = finishedCount(allSubLessons);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`Hello, ${profile.name}`} title="Pick up the next card." />
      {profile.isAdmin && admins.length < 2 ? (
        <aside className="rounded-2xl border border-primary/40 bg-secondary px-4 py-3 text-sm">
          {profile.name} is the only admin. Add a second admin so a forgotten PIN is not a crisis.{" "}
          <Link href="/admin" className="underline decoration-primary/50 underline-offset-4">
            Family settings
          </Link>
        </aside>
      ) : null}
      {catalog && next ? (
        <Card>
          <CardHeader>
            <p className="text-sm text-muted-foreground">{next.started ? "Continue" : "Start here"}</p>
            <CardTitle>{next.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {next.lessonCode} · {next.seenCount} of {next.biteCount} bites
            </p>
            <Progress className="mt-2" value={next.biteCount === 0 ? 0 : (Math.min(next.seenCount, next.biteCount) / next.biteCount) * 100} aria-label={`${next.title} progress`} />
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href={`/learn/${next.id}`} data-testid="continue-learn">
                  {next.started ? "Continue" : "Start"}
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/course">Browse the course</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={<BookOpen className="h-6 w-6" aria-hidden />}
          title="No course is loaded yet"
          body={profile.isAdmin ? "Import a course outline or package to start learning." : "Ask an admin to import a course."}
          action={
            profile.isAdmin ? (
              <Button asChild>
                <Link href="/admin/import">Import a Google Doc</Link>
              </Button>
            ) : undefined
          }
        />
      )}
      {catalog && overall.total > 0 ? (
        <div className="grid grid-cols-3 gap-3" data-testid="home-stats">
          <StatTile value={`${overall.seen}`} label={`of ${overall.total} bites seen`} />
          <StatTile value={`${lessonsDone.finished}`} label={`of ${lessonsDone.total} sub-lessons finished`} />
          <StatTile value={`${attempts.length}`} label={attempts.length === 1 ? "quiz taken" : "quizzes taken"} />
        </div>
      ) : null}
      {catalog ? (
        <section>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-2xl">{catalog.course.title}</h2>
            <Badge>{catalog.course.aiGenerated ? "AI-generated" : "Hand-written"}</Badge>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{catalog.course.description}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {catalog.course.author} · {catalog.course.licence}
          </p>
        </section>
      ) : null}
    </div>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 text-center">
      <p className="font-display text-2xl text-primary">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
