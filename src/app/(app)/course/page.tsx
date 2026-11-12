import Link from "next/link";
import { requireProfile } from "@/lib/auth/current";
import { loadCatalog } from "@/lib/content/catalog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getDb } from "@/lib/db";

export default async function CoursePage() {
  const profile = await requireProfile();
  const db = await getDb();
  const catalog = await loadCatalog(db, profile.id);
  if (!catalog) {
    return <p>No course is loaded yet.</p>;
  }

  return (
    <div data-testid="course-tree" className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-4xl leading-tight">{catalog.course.title}</h1>
          <Badge>{catalog.course.aiGenerated ? "AI-generated" : "Hand-written"}</Badge>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{catalog.course.subtitle}</p>
      </div>
      {catalog.categories.map((category) => (
        <details key={category.id} id={category.id} open className="rounded-2xl border border-border bg-card">
          <summary className="cursor-pointer px-4 py-3 font-display text-2xl">{category.title}</summary>
          <div className="space-y-3 px-4 pb-4">
            {category.summary ? <p className="text-sm text-muted-foreground">{category.summary}</p> : null}
            {category.subCategories.map((subCategory) => (
              <details key={subCategory.id} id={subCategory.id} open className="rounded-xl border border-border">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-3">
                  <span className="font-medium">
                    {subCategory.code} {subCategory.title}
                  </span>
                  {subCategory.levelTag ? <Badge>{subCategory.levelTag}</Badge> : null}
                </summary>
                <div className="space-y-3 px-3 pb-3">
                  {subCategory.lessons.map((lesson, lessonIndex) => (
                    <details key={lesson.id} id={lesson.id} open={lessonIndex === 0} className="rounded-lg bg-background/60">
                      <summary className="cursor-pointer px-3 py-2">
                        <span className="text-sm text-muted-foreground">{lesson.code}</span> {lesson.title}
                      </summary>
                      <div className="space-y-2 px-3 pb-3">
                        {lesson.prerequisites.length > 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Helpful earlier: {lesson.prerequisites.map((item) => `${item.code} ${item.title}`).join(" · ")}
                          </p>
                        ) : null}
                        {lesson.subLessons.map((subLesson) => {
                          const ratio = subLesson.biteCount === 0 ? 0 : (subLesson.seenCount / subLesson.biteCount) * 100;
                          return (
                            <div key={subLesson.id} data-testid={`sublesson-${subLesson.id}`} className="rounded-lg border border-border bg-card px-3 py-3">
                              <Link href={`/study/${subLesson.id}`} className="font-medium hover:text-primary">
                                {subLesson.title}
                              </Link>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {subLesson.seenCount} of {subLesson.biteCount} bites · {subLesson.questionCount} questions
                              </p>
                              <Progress className="mt-2" value={ratio} aria-label={`${subLesson.title} progress`} />
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  ))}
                  <details className="rounded-lg bg-background/60">
                    <summary className="cursor-pointer px-3 py-2 font-medium">{subCategory.code} toolkit</summary>
                    <div className="grid gap-3 px-3 pb-3 text-sm md:grid-cols-3">
                      <ToolkitList title="Hands-on projects" items={subCategory.toolkit.handsOnProjects} />
                      <ToolkitList title="Tools and frameworks" items={subCategory.toolkit.toolsAndFrameworks} />
                      <ToolkitList title="Learning outcomes" items={subCategory.toolkit.learningOutcomes} />
                    </div>
                  </details>
                </div>
              </details>
            ))}
          </div>
        </details>
      ))}
      <p className="text-xs text-muted-foreground">
        {catalog.course.author} · {catalog.course.licence}
      </p>
    </div>
  );
}

function ToolkitList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="font-medium">{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
