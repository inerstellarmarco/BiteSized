"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { markSeenAction } from "@/lib/actions";
import { addStyleExampleAction, flagAction, regenerateAction, saveRegenerationAction, showOriginalAction, toggleHeartAction } from "@/lib/actions/phase3";
import { saveBiteNoteAction } from "@/lib/actions/phase4";
import { REGENERATE_PRESETS } from "@/lib/ai/regenerate";
import type { PersonalView } from "@/lib/ai/view";
import { Diagram } from "@/components/diagram";
import { Button } from "@/components/ui/button";
import { PopMenu, PopMenuItem } from "@/components/ui/menu";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Check, Heart, MoreHorizontal } from "lucide-react";
import { formatReviewed } from "@/lib/utils";
import { cardEnterClass, classifySwipe, computeSwipePullOffset, lockPullToRefresh, SWIPE_THRESHOLD_PX } from "@/lib/swipe";
import { biteActions, bodyParagraphs, type BiteActionId } from "@/lib/bite-actions";

export type LearnBite = {
  id: string;
  title: string;
  body: string;
  sourceNote: string;
  lastReviewedOn: string | null;
  diagram: string | null;
  crossLinks: { id: string; label: string; targetCode: string; href: string | null }[];
  personal?: PersonalView | null;
  hearted?: boolean;
  privateNote?: string;
};

