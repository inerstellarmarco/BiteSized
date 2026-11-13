// How long the app must be in the background before coming back reloads its data.
export const REFRESH_AFTER_MS = 5000;

// True when the app was hidden long enough that the page may be out of date.
export function shouldRefreshOnReturn(hiddenAt: number | null, now: number, minAwayMs = REFRESH_AFTER_MS): boolean {
  if (hiddenAt === null) return false;
  return now - hiddenAt >= minAwayMs;
}
