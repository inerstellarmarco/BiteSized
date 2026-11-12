"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveSubLessonAction, discardBiteAction, regenerateBiteAction, saveBiteAction, saveQuestionAction } from "@/lib/actions/ai";
import { Button } from "@/components/ui/button";
import type { Choice } from "@/lib/types";

type Question = {
  id: string;
  prompt: string;
  choices: Choice[];
  correctChoiceId: string;
  explanation: string;
  answerKeyStatus: string;
  answerKeyNote: string;
};

type Bite = {
  id: string;
  title: string;
  body: string;
  sourceNote: string;
  styleVersionId: string | null;
  questions: Question[];
};

export function ReviewPanel({ subLessonId, bites }: { subLessonId: string; bites: Bite[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const flagged = bites.reduce((count, bite) => count + bite.questions.filter((question) => question.answerKeyStatus === "flagged").length, 0);

  return (
    <div data-testid="review-page" className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          data-testid="batch-approve"
          onClick={() => {
            void approveSubLessonAction(subLessonId).then((result) => {
              if (result && "error" in result && result.error) setMessage(result.error);
              else {
                setMessage("Approved. Learners can see these bites now.");
                router.refresh();
              }
            });
          }}
        >
          Approve all in this sub-lesson
        </Button>
        {flagged > 0 ? <p className="text-sm text-destructive">{flagged} flagged answer {flagged === 1 ? "key" : "keys"} must be fixed first.</p> : null}
      </div>
      {message ? <p className="text-sm" data-testid="review-message">{message}</p> : null}
      {bites.length === 0 ? <p>Nothing pending in this sub-lesson.</p> : null}
      {bites.map((bite) => (
        <article key={bite.id} className="rounded-2xl border border-border bg-card p-4">
          <form action={saveBiteAction} className="grid gap-2">
            <input type="hidden" name="biteId" value={bite.id} />
            <input name="title" defaultValue={bite.title} className="rounded-lg border border-input bg-background px-3 py-2 font-medium" />
            <textarea name="body" defaultValue={bite.body} className="min-h-28 rounded-lg border border-input bg-background p-3" />
            <p className="text-xs text-muted-foreground">{bite.sourceNote}{bite.styleVersionId ? ` · style ${bite.styleVersionId.slice(0, 8)}` : ""}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="outline" size="sm">Save bite</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => void regenerateBiteAction(bite.id).then(() => router.refresh())}>Regenerate</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => void discardBiteAction(bite.id).then(() => router.refresh())}>Delete</Button>
            </div>
          </form>
          <ul className="mt-4 space-y-3">
            {bite.questions.map((question) => (
              <li key={question.id} className="rounded-xl border border-border p-3">
                <form action={saveQuestionAction} className="grid gap-2">
                  <input type="hidden" name="questionId" value={question.id} />
                  <textarea name="prompt" defaultValue={question.prompt} className="min-h-16 rounded-lg border border-input bg-background p-2 text-sm" />
                  {["a", "b", "c", "d"].map((id) => (
                    <label key={id} className="flex items-center gap-2 text-sm">
                      <input type="radio" name="correctChoiceId" value={id} defaultChecked={question.correctChoiceId === id} />
                      <input name={`choice-${id}`} defaultValue={question.choices.find((choice) => choice.id === id)?.text ?? ""} className="w-full rounded-lg border border-input bg-background px-2 py-1" />
                    </label>
                  ))}
                  <textarea name="explanation" defaultValue={question.explanation} className="min-h-12 rounded-lg border border-input bg-background p-2 text-sm" />
                  <p className={`text-xs ${question.answerKeyStatus === "flagged" ? "text-destructive" : "text-success"}`}>
                    Answer key {question.answerKeyStatus}. {question.answerKeyNote}
                  </p>
                  <Button type="submit" size="sm" variant="outline">Save and re-check</Button>
                </form>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
