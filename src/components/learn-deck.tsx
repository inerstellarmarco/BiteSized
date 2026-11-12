"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { markSeenAction } from "@/lib/actions";
import { Diagram } from "@/components/diagram";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatReviewed } from "@/lib/utils";

export type LearnBite = {
  id: string;
  title: string;
  body: string;
  sourceNote: string;
  lastReviewedOn: string | null;
  diagram: string | null;
  crossLinks: { id: string; label: string; targetCode: string; href: string | null }[];
};

export function LearnDeck({
  lessonCode,
  lessonTitle,
  subLessonTitle,
  bites,
  initialIndex,
}: {
  lessonCode: string;
  lessonTitle: string;
  subLessonTitle: string;
  bites: LearnBite[];
  initialIndex: number;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [desktop, setDesktop] = useState(false);
  const bite = bites[index];
  const done = index >= bites.length;
  const reviewed = bite ? formatReviewed(bite.lastReviewedOn) : null;

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const apply = () => setDesktop(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!bite) return;
    void markSeenAction(bite.id);
  }, [bite]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((event.key === " " || event.key === "Enter") && (tag === "BUTTON" || tag === "A")) return;
      if (["ArrowDown", "ArrowRight", "PageDown", " "].includes(event.key)) {
        event.preventDefault();
        setIndex((current) => Math.min(bites.length, current + 1));
      }
      if (["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key)) {
        event.preventDefault();
        setIndex((current) => Math.max(0, current - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bites.length]);

  function next() {
    setIndex((current) => Math.min(bites.length, current + 1));
  }
  function prev() {
    setIndex((current) => Math.max(0, current - 1));
  }

  const progress = bites.length === 0 ? 0 : (Math.min(index + (done ? 0 : 1), bites.length) / bites.length) * 100;

  return (
    <section
      className="flex h-[calc(100dvh-10.5rem)] flex-col md:h-[calc(100dvh-7rem)]"
      onTouchStart={(event) => {
        const touch = event.changedTouches[0];
        if (!touch) return;
        event.currentTarget.dataset.startY = String(touch.clientY);
      }}
      onTouchEnd={(event) => {
        const start = Number(event.currentTarget.dataset.startY ?? "0");
        const touch = event.changedTouches[0];
        if (!touch || !start) return;
        const delta = start - touch.clientY;
        if (delta > 56) next();
        else if (delta < -56) prev();
      }}
    >
      <div className="mb-4">
        <p className="text-sm text-muted-foreground">
          {lessonCode} · {lessonTitle}
        </p>
        <h1 className="font-display text-3xl leading-tight">{subLessonTitle}</h1>
        <div className="mt-3 flex items-center gap-3">
          <Progress value={progress} aria-label="Progress through this sub-lesson" />
          <p className="shrink-0 text-sm text-muted-foreground" data-testid="learn-progress">
            {done ? `${bites.length} of ${bites.length}` : `${index + 1} of ${bites.length}`}
          </p>
        </div>
      </div>

      {bites.length === 0 ? (
        <p>This sub-lesson has no bites yet.</p>
      ) : done ? (
        <div className="rounded-2xl border border-border bg-card p-6" data-testid="learn-done">
          <h2 className="font-display text-2xl">That is the end of this sub-lesson.</h2>
          <p className="mt-2 text-muted-foreground">Quiz is a separate choice. Nothing here starts it for you.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={prev}>
              Back
            </Button>
            <Button asChild>
              <Link href="/course">Back to the course</Link>
            </Button>
          </div>
        </div>
      ) : (
        <article
          key={bite.id}
          data-testid="learn-card"
          className="card-rise min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-sm md:p-8"
          onClick={(event) => {
            if (!desktop) return;
            if ((event.target as HTMLElement).closest("a,button")) return;
            next();
          }}
        >
          <h2 className="font-display text-3xl leading-tight" data-testid="learn-title">
            {bite.title}
          </h2>
          <p className="mt-4 max-w-2xl text-[1.05em] leading-relaxed">{bite.body}</p>
          {bite.diagram ? (
            <div className="mt-5">
              <Diagram source={bite.diagram} />
            </div>
          ) : null}
          {bite.crossLinks.length > 0 ? (
            <p className="mt-5 text-sm">
              Related:{" "}
              {bite.crossLinks.map((link, linkIndex) => (
                <span key={link.id}>
                  {linkIndex > 0 ? ", " : ""}
                  {link.href ? (
                    <Link href={link.href} className="underline decoration-primary/50 underline-offset-4">
                      {link.label}
                    </Link>
                  ) : (
                    <span>{link.label}</span>
                  )}
                </span>
              ))}
            </p>
          ) : null}
          <p className="mt-auto pt-6 text-xs text-muted-foreground">
            {reviewed ? `Reviewed ${reviewed}` : "Not reviewed yet"}
            {bite.sourceNote ? ` · ${bite.sourceNote}` : ""}
          </p>
        </article>
      )}

      <div className="mt-3 hidden shrink-0 items-center justify-between gap-3 md:flex">
        <Button type="button" variant="outline" data-testid="learn-back" onClick={prev} disabled={index === 0}>
          Back
        </Button>
        <p className="text-sm text-muted-foreground">Arrows, space, or click the card</p>
        <Button type="button" data-testid="learn-next" onClick={next} disabled={done}>
          Next
        </Button>
      </div>
      <p className="mt-3 shrink-0 text-center text-sm text-muted-foreground md:hidden" data-testid="swipe-hint">
        Swipe up for the next bite
      </p>
    </section>
  );
}
