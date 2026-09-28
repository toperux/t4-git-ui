import { afterEach, describe, expect, it, vi } from "vitest";
import { ctrlOrCmd } from "./keys";

afterEach(() => vi.restoreAllMocks());

const ua = (s: string) => vi.spyOn(navigator, "userAgent", "get").mockReturnValue(s);

describe("ctrlOrCmd", () => {
  it("takes Ctrl anywhere, ⌘ on macOS only (Meta is Super on Linux)", () => {
    ua("Mozilla/5.0 (X11; Linux x86_64)");
    expect(ctrlOrCmd({ ctrlKey: true, metaKey: false })).toBe(true);
    expect(ctrlOrCmd({ ctrlKey: false, metaKey: true })).toBe(false);
    ua("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
    expect(ctrlOrCmd({ ctrlKey: false, metaKey: true })).toBe(true);
  });
});
