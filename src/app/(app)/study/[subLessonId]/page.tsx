import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { requireProfile } from "@/lib/auth/current";
import { flattenSubLessons, loadCatalog, titleWithoutCode } from "@/lib/content/catalog";
import { unmetPrerequisites } from "@/lib/content/prerequisites";
import { getDb } from "@/lib/db";
import { subLessonAttemptHistory } from "@/lib/quiz/attempts";

export default async function StudyPage({ params }: { params: Promise<{ subLessonId: string }> }) {
  const { subLessonId } = await params;
  const profile = await requireProfile();
  const db = await getDb();
  const catalog = await loadCatalog(db, profile.id);
  const subLesson = catalog ? flattenSubLessons(catalog).find((item) => item.id === subLessonId) : undefined;
  if (!catalog || !subLesson) notFound();
  const ratio = subLesson.biteCount === 0 ? 0 : (subLesson.seenCount / subLesson.biteCount) * 100;
  const unmet = unmetPrerequisites(catalog, subLesson.lessonId);
  const history = await subLessonAttemptHistory(db, profile.id, subLessonId);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <p className="text-sm text-muted-foreground">
        {subLesson.lessonCode} · {subLesson.lessonTitle}
      </p>
      <h1 className="font-display text-3xl md:text-4xl leading-tight">{subLesson.title}</h1>
      <p className="text-sm text-muted-foreground">
        {subLesson.seenCount} of {subLesson.biteCount} bites read · {subLesson.questionCount} quiz questions
      </p>
      <Progress value={ratio} aria-label="Sub-lesson progress" />
      {unmet.length > 0 ? (
        <aside
          data-testid="prerequisite-warning"
          className="rounded-2xl border border-primary/40 bg-secondary px-4 py-3 text-sm"
        >
          <p className="font-medium">Suggested earlier reading</p>
          <p className="mt-1 text-muted-foreground">
            This lesson builds on{" "}
            {unmet.map((item, idx) => (
              <span key={item.id}>
                {idx > 0 ? ", " : ""}
                {item.firstSubLessonId ? (
                  <Link href={`/learn/${item.firstSubLessonId}`} className="underline decoration-primary/60 underline-offset-4">
                    {item.code} {titleWithoutCode(item.code, item.title)} ({item.seen}/{item.total} bites)
                  </Link>
                ) : (
                  <span>
                    {item.code} {titleWithoutCode(item.code, item.title)}
                  </span>
                )}
              </span>
            ))}
            . You can still study this sub-lesson now if you prefer.
          </p>
        </aside>
      ) : null}
      {subLesson.biteCount === 0 ? (
        <div className="space-y-3 rounded-2xl border border-dashed border-border bg-card p-4">
          <p className="font-medium">Coming soon</p>
          <p className="text-sm text-muted-foreground">This lesson is in the outline but has no content yet.</p>
          <Button asChild variant="outline">
            <Link href="/course">Back to the course</Link>
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Learn and quiz are separate. Opening the cards does not start a quiz.</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href={`/learn/${subLesson.id}`}>Learn</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/quiz/${subLesson.id}`}>{history.length > 0 ? "Retake quiz" : "Quiz"}</Link>
            </Button>
          </div>
          {history.length > 0 ? (
            <section className="rounded-2xl border border-border bg-card p-4" data-testid="study-score-history">
              <h2 className="text-sm font-medium">Past quiz attempts ({history.length})</h2>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {history.slice(0, 5).map((attempt, index) => (
                  <li key={attempt.id}>
                    Attempt {history.length - index}: {attempt.correctCount} of {attempt.answeredCount} ({attempt.percent}%)
                    {attempt.stoppedEarly ? " · stopped early" : ""}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