export function LearnDeck({
  lessonCode,
  lessonTitle,
  subLessonTitle,
  bites,
  initialIndex,
  isAdmin = false,
  remaining = 0,
  limit = 100,
  subLessonId,
  nextHref = null,
  nextTitle = null,
}: {
  subLessonId?: string;
  nextHref?: string | null;
  nextTitle?: string | null;
  lessonCode: string;
  lessonTitle: string;
  subLessonTitle: string;
  bites: LearnBite[];
  initialIndex: number;
  isAdmin?: boolean;
  remaining?: number;
  limit?: number;
}) {
  const router = useRouter();
  const swipeStart = useRef<{ x: number; y: number; scrollTop: number } | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const [pullOffset, setPullOffset] = useState(0);
  const [pullArmed, setPullArmed] = useState<"next" | "prev" | null>(null);
  const [index, setIndex] = useState(initialIndex);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [desktop, setDesktop] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [left, setLeft] = useState(remaining);
  const [draft, setDraft] = useState<{ biteId: string; title: string; body: string; diagram: string | null; basedOnUpdatedAt: string } | null>(null);
  const [heartOverrides, setHeartOverrides] = useState<Record<string, boolean>>({});
  const [noteOverrides, setNoteOverrides] = useState<Record<string, string>>({});
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const bite = bites[index];
  const currentPrivateNote = bite ? (noteOverrides[bite.id] ?? bite.privateNote ?? "") : "";
  const done = index >= bites.length;
  const reviewed = bite ? formatReviewed(bite.lastReviewedOn) : null;

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const apply = () => setDesktop(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  // A swipe down from the top of a card means "previous bite", not "refresh the page".
  useEffect(() => {
    const unlockHtml = lockPullToRefresh(document.documentElement);
    const unlockBody = lockPullToRefresh(document.body);
    return () => {
      unlockBody();
      unlockHtml();
    };
  }, []);

  useEffect(() => {
    if (!bite) return;
    void markSeenAction(bite.id);
    setNoteOpen(false);
    setNoteText(noteOverrides[bite.id] ?? bite.privateNote ?? "");
  }, [bite, noteOverrides]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((event.key === " " || event.key === "Enter") && (tag === "BUTTON" || tag === "A")) return;
      if (["ArrowDown", "ArrowRight", "PageDown", " "].includes(event.key)) {
        event.preventDefault();
        setDirection("next");
        setIndex((current) => Math.min(bites.length, current + 1));
      }
      if (["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key)) {
        event.preventDefault();
        setDirection("prev");
        setIndex((current) => Math.max(0, current - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bites.length]);

  function next() {
    setDirection("next");
    setIndex((current) => Math.min(bites.length, current + 1));
  }
  function prev() {
    setDirection("prev");
    setIndex((current) => Math.max(0, current - 1));
  }

  const progress = bites.length === 0 ? 0 : (Math.min(index + (done ? 0 : 1), bites.length) / bites.length) * 100;

  return (
    <section
      className="flex h-[calc(100dvh-10.5rem)] flex-col overscroll-y-contain md:h-[calc(100dvh-7rem)]"
      onTouchStart={(event) => {
        const touch = event.touches[0];
        if (!touch) return;
        const card = cardRef.current;
        swipeStart.current = {
          y: touch.clientY,
          x: touch.clientX,
          scrollTop: card?.scrollTop ?? 0,
        };
        setPullOffset(0);
        setPullArmed(null);
      }}
      onTouchMove={(event) => {
        const start = swipeStart.current;
        const touch = event.touches[0];
        if (!start || !touch) return;
        const card = cardRef.current;
        const scrollState = {
          scrollTop: card?.scrollTop ?? 0,
          startScrollTop: start.scrollTop,
          clientHeight: card?.clientHeight ?? 0,
          scrollHeight: card?.scrollHeight ?? 0,
        };
        const dy = touch.clientY - start.y;
        const dx = touch.clientX - start.x;
        const offset = computeSwipePullOffset(dy, dx, scrollState);
        setPullOffset(offset);
        setPullArmed(
          classifySwipe(
            { x: start.x, y: start.y },
            { x: touch.clientX, y: touch.clientY },
            scrollState,
          ),
        );
      }}
      onTouchCancel={() => {
        swipeStart.current = null;
        setPullOffset(0);
        setPullArmed(null);
      }}
      onTouchEnd={(event) => {
        const start = swipeStart.current;
        swipeStart.current = null;
        setPullOffset(0);
        setPullArmed(null);
        const touch = event.changedTouches[0];
        if (!start || !touch) return;
        const card = cardRef.current;
        const direction = classifySwipe(
          { x: start.x, y: start.y },
          { x: touch.clientX, y: touch.clientY },
          {
            scrollTop: card?.scrollTop ?? 0,
            startScrollTop: start.scrollTop,
            clientHeight: card?.clientHeight ?? 0,
            scrollHeight: card?.scrollHeight ?? 0,
          },
        );
        if (direction === "next") next();
        else if (direction === "prev") prev();
      }}
    >
      <div className="mb-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="min-w-0 truncate text-sm leading-tight md:text-base">
            <span className="font-semibold text-primary">{lessonCode}</span>
            <span className="mx-1.5 text-muted-foreground">·</span>
            <span className="font-display font-medium">{subLessonTitle}</span>
            {lessonTitle && lessonTitle !== subLessonTitle ? (
              <span className="ml-1.5 hidden text-xs text-muted-foreground sm:inline">
                · {lessonTitle}
              </span>
            ) : null}
          </h1>
          <p className="shrink-0 text-[11px] tabular-nums text-muted-foreground" data-testid="learn-progress">
            {done ? `${bites.length} of ${bites.length}` : `${index + 1} of ${bites.length}`}
          </p>
        </div>
        <div className="mt-1">
          {bites.length > 1 && bites.length <= 16 ? (
            <div
              className="flex items-center gap-0.5"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              aria-label="Progress through this sub-lesson"
              data-testid="learn-pill-progress"
            >
              {bites.map((item, pillIdx) => {
                const isPast = done || pillIdx < index;
                const isCurrent = !done && pillIdx === index;
                return (
                  <span
                    key={item.id}
                    className={cn(
                      "h-0.5 flex-1 rounded-full transition-colors duration-300",
                      isPast
                        ? "bg-primary"
                        : isCurrent
                          ? "bg-primary/75"
                          : "bg-secondary",
                    )}
                  />
                );
              })}
            </div>
          ) : (
            <Progress className="h-0.5" value={progress} aria-label="Progress through this sub-lesson" />
          )}
        </div>
      </div>

      {bites.length === 0 ? (
        <p>This sub-lesson has no bites yet.</p>
      ) : done ? (
        <div className="card-rise rounded-2xl border border-success/60 bg-success/10 p-6 text-center" data-testid="learn-done">
          <div className="trophy-pop mx-auto flex h-16 w-16 items-center justify-center rounded-full border-4 border-success/30 bg-success text-white shadow-sm">
            <Check className="h-8 w-8" aria-hidden />
          </div>
          <h2 className="mt-4 font-display text-2xl">That is the end of this sub-lesson.</h2>
          <p className="mt-1 text-muted-foreground">
            {bites.length} {bites.length === 1 ? "bite" : "bites"} read. Quiz is a separate choice. Nothing here starts it for you.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {subLessonId ? (
              <Button asChild size="lg">
                <Link href={`/quiz/${subLessonId}`} data-testid="learn-take-quiz">
                  Take the quiz
                </Link>
              </Button>
            ) : null}
            {nextHref && nextTitle ? (
              <Button asChild variant="outline" size="lg">
                <Link href={nextHref} data-testid="learn-next-sublesson">
                  Next: {nextTitle}
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline" size="lg">
                <Link href="/course">Back to the course</Link>
              </Button>
            )}
          </div>
          <button type="button" onClick={prev} className="mt-4 text-sm text-muted-foreground underline-offset-4 hover:underline">
            Back to the last card
          </button>
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col pb-2.5">
          {bites.length - 1 - index >= 2 ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-5 -bottom-0.5 h-6 rounded-2xl border border-border/70 bg-card/70 shadow-2xs transition-all duration-300"
            />
          ) : null}
          {bites.length - 1 - index >= 1 ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-2.5 bottom-1 h-6 rounded-2xl border border-border/85 bg-card/90 shadow-2xs transition-all duration-300"
            />
          ) : null}
          <article
            key={bite.id}
            ref={cardRef}
            data-testid="learn-card"
            style={
              pullOffset !== 0
                ? { transform: `translateY(${pullOffset}px)`, transition: "none" }
                : undefined
            }
            className={cn(cardEnterClass(direction), "relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-y-contain rounded-2xl border border-border bg-card p-5 shadow-sm transition-transform duration-200 md:p-8")}
            onClick={(event) => {
              if (!desktop) return;
              if ((event.target as HTMLElement).closest("a,button")) return;
              next();
            }}
          >
          <BiteTools
            bite={{ ...bite, hearted: heartOverrides[bite.id] ?? bite.hearted }}
            isAdmin={isAdmin}
            desktop={desktop}
            menuOpen={menuOpen}
            busy={busy}
            note={note}
            left={left}
            limit={limit}
            draft={draft?.biteId === bite.id ? draft : null}
            onMenu={() => setMenuOpen((open) => !open)}
            onPreset={async (preset) => {
              setBusy(true);
              setNote(null);
              const result = await regenerateAction(bite.id, preset);
              setBusy(false);
              if (!result.ok) {
                setNote(result.message);
                return;
              }
              setLeft(result.remaining);
              setDraft({ biteId: bite.id, title: result.title, body: result.body, diagram: result.diagram, basedOnUpdatedAt: result.basedOnUpdatedAt });
              setMenuOpen(false);
              if (result.diagramFlagged) setNote("The diagram did not render, so this card is shown without it. Admins can fix it from the flag list.");
            }}
            onSave={async (mode) => {
              if (!draft || draft.biteId !== bite.id) return;
              setBusy(true);
              const result = await saveRegenerationAction({ ...draft, mode });
              setBusy(false);
              setNote(result.ok ? "Saved." : result.message);
              if (result.ok) {
                setDraft(null);
                router.refresh();
              }
            }}
            onShowing={async (showing) => {
              await showOriginalAction(bite.id, showing);
              router.refresh();
            }}
            onHeart={async () => {
              const result = await toggleHeartAction("bite", bite.id);
              setHeartOverrides((previous) => ({ ...previous, [bite.id]: result.hearted }));
            }}
            onFlag={async (kind) => {
              const result = await flagAction("bite", bite.id, kind);
              setNote(result.ok ? result.message : result.message);
            }}
            onExample={async () => {
              const result = await addStyleExampleAction("bite", bite.id);
              setNote(result.ok ? "Added to style examples." : result.error);
            }}
          />
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
          <div className="mt-5 border-t border-border/70 pt-3" onClick={(event) => event.stopPropagation()}>
            {!noteOpen ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                {currentPrivateNote ? (
                  <p className="text-sm text-muted-foreground" data-testid="bite-note-display">
                    <span className="font-medium text-foreground">Your note:</span> {currentPrivateNote}
                  </p>
                ) : (
                  <span className="text-xs text-muted-foreground">Private note (only you see this)</span>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  data-testid="bite-note-toggle"
                  onClick={() => {
                    setNoteText(currentPrivateNote);
                    setNoteOpen(true);
                  }}
                >
                  {currentPrivateNote ? "Edit note" : "Add note"}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <label htmlFor={`note-${bite.id}`} className="block text-xs font-medium text-muted-foreground">
                  Your private note on this card
                </label>
                <textarea
                  id={`note-${bite.id}`}
                  data-testid="bite-note-input"
                  rows={2}
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  placeholder="Write a short note for yourself…"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    data-testid="bite-note-save"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      const saved = await saveBiteNoteAction(bite.id, noteText);
                      setBusy(false);
                      if (saved.ok) {
                        setNoteOverrides((previous) => ({ ...previous, [bite.id]: saved.note }));
                        setNoteOpen(false);
                        setNote(saved.note ? "Note saved." : "Note removed.");
                      } else {
                        setNote(saved.message);
                      }
                    }}
                  >
                    Save note
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setNoteOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
          <p className="mt-auto pt-6 text-xs text-muted-foreground">
            Card {index + 1} of {bites.length} · ~30s read · {reviewed ? `Reviewed ${reviewed}` : "Not reviewed yet"}
            {bite.sourceNote ? ` · ${bite.sourceNote}` : ""}
          </p>
          </article>
        </div>
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
      <p className="mt-2 shrink-0 text-center text-xs text-muted-foreground md:hidden" data-testid="swipe-hint">
        {pullOffset < -6
          ? pullArmed === "next"
            ? "Release for next card ↑"
            : `Keep pulling up for next card (${Math.min(100, Math.round((Math.abs(pullOffset) / Math.pow(SWIPE_THRESHOLD_PX, 0.72)) * 100))}%) ↑`
          : pullOffset > 6
            ? pullArmed === "prev"
              ? "Release for previous card ↓"
              : "Keep pulling down for previous card ↓"
            : "Scroll to bottom, then pull up firmly for next bite"}
      </p>
    </section>
  );
}

function BiteTools({
  bite,
  isAdmin,
  desktop,
  menuOpen,
  busy,
  note,
  left,
  limit,
  draft,
  onMenu,
  onPreset,
  onSave,
  onShowing,
  onHeart,
  onFlag,
  onExample,
}: {
  bite: LearnBite;
  isAdmin: boolean;
  desktop: boolean;
  menuOpen: boolean;
  busy: boolean;
  note: string | null;
  left: number;
  limit: number;
  draft: { title: string; body: string; diagram: string | null; basedOnUpdatedAt: string } | null;
  onMenu: () => void;
  onPreset: (preset: string) => void;
  onSave: (mode: "personal" | "everyone" | "both") => void;
  onShowing: (showing: "personal" | "original") => void;
  onHeart: () => void;
  onFlag: (kind: "revisit" | "rework" | "error") => void;
  onExample: () => void;
}) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const personal = bite.personal;
  const showPersonal = Boolean(personal && personal.showing === "personal" && !draft);
  const title = draft?.title ?? (showPersonal ? personal?.title : bite.title);
  const body = draft?.body ?? (showPersonal ? personal?.body : bite.body);
  const diagram = draft ? draft.diagram : showPersonal ? personal?.diagram ?? null : bite.diagram;
  const actions = biteActions(isAdmin);
  function run(id: BiteActionId) {
    setToolsOpen(false);
    if (id === "regenerate") onMenu();
    else if (id === "example") onExample();
    else onFlag(id);
  }
  return (
    <>
      <div className="absolute right-3 top-3 flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
        {desktop ? null : (
          <div className="relative">
            <button
              type="button"
              data-testid="bite-tools"
              aria-haspopup="menu"
              aria-expanded={toolsOpen}
              aria-label="More actions for this bite"
              title="More actions"
              onClick={() => setToolsOpen((open) => !open)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden />
            </button>
            <PopMenu open={toolsOpen} onClose={() => setToolsOpen(false)} testId="bite-tools-menu">
              {actions.map((action) => (
                <PopMenuItem key={action.id} testId={action.testId} onClick={() => run(action.id)}>
                  {action.label}
                </PopMenuItem>
              ))}
            </PopMenu>
          </div>
        )}
        <button
          type="button"
          data-testid="heart"
          aria-pressed={bite.hearted}
          aria-label={bite.hearted ? "Remove heart from this bite" : "Heart this bite"}
          title={bite.hearted ? "Remove heart" : "Heart this bite"}
          onClick={onHeart}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Heart className={cn("h-5 w-5", bite.hearted && "heart-pop fill-red-500 text-red-500")} aria-hidden />
        </button>
      </div>
      {showPersonal ? (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold" data-testid="personal-badge">
            Your version
          </span>
          {personal?.stale ? (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold" data-testid="original-updated">
              Original updated
            </span>
          ) : null}
        </div>
      ) : null}
      <h2 className="pr-20 font-display text-2xl leading-tight md:text-3xl" data-testid="learn-title">
        {title}
      </h2>
      <div className="mt-4 max-w-2xl space-y-3 text-[1.05em] leading-relaxed" data-testid="learn-body">
        {bodyParagraphs(body ?? "").map((paragraph, paragraphIndex) => (
          <p key={paragraphIndex}>{paragraph}</p>
        ))}
      </div>
      {diagram ? (
        <div className="mt-5">
          <Diagram source={diagram} />
        </div>
      ) : null}
      {desktop ? (
        <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-4" data-testid="bite-actions" onClick={(event) => event.stopPropagation()}>
          {actions.map((action) => (
            <Button key={action.id} type="button" size="sm" variant="outline" data-testid={action.testId} onClick={() => run(action.id)}>
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
      {menuOpen ? (
        <div className="mt-4" onClick={(event) => event.stopPropagation()}>
          <div className="flex flex-wrap gap-2" data-testid="regenerate-options">
            {REGENERATE_PRESETS.map((preset) => (
              <Button key={preset.id} type="button" size="sm" disabled={busy} data-testid={`preset-${preset.id}`} onClick={() => onPreset(preset.id)}>
                {preset.label}
              </Button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground" data-testid="regen-remaining">
            {left} of {limit} regenerations left today
          </p>
        </div>
      ) : null}
      {draft ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" data-testid="save-personal" disabled={busy} onClick={() => onSave("personal")}>
            Save for me
          </Button>
          {isAdmin ? (
            <>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onSave("everyone")}>
                Save for everyone
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onSave("both")}>
                Save both
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
      {personal?.stale ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" data-testid="use-original" onClick={() => onShowing(showPersonal ? "original" : "personal")}>
            {showPersonal ? "Use the updated original" : "Back to my version"}
          </Button>
        </div>
      ) : null}
      {note ? <p className="mt-2 text-sm">{note}</p> : null}
    </>
  );
}

