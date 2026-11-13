"use client";

import Link from "next/link";
import { useState } from "react";
import { finishQuizAction, gradeChoiceAction } from "@/lib/actions";
import { addStyleExampleAction, flagAction, toggleHeartAction } from "@/lib/actions/phase3";
import { Button } from "@/components/ui/button";
import { PopMenu, PopMenuItem } from "@/components/ui/menu";
import { Progress } from "@/components/ui/progress";
import { choiceState } from "@/lib/quiz/choice-state";
import { SCORE_HEADLINES, scoreTone } from "@/lib/quiz/score-tone";
import { cn } from "@/lib/utils";
import { Check, Heart, MoreHorizontal, Trophy, X } from "lucide-react";
import type { Choice } from "@/lib/types";

type Question = { id: string; prompt: string; choices: Choice[]; biteTitle: string };
type Answer = { questionId: string; selectedChoiceId: string | null };
type Result = {
  correct: number;
  answered: number;
  total: number;
  stoppedEarly: boolean;
  explanations: { id: string; prompt: string; explanation: string }[];
};

export function QuizRunner({
  subLessonId,
  title,
  lessonCode,
  questions,
  skipped,
  nextHref,
  nextTitle,
  isAdmin = false,
}: {
  subLessonId: string;
  title: string;
  lessonCode: string;
  questions: Question[];
  skipped: number;
  nextHref: string | null;
  nextTitle: string | null;
  isAdmin?: boolean;
}) {
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ correct: boolean; explanation: string; correctChoiceId: string } | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [hearted, setHearted] = useState<Record<string, boolean>>({});
  const question = questions[index];

  async function finish(finalAnswers: Answer[], stoppedEarly: boolean) {
    setBusy(true);
    setError(null);
    const saved = await finishQuizAction({ subLessonId, answers: finalAnswers, stoppedEarly });
    setBusy(false);
    if (!saved) {
      setError("The score could not be saved. Check that you are still signed in.");
      return;
    }
    setResult(saved);
  }

  async function reveal() {
    if (!question || !selected) return;
    setBusy(true);
    const graded = await gradeChoiceAction(question.id, selected);
    setBusy(false);
    if (!graded) {
      setError("That answer could not be checked.");
      return;
    }
    setRevealed(graded);
  }

  function commitAndAdvance() {
    if (!question || !selected) return;
    const nextAnswers = [...answers, { questionId: question.id, selectedChoiceId: selected }];
    setAnswers(nextAnswers);
    setSelected(null);
    setRevealed(null);
    setNote(null);
    if (index + 1 >= questions.length) {
      void finish(nextAnswers, false);
      return;
    }
    setIndex(index + 1);
  }

  if (questions.length === 0) {
    return <p>This sub-lesson has no multiple-choice questions yet.</p>;
  }

  if (result) {
    const tone = scoreTone(result.correct, result.answered);
    const percent = result.answered === 0 ? 0 : Math.round((result.correct / result.answered) * 100);
    return (
      <section data-testid="quiz-result" className="mx-auto max-w-xl">
        <div
          className={cn(
            "card-rise rounded-2xl border p-6 text-center",
            tone === "perfect" && "border-success bg-success/10",
            tone === "strong" && "border-primary/50 bg-secondary",
            (tone === "keep-going" || tone === "none") && "border-border bg-card",
          )}
        >
          <p className="text-sm text-muted-foreground">
            {lessonCode} · {title}
          </p>
          <div
            className={cn(
              "mx-auto mt-4 flex h-28 w-28 flex-col items-center justify-center rounded-full border-4",
              tone === "perfect" ? "border-success text-success" : tone === "strong" ? "border-primary text-primary" : "border-border text-foreground",
            )}
          >
            {tone === "perfect" ? <Trophy className="mb-1 h-5 w-5" aria-hidden /> : null}
            <h1 className="font-display text-3xl leading-none">
              <span data-testid="quiz-score">
                {result.correct} of {result.answered}
              </span>
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">{percent}%</p>
          </div>
          <p className="mt-4 text-lg font-medium">{SCORE_HEADLINES[tone]}</p>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          {result.stoppedEarly
            ? `You stopped early. ${result.total - result.answered} ${result.total - result.answered === 1 ? "question was" : "questions were"} left in this sub-lesson.`
            : `You answered every question in this sub-lesson (${result.total}).`}
        </p>
        {result.explanations.length > 0 ? (
          <ul className="mt-6 space-y-3">
            <li className="text-sm font-medium">To look at again</li>
            {result.explanations.map((item) => (
              <li key={item.id} className="rounded-xl border border-l-4 border-border border-l-destructive bg-card p-4">
                <p className="font-medium">{item.prompt}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.explanation}</p>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          {nextHref && nextTitle ? (
            <Button asChild size="lg">
              <Link href={nextHref} data-testid="quiz-next-sublesson">
                Next sub-lesson: {nextTitle}
              </Link>
            </Button>
          ) : (
            <Button asChild size="lg">
              <Link href="/course">Back to the course</Link>
            </Button>
          )}
          <Button asChild variant="outline" size="lg">
            <Link href={`/learn/${subLessonId}`}>Review the cards</Link>
          </Button>
        </div>
      </section>
    );
  }

  if (!started) {
    return (
      <section className="mx-auto max-w-xl">
        <p className="text-sm text-muted-foreground">{lessonCode}</p>
        <h1 className="font-display text-3xl md:text-4xl leading-tight">{title}</h1>
        <p className="mt-3 text-lg">
          {questions.length} multiple-choice {questions.length === 1 ? "question" : "questions"}. You can stop early and keep the score for what you answered.
        </p>
        {skipped > 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {skipped} {skipped === 1 ? "question uses" : "questions use"} a type that arrives in a later phase, so {skipped === 1 ? "it is" : "they are"} not in this quiz.
          </p>
        ) : null}
        <Button className="mt-6" data-testid="quiz-start" onClick={() => setStarted(true)}>
          Start quiz
        </Button>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <Progress value={((index + (revealed ? 1 : 0)) / questions.length) * 100} aria-label="Quiz progress" />
        <p className="shrink-0 text-sm text-muted-foreground">
          {index + 1} of {questions.length}
        </p>
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{question.biteTitle}</p>
          <h1 className="mt-1 max-w-2xl font-display text-3xl leading-tight" data-testid="quiz-prompt">
            {question.prompt}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-1 pt-1">
          <div className="relative">
            <button
              type="button"
              data-testid="question-tools"
              aria-haspopup="menu"
              aria-expanded={toolsOpen}
              aria-label="More actions for this question"
              title="More actions"
              onClick={() => setToolsOpen((open) => !open)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden />
            </button>
            <PopMenu open={toolsOpen} onClose={() => setToolsOpen(false)}>
              <PopMenuItem onClick={() => { setToolsOpen(false); void flagAction("question", question.id, "revisit").then((r) => setNote(r.message)); }}>Revisit later</PopMenuItem>
              <PopMenuItem onClick={() => { setToolsOpen(false); void flagAction("question", question.id, "rework").then((r) => setNote(r.message)); }}>Flag for rework</PopMenuItem>
              <PopMenuItem onClick={() => { setToolsOpen(false); void flagAction("question", question.id, "error").then((r) => setNote(r.message)); }}>Report an error</PopMenuItem>
              {isAdmin ? (
                <PopMenuItem onClick={() => { setToolsOpen(false); void addStyleExampleAction("question", question.id).then((r) => setNote(r.ok ? "Added to style examples." : r.error)); }}>
                  Use as style example
                </PopMenuItem>
              ) : null}
            </PopMenu>
          </div>
          <button
            type="button"
            aria-pressed={hearted[question.id] ?? false}
            aria-label={hearted[question.id] ? "Remove heart from this question" : "Heart this question"}
            title={hearted[question.id] ? "Remove heart" : "Heart this question"}
            onClick={async () => {
              const result = await toggleHeartAction("question", question.id);
              setHearted((previous) => ({ ...previous, [question.id]: result.hearted }));
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Heart className={cn("h-5 w-5", hearted[question.id] && "fill-red-500 text-red-500")} aria-hidden />
          </button>
        </div>
      </div>
      <div className="mt-5 grid gap-2">
        {question.choices.map((choice) => {
          const state = choiceState(choice.id, selected, revealed);
          return (
            <button
              key={choice.id}
              type="button"
              data-testid={`quiz-choice-${choice.id}`}
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
            "mt-4 flex items-start gap-2 rounded-xl border px-4 py-3",
            revealed.correct ? "border-success bg-success/10" : "border-destructive bg-destructive/10",
          )}
          data-testid="quiz-feedback"
        >
          {revealed.correct ? <Check className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden /> : <X className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />}
          <p className="text-sm">
            <span className={cn("font-semibold", revealed.correct ? "text-success" : "text-destructive")}>
              {revealed.correct ? "Right." : "Not this time."}
            </span>{" "}
            {revealed.explanation}
          </p>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {note ? <p className="mt-3 text-sm text-muted-foreground">{note}</p> : null}
      <div className="mt-6 flex flex-wrap gap-3">
        {!revealed ? (
          <Button data-testid="quiz-answer" disabled={!selected || busy} onClick={() => void reveal()}>
            {busy ? "Checking…" : "Answer"}
          </Button>
        ) : (
          <Button data-testid="quiz-next" onClick={commitAndAdvance}>
            {index + 1 >= questions.length ? "See score" : "Next question"}
          </Button>
        )}
        <Button
          variant="ghost"
          data-testid="quiz-stop"
          disabled={busy}
          onClick={() => {
            const soFar = revealed && selected && question ? [...answers, { questionId: question.id, selectedChoiceId: selected }] : answers;
            void finish(soFar, true);
          }}
        >
          Stop and score
        </Button>
      </div>
    </section>
  );
}
