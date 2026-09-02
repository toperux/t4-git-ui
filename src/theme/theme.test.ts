import { afterEach, describe, expect, it, vi } from "vitest";
import { setTheme } from "./theme";

// No store plugin here: lib/kv falls back to localStorage (`kv:` prefix).
vi.mock("@tauri-apps/plugin-store", () => ({ load: vi.fn(() => Promise.reject(new Error("not in tauri"))) }));

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  setTheme("system");
  localStorage.clear();
});

describe("setTheme", () => {
  it("mirrors the preference into the kv store for the native window colour", async () => {
    setTheme("dark");
    await flush();
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(localStorage.getItem("kv:theme")).toBe(JSON.stringify("dark"));

    setTheme("system");
    await flush();
    expect(localStorage.getItem("theme")).toBeNull();
    expect(localStorage.getItem("kv:theme")).toBe("null");
  });
});
