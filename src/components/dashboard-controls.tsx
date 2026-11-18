"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { dismissRevisitAction, updateDailyGoalAction } from "@/lib/actions/phase4";
import type { RevisitItem } from "@/lib/learner/dashboard";

const GOAL_OPTIONS = [3, 5, 10, 15];

export function DailyGoalSelector({ currentGoal }: { currentGoal: number }) {
  const router = useRouter();
  const [goal, setGoal] = useState(currentGoal);
  const [customValue, setCustomValue] = useState(String(currentGoal));
  const [busy, setBusy] = useState(false);

  async function applyGoal(nextGoal: number) {
    const clamped = Math.max(1, Math.min(100, Math.round(nextGoal) || 5));
    setBusy(true);
    setGoal(clamped);
    setCustomValue(String(clamped));
    await updateDailyGoalAction(clamped);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-2" data-testid="daily-goal-selector">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground">Quick goal:</span>
        {GOAL_OPTIONS.map((option) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={goal === option ? "default" : "outline"}
            disabled={busy}
            data-testid={`daily-goal-${option}`}
            onClick={() => void applyGoal(option)}
          >
            {option}
          </Button>
        ))}
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = Number(customValue);
          if (Number.isFinite(parsed) && parsed >= 1) {
            void applyGoal(parsed);
          }
        }}
      >
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Custom goal (1–100):</span>
          <input
            type="number"
            min={1}
            max={100}
            value={customValue}
            disabled={busy}
            onChange={(event) => setCustomValue(event.target.value)}
            data-testid="daily-goal-custom-input"
            className="w-16 rounded-lg border border-input bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={busy || Number(customValue) === goal}
          data-testid="daily-goal-custom-save"
        >
          Set goal
        </Button>
      </form>
    </div>
  );
}

export function RevisitListClient({ items: initialItems }: { items: RevisitItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing flagged to revisit right now.</p>;
  }

  return (
    <ul className="space-y-2" data-testid="revisit-list">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background/60 px-3 py-2.5"
        >
          <div className="min-w-0 flex-1">
            <Link href={item.href} className="font-medium underline-offset-4 hover:underline">
              {item.title}
            </Link>
            <p className="text-xs text-muted-foreground">{item.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={item.href}>Open</Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              data-testid={`dismiss-revisit-${item.id}`}
              onClick={async () => {
                setItems((prev) => prev.filter((row) => row.id !== item.id));
                await dismissRevisitAction(item.id);
                router.refresh();
              }}
            >
              Done
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
