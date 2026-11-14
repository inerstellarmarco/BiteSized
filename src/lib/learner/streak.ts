import { eq } from "drizzle-orm";
import { asDate } from "@/lib/dates";
import { appSettings, biteProgress } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";

export const DEFAULT_DAILY_BITE_GOAL = 5;

function goalKey(profileId: string): string {
  return `daily_goal:${profileId}`;
}

export function dayStamp(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(day: string, delta: number): string {
  const base = new Date(`${day}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + delta);
  return dayStamp(base);
}

export type StreakSummary = {
  todayBites: number;
  goal: number;
  goalMetToday: boolean;
  currentStreak: number;
  longestStreak: number;
  activeDays: number;
};

export function computeStreak(
  seenDates: readonly (Date | string | null | undefined)[],
  goal: number = DEFAULT_DAILY_BITE_GOAL,
  now: Date = new Date(),
): StreakSummary {
  const safeGoal = Math.max(1, Math.min(100, Math.round(goal) || DEFAULT_DAILY_BITE_GOAL));
  const countsByDay = new Map<string, number>();
  for (const raw of seenDates) {
    const parsed = asDate(raw);
    if (!parsed) continue;
    const day = dayStamp(parsed);
    countsByDay.set(day, (countsByDay.get(day) ?? 0) + 1);
  }

  const today = dayStamp(now);
  const todayBites = countsByDay.get(today) ?? 0;
  const days = [...countsByDay.keys()].sort();
  if (days.length === 0) {
    return {
      todayBites: 0,
      goal: safeGoal,
      goalMetToday: false,
      currentStreak: 0,
      longestStreak: 0,
      activeDays: 0,
    };
  }

  const daySet = new Set(days);
  let longestStreak = 0;
  let running = 0;
  let prevDay: string | null = null;
  for (const day of days) {
    if (prevDay && addDays(prevDay, 1) === day) {
      running += 1;
    } else {
      running = 1;
    }
    if (running > longestStreak) longestStreak = running;
    prevDay = day;
  }

  let currentStreak = 0;
  const yesterday = addDays(today, -1);
  let cursor: string | null = daySet.has(today) ? today : daySet.has(yesterday) ? yesterday : null;
  while (cursor && daySet.has(cursor)) {
    currentStreak += 1;
    cursor = addDays(cursor, -1);
  }

  return {
    todayBites,
    goal: safeGoal,
    goalMetToday: todayBites >= safeGoal,
    currentStreak,
    longestStreak,
    activeDays: days.length,
  };
}

export async function getDailyBiteGoal(db: AppDatabase, profileId: string): Promise<number> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, goalKey(profileId)));
  const parsed = Number(row?.value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(100, Math.round(parsed)) : DEFAULT_DAILY_BITE_GOAL;
}

export async function setDailyBiteGoal(db: AppDatabase, profileId: string, goal: number): Promise<number> {
  const safeGoal = Math.max(1, Math.min(100, Math.round(goal) || DEFAULT_DAILY_BITE_GOAL));
  const key = goalKey(profileId);
  await db
    .insert(appSettings)
    .values({ key, value: String(safeGoal) })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: String(safeGoal) },
    });
  return safeGoal;
}

export async function learnerStreak(db: AppDatabase, profileId: string, now: Date = new Date()): Promise<StreakSummary> {
  const [goal, progressRows] = await Promise.all([
    getDailyBiteGoal(db, profileId),
    db.select({ seenAt: biteProgress.seenAt }).from(biteProgress).where(eq(biteProgress.profileId, profileId)),
  ]);
  return computeStreak(
    progressRows.map((row) => row.seenAt),
    goal,
    now,
  );
}
