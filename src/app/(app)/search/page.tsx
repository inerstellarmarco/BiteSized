import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireProfile } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { searchCourse } from "@/lib/learner/search";

const KIND_LABELS: Record<string, string> = {
  note: "Your note",
  bite: "Bite card",
  "sub-lesson": "Sub-lesson",
  lesson: "Lesson",
  module: "Module",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const profile = await requireProfile();
  const params = searchParams ? await searchParams : {};
  const query = (params.q ?? "").trim();
  const db = await getDb();
  const results = query ? await searchCourse(db, { query, profileId: profile.id }) : [];

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="search-page">
      <PageHeader
        eyebrow="Search"
        title="Find a card, lesson, or note."
        description="Searches across bites, sub-lessons, modules, and your private notes."
      />
      <form action="/search" method="get" className="flex gap-2">
        <Input
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Search topics, code concepts, or your notes…"
          aria-label="Search the course"
          data-testid="search-input"
          className="flex-1"
        />
        <Button type="submit" data-testid="search-submit">
          Search
        </Button>
      </form>

      {query ? (
        results.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="search-empty">
            No matches for “{query}”. Try a shorter word or a module code like A1.2.
          </p>
        ) : (
          <div className="space-y-3" data-testid="search-results">
            <p className="text-xs text-muted-foreground">
              {results.length} {results.length === 1 ? "match" : "matches"} for “{query}”
            </p>
            <ul className="space-y-3">
              {results.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="block rounded-2xl border border-border bg-card p-4 transition hover:border-primary/50 hover:shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-display text-xl leading-snug">{item.title}</span>
                      <Badge>{KIND_LABELS[item.kind] ?? item.kind}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.subtitle}</p>
                    {item.snippet ? <p className="mt-2 text-sm text-muted-foreground">{item.snippet}</p> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}
    </div>
  );
}
