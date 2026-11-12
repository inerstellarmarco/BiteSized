"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { markSeenAction } from "@/lib/actions";
import { addStyleExampleAction, flagAction, regenerateAction, saveRegenerationAction, showOriginalAction, toggleHeartAction } from "@/lib/actions/phase3";
import { REGENERATE_PRESETS } from "@/lib/ai/regenerate";
import type { PersonalView } from "@/lib/ai/view";
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
  personal?: PersonalView | null;
  hearted?: boolean;
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
}: {
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
  const [index, setIndex] = useState(initialIndex);
  const [desktop, setDesktop] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [left, setLeft] = useState(remaining);
  const [draft, setDraft] = useState<{ biteId: string; title: string; body: string; diagram: string | null; basedOnUpdatedAt: string } | null>(null);
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
          <BiteTools
            bite={bite}
            isAdmin={isAdmin}
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
              await toggleHeartAction("bite", bite.id);
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

function BiteTools({
  bite,
  isAdmin,
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
  const personal = bite.personal;
  const showPersonal = Boolean(personal && personal.showing === "personal" && !draft);
  const title = draft?.title ?? (showPersonal ? personal?.title : bite.title);
  const body = draft?.body ?? (showPersonal ? personal?.body : bite.body);
  const diagram = draft ? draft.diagram : showPersonal ? personal?.diagram ?? null : bite.diagram;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {showPersonal ? (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold" data-testid="personal-badge">
            Your version
          </span>
        ) : null}
        {showPersonal && personal?.stale ? (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold" data-testid="original-updated">
            Original updated
          </span>
        ) : null}
      </div>
      <h2 className="font-display text-3xl leading-tight" data-testid="learn-title">
        {title}
      </h2>
      <p className="mt-4 max-w-2xl text-[1.05em] leading-relaxed">{body}</p>
      {diagram ? (
        <div className="mt-5">
          <Diagram source={diagram} />
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
        <Button type="button" variant={bite.hearted ? "default" : "outline"} size="sm" data-testid="heart" onClick={onHeart}>
          {bite.hearted ? "Hearted" : "Heart"}
        </Button>
        <Button type="button" variant="outline" size="sm" data-testid="regenerate-menu" onClick={onMenu}>
          Regenerate
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onFlag("revisit")}>Revisit</Button>
        <Button type="button" variant="ghost" size="sm" data-testid="flag-rework" onClick={() => onFlag("rework")}>Flag for rework</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onFlag("error")}>Report an error</Button>
        {isAdmin ? (
          <Button type="button" variant="outline" size="sm" data-testid="style-example" onClick={onExample}>
            Use as style example
          </Button>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-muted-foreground" data-testid="regen-remaining">
        {left} of {limit} regenerations left today
      </p>
      {menuOpen ? (
        <div className="mt-3 flex flex-wrap gap-2" data-testid="regenerate-options">
          {REGENERATE_PRESETS.map((preset) => (
            <Button key={preset.id} type="button" size="sm" disabled={busy} data-testid={`preset-${preset.id}`} onClick={() => onPreset(preset.id)}>
              {preset.label}
            </Button>
          ))}
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
