"use client";

import Link from "next/link";
import { useState } from "react";
import { finishQuizAction, gradeChoiceAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
}: {
  subLessonId: string;
  title: string;
  lessonCode: string;
  questions: Question[];
  skipped: number;
  nextHref: string | null;
  nextTitle: string | null;
}) {
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ correct: boolean; explanation: string; correctChoiceId: string } | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    const perfect = result.correct === result.answered && result.answered > 0;
    return (
      <section data-testid="quiz-result" className="mx-auto max-w-xl">
        <p className="text-sm text-muted-foreground">{lessonCode}</p>
        <h1 className="font-display text-4xl leading-tight">
          <span data-testid="quiz-score">
            {result.correct} of {result.answered}
          </span>
        </h1>
        <p className="mt-2 text-lg">{perfect ? "Every answer you gave was right." : "Here is how this attempt landed."}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {result.stoppedEarly
            ? `You stopped early. ${result.total - result.answered} ${result.total - result.answered === 1 ? "question was" : "questions were"} left in this sub-lesson.`
            : `You answered every question in this sub-lesson (${result.total}).`}
        </p>
        {result.explanations.length > 0 ? (
          <ul className="mt-6 space-y-3">
            {result.explanations.map((item) => (
              <li key={item.id} className="rounded-xl border border-border bg-card p-4">
                <p className="font-medium">{item.prompt}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.explanation}</p>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          {nextHref && nextTitle ? (
            <Button asChild>
              <Link href={nextHref} data-testid="quiz-next-sublesson">
                Next sub-lesson: {nextTitle}
              </Link>
            </Button>
          ) : (
            <Button asChild>
              <Link href="/course">Back to the course</Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href="/course">Course tree</Link>
          </Button>
        </div>
      </section>
    );
  }

  if (!started) {
    return (
      <section className="mx-auto max-w-xl">
        <p className="text-sm text-muted-foreground">{lessonCode}</p>
        <h1 className="font-display text-4xl leading-tight">{title}</h1>
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
      <p className="text-sm text-muted-foreground">{question.biteTitle}</p>
      <h1 className="mt-1 max-w-2xl font-display text-3xl leading-tight" data-testid="quiz-prompt">
        {question.prompt}
      </h1>
      <div className="mt-5 grid gap-2">
        {question.choices.map((choice) => {
          const picked = selected === choice.id;
          const show = Boolean(revealed);
          const isCorrect = revealed?.correctChoiceId === choice.id;
          return (
            <button
              key={choice.id}
              type="button"
              data-testid={`quiz-choice-${choice.id}`}
              disabled={show || busy}
              onClick={() => setSelected(choice.id)}
              className={`rounded-xl border px-4 py-3 text-left ${picked ? "border-primary bg-secondary" : "border-border bg-card"} ${show && isCorrect ? "border-success" : ""}`}
            >
              {choice.text}
            </button>
          );
        })}
      </div>
      {revealed ? (
        <p className={`mt-4 text-sm ${revealed.correct ? "text-success" : "text-destructive"}`} data-testid="quiz-feedback">
          {revealed.correct ? "Right." : "Not this time."} {revealed.explanation}
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
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
