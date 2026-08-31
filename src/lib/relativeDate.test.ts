import { describe, expect, it } from "vitest";
import { relativeDate } from "./relativeDate";

// Fixed "now": 2026-08-31 14:00 local time.
const NOW = new Date(2026, 7, 31, 14, 0, 0).getTime();
const secsAgo = (s: number) => Math.floor((NOW - s * 1000) / 1000);

describe("relativeDate", () => {
  it("uses minutes and hours within a day", () => {
    expect(relativeDate(secsAgo(10), NOW)).toBe("just now");
    expect(relativeDate(secsAgo(5 * 60), NOW)).toBe("5m ago");
    expect(relativeDate(secsAgo(2 * 3600), NOW)).toBe("2h ago");
  });

  it("says Yesterday for the previous calendar day", () => {
    const yesterday = new Date(2026, 7, 30, 9, 0, 0).getTime() / 1000;
    expect(relativeDate(yesterday, NOW)).toBe("Yesterday");
  });

  it("counts days up to a week", () => {
    const threeDays = new Date(2026, 7, 28, 9, 0, 0).getTime() / 1000;
    expect(relativeDate(threeDays, NOW)).toBe("3d ago");
  });

  it("falls back to month + day in the same year", () => {
    const aug20 = new Date(2026, 7, 20, 9, 0, 0).getTime() / 1000;
    expect(relativeDate(aug20, NOW)).toBe("Aug 20");
  });

  it("adds the year for other years", () => {
    const old = new Date(2025, 0, 5, 9, 0, 0).getTime() / 1000;
    expect(relativeDate(old, NOW)).toBe("Jan 5, 2025");
  });
});
