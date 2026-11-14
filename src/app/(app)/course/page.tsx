import Link from "next/link";
import { BookOpen, Search } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { requireProfile } from "@/lib/auth/current";
import { loadCatalog, titleWithoutCode, type CatalogCategory, type CatalogSubCategory, type CourseCatalog } from "@/lib/content/catalog";
import { summarizeProgress } from "@/lib/content/course-progress";
import { suggestedNextSubLesson, unmetPrerequisites } from "@/lib/content/prerequisites";
import { getDb } from "@/lib/db";

export default async function CoursePage() {
  const profile = await requireProfile();
  const db = await getDb();
  const catalog = await loadCatalog(db, profile.id);
  if (!catalog) {
    return (
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
    );
  }

  const allSubLessons = catalog.categories.flatMap((category) =>
    category.subCategories.flatMap((subCategory) => subCategory.lessons.flatMap((lesson) => lesson.subLessons)),
  );
  const overall = summarizeProgress(allSubLessons);
  const suggested = suggestedNextSubLesson(catalog);

  return (
    <div data-testid="course-tree" className="space-y-8">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge>{catalog.course.aiGenerated ? "AI-generated" : "Hand-written"}</Badge>
          <Button asChild variant="outline" size="sm">
            <Link href="/propose">Propose a sub-lesson</Link>
          </Button>
        </div>
        <div>
          <h1 className="font-display text-3xl leading-tight md:text-4xl">{catalog.course.title}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{catalog.course.subtitle}</p>
        </div>
        <form action="/search" method="get" className="flex max-w-md gap-2">
          <Input name="q" type="search" placeholder="Search bites, lessons, or your notes…" aria-label="Search course" />
          <Button type="submit" variant="outline">
            <Search className="mr-1.5 h-4 w-4" aria-hidden />
            Search
          </Button>
        </form>
        <Card>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Your progress</p>
              <p className="font-display text-2xl">
                {overall.total === 0 ? "Nothing to study yet" : `${overall.seen} of ${overall.total} bites seen`}
              </p>
              {suggested ? (
                <p className="mt-1 text-xs text-muted-foreground" data-testid="suggested-path">
                  Suggested next step:{" "}
                  <Link href={`/learn/${suggested.id}`} className="underline decoration-primary/60 underline-offset-4">
                    {suggested.lessonCode} · {suggested.title}
                  </Link>
                </p>
              ) : null}
            </div>
            <Progress className="sm:w-64" value={overall.percent} aria-label="Overall course progress" />
          </CardContent>
        </Card>
      </header>

      <nav aria-label="Course sections">
        <p className="mb-3 text-sm font-medium text-muted-foreground">Jump to a section</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {catalog.categories.map((category) => {
            const summary = summarizeProgress(categorySubLessons(category));
            return (
              <li key={category.id}>
                <a
                  href={`#${category.id}`}
                  className="block rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-display text-xl leading-tight">{category.title}</span>
                    <span aria-hidden className="text-primary">→</span>
                  </div>
                  {category.summary ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{category.summary}</p> : null}
                  <Progress className="mt-3" value={summary.percent} aria-label={`${category.title} progress`} />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {summary.total === 0 ? "Coming soon" : `${summary.seen} of ${summary.total} bites`}
                  </p>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      {catalog.categories.map((category) => (
        <section key={category.id} id={category.id} className="scroll-mt-24 space-y-5">
          <div className="border-b border-border pb-2">
            <h2 className="font-display text-3xl">{category.title}</h2>
            {category.summary ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{category.summary}</p> : null}
          </div>
          {category.subCategories.map((subCategory) => (
            <SubCategorySection key={subCategory.id} subCategory={subCategory} catalog={catalog} />
          ))}
        </section>
      ))}

      <p className="text-xs text-muted-foreground">
        {catalog.course.author} · {catalog.course.licence}
      </p>
    </div>
  );
}

function categorySubLessons(category: CatalogCategory) {
  return category.subCategories.flatMap((subCategory) => subCategory.lessons.flatMap((lesson) => lesson.subLessons));
}

function SubCategorySection({ subCategory, catalog }: { subCategory: CatalogSubCategory; catalog: CourseCatalog }) {
  return (
    <div id={subCategory.id} className="scroll-mt-24 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-2xl">
          <span className="text-muted-foreground">{subCategory.code}</span> {titleWithoutCode(subCategory.code, subCategory.title)}
        </h3>
        {subCategory.levelTag ? <Badge>{subCategory.levelTag}</Badge> : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {subCategory.lessons.map((lesson) => {
          const comingSoon = lesson.subLessons.every((item) => item.biteCount === 0);
          const unmet = unmetPrerequisites(catalog, lesson.id);
          return (
            <Card key={lesson.id} id={lesson.id} className="scroll-mt-24">
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{lesson.code}</span>
                  {comingSoon ? <Badge>Coming soon</Badge> : null}
                  {unmet.length > 0 ? (
                    <Badge data-testid={`prereq-unmet-${lesson.id}`}>
                      Learn {unmet.map((item) => item.code).join(", ")} first
                    </Badge>
                  ) : null}
                </div>
                <h4 className="font-display text-xl leading-snug">{titleWithoutCode(lesson.code, lesson.title)}</h4>
                {lesson.prerequisites.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Helpful earlier:{" "}
                    {lesson.prerequisites.map((item, idx) => (
                      <span key={item.id}>
                        {idx > 0 ? " · " : ""}
                        <a href={`#${item.id}`} className="underline decoration-primary/50 underline-offset-4">
                          {item.code} {titleWithoutCode(item.code, item.title)}
                        </a>
                      </span>
                    ))}
                  </p>
                ) : null}
                <ul className="space-y-2">
                  {lesson.subLessons.map((subLesson) => (
                    <SubLessonRow key={subLesson.id} subLesson={subLesson} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <details className="rounded-2xl border border-border bg-card/60 px-4 py-3">
        <summary className="cursor-pointer font-medium">{subCategory.code} toolkit</summary>
        <div className="mt-3 grid gap-4 text-sm md:grid-cols-3">
          <ToolkitList title="Hands-on projects" items={subCategory.toolkit.handsOnProjects} />
          <ToolkitList title="Tools and frameworks" items={subCategory.toolkit.toolsAndFrameworks} />
          <ToolkitList title="Learning outcomes" items={subCategory.toolkit.learningOutcomes} />
        </div>
      </details>
    </div>
  );
}

type SubLessonRowData = {
  id: string;
  label: string;
  title: string;
  seenCount: number;
  biteCount: number;
  questionCount: number;
};

function SubLessonRow({ subLesson }: { subLesson: SubLessonRowData }) {
  if (subLesson.biteCount === 0) {
    return (
      <li data-testid={`sublesson-${subLesson.id}`} className="rounded-xl border border-dashed border-border px-3 py-3 text-muted-foreground">
        <span className="text-xs">{subLesson.label}</span> <span className="font-medium">{subLesson.title}</span>
        <span className="ml-2">
          <Badge>Coming soon</Badge>
        </span>
      </li>
    );
  }
  const progress = summarizeProgress([subLesson]);
  const label = progress.status === "not-started" ? "Start" : progress.status === "complete" ? "Review" : "Continue";
  return (
    <li data-testid={`sublesson-${subLesson.id}`} className="flex flex-col gap-2 rounded-xl border border-border bg-background/60 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">
          <span className="mr-1">{subLesson.label}</span>
          {subLesson.title}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {subLesson.seenCount} of {subLesson.biteCount} bites · {subLesson.questionCount} questions
        </p>
        <Progress className="mt-2" value={progress.percent} aria-label={`${subLesson.title} progress`} />
      </div>
      <Button asChild size="sm" variant={progress.status === "not-started" ? "default" : "outline"}>
        <Link href={`/learn/${subLesson.id}`} aria-label={`${label} ${subLesson.title}`}>
          {label}
        </Link>
      </Button>
    </li>
  );
}

function ToolkitList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h5 className="font-medium">{title}</h5>
      <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
