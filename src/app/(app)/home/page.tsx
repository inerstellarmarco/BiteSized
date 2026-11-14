import Link from "next/link";
import { BookOpen, Flame, RotateCcw, Search, TrendingUp } from "lucide-react";
import { DailyGoalSelector, RevisitListClient } from "@/components/dashboard-controls";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requireProfile } from "@/lib/auth/current";
import { listProfiles } from "@/lib/auth/profiles";
import { titleWithoutCode } from "@/lib/content/catalog";
import { getDb } from "@/lib/db";
import { loadLearnerDashboard } from "@/lib/learner/dashboard";

const TREND_LABELS = {
  up: "Trending up",
  steady: "Steady",
  down: "Needs a refresher",
  none: "No quizzes yet",
} as const;

export default async function HomePage() {
  const profile = await requireProfile();
  const db = await getDb();
  const [dashboard, profiles] = await Promise.all([loadLearnerDashboard(db, profile.id), listProfiles(db)]);
  const admins = profiles.filter((item) => item.isAdmin && !item.archivedAt);
  const catalog = dashboard?.catalog ?? null;
  const next = dashboard?.next ?? null;

  return (
    <div className="space-y-6" data-testid="learner-dashboard">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader eyebrow={`Hello, ${profile.name}`} title="Pick up the next card." />
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/search">
              <Search className="mr-1.5 h-4 w-4" aria-hidden />
              Search
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="/api/progress/export" data-testid="export-my-progress">
              Export my progress
            </a>
          </Button>
        </div>
      </div>

      {profile.isAdmin && admins.length < 2 ? (
        <aside className="rounded-2xl border border-primary/40 bg-secondary px-4 py-3 text-sm">
          {profile.name} is the only admin. Add a second admin so a forgotten PIN is not a crisis.{" "}
          <Link href="/admin" className="underline decoration-primary/50 underline-offset-4">
            Family settings
          </Link>
        </aside>
      ) : null}

      {catalog && next && dashboard ? (
        <>
          <Card>
            <CardHeader>
              <p className="text-sm text-muted-foreground">{next.started ? "Continue" : "Start here"}</p>
              <CardTitle>{next.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {next.lessonCode} · {next.seenCount} of {next.biteCount} bites
              </p>
              <Progress
                className="mt-2"
                value={next.biteCount === 0 ? 0 : (Math.min(next.seenCount, next.biteCount) / next.biteCount) * 100}
                aria-label={`${next.title} progress`}
              />
              {dashboard.nextUnmetPrerequisites.length > 0 ? (
                <p className="mt-3 text-xs text-muted-foreground" data-testid="home-prerequisite-warning">
                  Note: this lesson builds on{" "}
                  {dashboard.nextUnmetPrerequisites.map((item, idx) => (
                    <span key={item.id}>
                      {idx > 0 ? ", " : ""}
                      {item.firstSubLessonId ? (
                        <Link href={`/learn/${item.firstSubLessonId}`} className="underline decoration-primary/60 underline-offset-4">
                          {item.code} {titleWithoutCode(item.code, item.title)}
                        </Link>
                      ) : (
                        <span>
                          {item.code} {titleWithoutCode(item.code, item.title)}
                        </span>
                      )}
                    </span>
                  ))}
                  .
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href={`/learn/${next.id}`} data-testid="continue-learn">
                    {next.started ? "Continue" : "Start"}
                  </Link>
                </Button>
                {dashboard.suggested && dashboard.suggested.id !== next.id ? (
                  <Button asChild variant="outline" size="lg">
                    <Link href={`/learn/${dashboard.suggested.id}`} data-testid="suggested-learn">
                      Suggested next: {dashboard.suggested.lessonCode} {dashboard.suggested.title}
                    </Link>
                  </Button>
                ) : null}
                <Button asChild variant="outline" size="lg">
                  <Link href="/course">Browse the course</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {dashboard.overall.total > 0 ? (
            <div className="grid grid-cols-3 gap-3" data-testid="home-stats">
              <StatTile value={`${dashboard.overall.seen}`} label={`of ${dashboard.overall.total} bites seen (${dashboard.overall.percent}%)`} />
              <StatTile value={`${dashboard.lessonsDone.finished}`} label={`of ${dashboard.lessonsDone.total} sub-lessons finished`} />
              <StatTile
                value={`${dashboard.quizTrend.attemptsCount}`}
                label={dashboard.quizTrend.attemptsCount === 1 ? "quiz taken" : "quizzes taken"}
              />
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            {/* Streak & Daily Goal */}
            <Card data-testid="streak-card">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Flame className="h-5 w-5 text-primary" aria-hidden />
                    Daily goal &amp; streak
                  </CardTitle>
                  <Badge>
                    {dashboard.streak.currentStreak} {dashboard.streak.currentStreak === 1 ? "day" : "days"} streak
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">{dashboard.streak.todayBites}</strong> of{" "}
                  <strong className="text-foreground">{dashboard.streak.goal}</strong> bites seen today
                  {dashboard.streak.goalMetToday ? " · Goal met!" : ""} · Best streak: {dashboard.streak.longestStreak}{" "}
                  {dashboard.streak.longestStreak === 1 ? "day" : "days"}
                </p>
                <Progress
                  value={Math.min(100, Math.round((dashboard.streak.todayBites / dashboard.streak.goal) * 100))}
                  aria-label="Daily bites goal progress"
                />
                <DailyGoalSelector currentGoal={dashboard.streak.goal} />
              </CardContent>
            </Card>

            {/* Spaced Repetition Due Reviews */}
            <Card data-testid="spaced-card">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <RotateCcw className="h-5 w-5 text-primary" aria-hidden />
                    Spaced repetition
                  </CardTitle>
                  <Badge>{dashboard.spaced.due.length} due now</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {dashboard.spaced.due.length > 0
                    ? `${dashboard.spaced.due.length} missed ${dashboard.spaced.due.length === 1 ? "question is" : "questions are"} ready for review today.`
                    : "No missed questions are due right now."}{" "}
                  {dashboard.spaced.upcoming.length > 0
                    ? `${dashboard.spaced.upcoming.length} scheduled across the 1, 3, 7, and 21-day intervals.`
                    : ""}
                </p>
                <Button asChild size="sm" variant={dashboard.spaced.due.length > 0 ? "default" : "outline"}>
                  <Link href="/review" data-testid="open-spaced-review">
                    {dashboard.spaced.due.length > 0 ? `Review ${dashboard.spaced.due.length} due now` : "View review schedule"}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Quiz Scores & Trend + Revisit List */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card data-testid="quiz-trend-card">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <TrendingUp className="h-5 w-5 text-primary" aria-hidden />
                    Quiz scores &amp; trend
                  </CardTitle>
                  <Badge data-testid="quiz-trend-badge">{TREND_LABELS[dashboard.quizTrend.trend]}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {dashboard.quizTrend.attemptsCount === 0 ? (
                  <p className="text-sm text-muted-foreground">Take a quiz after any sub-lesson to see your score history and trend.</p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Average score: <strong className="text-foreground">{dashboard.quizTrend.averagePercent}%</strong> across{" "}
                      {dashboard.quizTrend.attemptsCount} {dashboard.quizTrend.attemptsCount === 1 ? "attempt" : "attempts"}
                      {dashboard.quizTrend.deltaPercent !== 0
                        ? ` (${dashboard.quizTrend.deltaPercent > 0 ? `+${dashboard.quizTrend.deltaPercent}%` : `${dashboard.quizTrend.deltaPercent}%`} recent)`
                        : ""}
                    </p>
                    <ul className="space-y-1.5 text-xs text-muted-foreground">
                      {dashboard.quizTrend.recentAttempts.map((attempt) => (
                        <li key={attempt.id} className="flex items-center justify-between gap-2">
                          <Link href={`/quiz/${attempt.subLessonId}`} className="truncate underline-offset-4 hover:underline">
                            {attempt.lessonCode ? `${attempt.lessonCode} · ` : ""}
                            {attempt.subLessonTitle}
                          </Link>
                          <span className="shrink-0 font-medium text-foreground">
                            {attempt.correctCount}/{attempt.answeredCount} ({attempt.percent}%)
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>

            <Card data-testid="revisit-card">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-xl">Revisit list</CardTitle>
                  <Badge>{dashboard.revisit.length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <RevisitListClient items={dashboard.revisit} />
              </CardContent>
            </Card>
          </div>

          {/* Private Notes on Bites (if any) */}
          {dashboard.notes.length > 0 ? (
            <Card data-testid="notes-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-xl">Your private notes ({dashboard.notes.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {dashboard.notes.slice(0, 6).map((item) => (
                    <li key={item.id} className="rounded-xl border border-border bg-background/60 px-3 py-2">
                      <Link href={`/learn/${item.subLessonId}?bite=${item.biteId}`} className="font-medium underline-offset-4 hover:underline">
                        {item.lessonCode ? `${item.lessonCode} · ` : ""}
                        {item.biteTitle}
                      </Link>
                      <p className="mt-0.5 text-muted-foreground">{item.note}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {/* Progress by Category, Sub-Category, and Lesson */}
          <Card data-testid="progress-breakdown">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Progress by category, module &amp; lesson</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {dashboard.categoriesBreakdown.map((category) => (
                <details key={category.id} className="rounded-xl border border-border bg-background/50 px-4 py-3">
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 font-medium">
                    <span>{category.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {category.seen} of {category.total} bites ({category.percent}%)
                    </span>
                  </summary>
                  <Progress className="mt-2" value={category.percent} aria-label={`${category.title} progress`} />
                  <div className="mt-3 space-y-3 pl-2 text-sm">
                    {category.subCategories.map((subCategory) => (
                      <div key={subCategory.id} className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <a href={`/course#${subCategory.id}`} className="font-medium underline-offset-4 hover:underline">
                            {subCategory.code} {subCategory.title}
                          </a>
                          <span className="text-xs text-muted-foreground">
                            {subCategory.seen}/{subCategory.total} ({subCategory.percent}%)
                          </span>
                        </div>
                        <ul className="grid gap-1 pl-3 text-xs text-muted-foreground sm:grid-cols-2">
                          {subCategory.lessons.map((lesson) => (
                            <li key={lesson.id} className="flex items-center justify-between gap-2">
                              <a href={`/course#${lesson.id}`} className="truncate underline-offset-4 hover:underline">
                                {lesson.code} {lesson.title}
                              </a>
                              <span className="shrink-0">
                                {lesson.seen}/{lesson.total}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </CardContent>
          </Card>
        </>
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
