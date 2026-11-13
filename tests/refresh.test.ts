import { describe, expect, it } from "vitest";
import { REFRESH_AFTER_MS, shouldRefreshOnReturn } from "@/lib/refresh";

describe("shouldRefreshOnReturn", () => {
  it("does nothing when the app was never hidden", () => {
    expect(shouldRefreshOnReturn(null, 100_000)).toBe(false);
  });

  it("does not refresh after a quick switch away", () => {
    expect(shouldRefreshOnReturn(10_000, 10_000 + REFRESH_AFTER_MS - 1)).toBe(false);
  });

  it("refreshes after being away long enough", () => {
    expect(shouldRefreshOnReturn(10_000, 10_000 + REFRESH_AFTER_MS)).toBe(true);
    expect(shouldRefreshOnReturn(10_000, 10_000 + 60 * 60 * 1000)).toBe(true);
  });
});
