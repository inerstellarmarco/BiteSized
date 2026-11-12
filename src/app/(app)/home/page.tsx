import Link from "next/link";
import { requireProfile } from "@/lib/auth/current";
import { listProfiles } from "@/lib/auth/profiles";
import { continueFor, loadCatalog } from "@/lib/content/catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/lib/db";

export default async function HomePage() {
  const profile = await requireProfile();
  const db = await getDb();
  const catalog = await loadCatalog(db, profile.id);
  const profiles = await listProfiles(db);
  const admins = profiles.filter((item) => item.isAdmin && !item.archivedAt);
  const next = catalog ? await continueFor(db, profile.id, catalog) : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Hello, {profile.name}</p>
        <h1 className="font-display text-4xl leading-tight">Pick up the next card.</h1>
      </div>
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
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild>
                <Link href={`/learn/${next.id}`} data-testid="continue-learn">
                  {next.started ? "Continue" : "Start"}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/course">Browse the course</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <p>No course is loaded yet.</p>
      )}
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
