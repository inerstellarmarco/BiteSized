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
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="daily-goal-selector">
      <span className="mr-1 text-xs text-muted-foreground">Daily goal:</span>
      {GOAL_OPTIONS.map((option) => (
        <Button
          key={option}
          type="button"
          size="sm"
          variant={goal === option ? "default" : "outline"}
          disabled={busy}
          data-testid={`daily-goal-${option}`}
          onClick={async () => {
            setBusy(true);
            setGoal(option);
            await updateDailyGoalAction(option);
            setBusy(false);
            router.refresh();
          }}
        >
          {option}
        </Button>
      ))}
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
