"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { answerSpacedReviewAction } from "@/lib/actions/phase4";
import { choiceState } from "@/lib/quiz/choice-state";
import { QUESTION_TYPE_LABELS } from "@/lib/quiz/retake";
import { SPACED_INTERVALS_DAYS, type SpacedQuestionItem } from "@/lib/quiz/spaced";
import { cn } from "@/lib/utils";

export function SpacedReviewRunner({
  due: initialDue,
  upcoming,
}: {
  due: SpacedQuestionItem[];
  upcoming: SpacedQuestionItem[];
}) {
  const [queue] = useState<SpacedQuestionItem[]>(initialDue);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{
    correct: boolean;
    correctChoiceId: string;
    explanation: string;
    intervalDays: number | null;
    graduated: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  const current = queue[index];

  async function submitAnswer() {
    if (!current || !selected) return;
    setBusy(true);
    const res = await answerSpacedReviewAction(current.questionId, selected);
    setBusy(false);
    if (!res) return;
    setRevealed({
      correct: res.correct,
      correctChoiceId: res.correctChoiceId,
      explanation: res.explanation,
      intervalDays: res.intervalDays,
      graduated: res.graduated,
    });
    setCompletedCount((prev) => prev + 1);
  }

  function nextQuestion() {
    setSelected(null);
    setRevealed(null);
    setIndex((prev) => prev + 1);
  }

  return (
    <div className="space-y-6" data-testid="spaced-review-page">
      <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Wrong quiz answers enter a <strong className="text-foreground">{SPACED_INTERVALS_DAYS.join(" → ")} day</strong> spaced-repetition schedule. Each right review moves a question to the next interval; a wrong answer resets it to 1 day.
      </div>

      {queue.length === 0 || index >= queue.length ? (
        <Card data-testid="spaced-review-empty">
          <CardHeader>
            <CardTitle>{completedCount > 0 ? "All due reviews finished!" : "No questions due right now"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {completedCount > 0
                ? `You reviewed ${completedCount} ${completedCount === 1 ? "question" : "questions"} today.`
                : "You are caught up on spaced repetition."}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/home">Back to dashboard</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/course">Browse course</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card data-testid="spaced-review-active">
          <CardHeader className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Progress value={((index + (revealed ? 1 : 0)) / queue.length) * 100} aria-label="Spaced review progress" />
              <span className="shrink-0 text-xs text-muted-foreground">
                {index + 1} of {queue.length} due
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground">
                {current.lessonCode} · {current.subLessonTitle} · {current.biteTitle}
              </span>
              <Badge>{QUESTION_TYPE_LABELS[current.type] ?? "Multiple choice"}</Badge>
              <Badge>{current.intervalDays}d stage</Badge>
            </div>
            <CardTitle className="text-2xl leading-snug" data-testid="spaced-review-prompt">
              {current.prompt}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              {current.choices.map((choice) => {
                const state = choiceState(choice.id, selected, revealed);
                return (
                  <button
                    key={choice.id}
                    type="button"
                    data-testid={`spaced-choice-${choice.id}`}
                    disabled={Boolean(revealed) || busy}
                    onClick={() => setSelected(choice.id)}
                    className={cn(
                      "flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                      state === "idle" && "border-border bg-card hover:border-primary/60",
                      state === "picked" && "border-primary bg-secondary",
                      state === "correct" && "border-success bg-success/10 font-medium",
                      state === "wrong-pick" && "border-destructive bg-destructive/10",
                      state === "dimmed" && "border-border bg-card opacity-60",
                    )}
                  >
                    <span>{choice.text}</span>
                    {state === "correct" ? <Check className="h-5 w-5 shrink-0 text-success" aria-hidden /> : null}
                    {state === "wrong-pick" ? <X className="h-5 w-5 shrink-0 text-destructive" aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
            {revealed ? (
              <div
                className={cn(
                  "rounded-xl border px-4 py-3 text-sm",
                  revealed.correct ? "border-success bg-success/10" : "border-destructive bg-destructive/10",
                )}
                data-testid="spaced-review-feedback"
              >
                <p>
                  <strong className={revealed.correct ? "text-success" : "text-destructive"}>
                    {revealed.correct ? "Right." : "Not this time."}
                  </strong>{" "}
                  {revealed.explanation}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {revealed.graduated
                    ? "Graduated! You completed the 21-day review."
                    : `Next review in ${revealed.intervalDays ?? 1} ${(revealed.intervalDays ?? 1) === 1 ? "day" : "days"}.`}
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3">
              {!revealed ? (
                <Button data-testid="spaced-review-answer" disabled={!selected || busy} onClick={() => void submitAnswer()}>
                  {busy ? "Checking…" : "Check answer"}
                </Button>
              ) : (
                <Button data-testid="spaced-review-next" onClick={nextQuestion}>
                  {index + 1 >= queue.length ? "Finish review" : "Next due question"}
                </Button>
              )}
              <Button asChild variant="ghost">
                <Link href={`/learn/${current.subLessonId}?bite=${current.biteId}`}>Open bite card</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {upcoming.length > 0 ? (
        <section className="space-y-3" data-testid="spaced-review-upcoming">
          <h2 className="font-display text-2xl">Scheduled for later ({upcoming.length})</h2>
          <ul className="space-y-2">
            {upcoming.map((item) => (
              <li
                key={item.questionId}
                className="flex flex-col justify-between gap-2 rounded-2xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.prompt}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.lessonCode} · {item.subLessonTitle} · Stage {item.stage + 1} ({item.intervalDays}d interval)
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  Due {new Date(item.dueAt).toLocaleDateString("en-GB", { month: "short", day: "numeric" })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
