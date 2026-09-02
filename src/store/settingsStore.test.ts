import { beforeEach, describe, expect, it, vi } from "vitest";

// No Tauri runtime: the store plugin fails to load and lib/kv falls back to localStorage.
vi.mock("@tauri-apps/plugin-store", () => ({ load: vi.fn(() => Promise.reject(new Error("not in tauri"))) }));
vi.mock("../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/ipc")>();
  return { ...actual, setGitPath: vi.fn(), getFileDiff: vi.fn(() => new Promise(() => {})), getCommitFiles: vi.fn(() => new Promise(() => {})) };
});

import * as ipc from "../api/ipc";
import { useDiffStore } from "./diffStore";
import { clampContext, DEFAULT_CONTEXT, useSettingsStore } from "./settingsStore";

const mocked = ipc as unknown as Record<"setGitPath", ReturnType<typeof vi.fn>>;
const flush = () => new Promise((res) => setTimeout(res, 0));
const stored = (key: string) => JSON.parse(localStorage.getItem(`kv:${key}`) ?? "null") as unknown;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useSettingsStore.setState({ diffContext: DEFAULT_CONTEXT, ignoreWhitespace: false, gitPath: "", gitVersion: null, gitError: null });
  useDiffStore.setState({ repoId: null, oid: null, selectedPath: null, context: DEFAULT_CONTEXT, ignoreWhitespace: false });
});

describe("clampContext", () => {
  it("rounds into 0–99 and falls back to the default for a corrupt value", () => {
    expect(clampContext(5.4)).toBe(5);
    expect(clampContext(-2)).toBe(0);
    expect(clampContext(1000)).toBe(99);
    expect(clampContext(NaN)).toBe(DEFAULT_CONTEXT);
  });
});

describe("settingsStore.load", () => {
  it("seeds the diff store from the stored preferences", async () => {
    localStorage.setItem("kv:diffContext", "8");
    localStorage.setItem("kv:ignoreWhitespace", "true");
    localStorage.setItem("kv:gitPath", JSON.stringify("C:\\git\\bin\\git.exe"));
    await useSettingsStore.getState().load();
    expect(useSettingsStore.getState()).toMatchObject({ diffContext: 8, ignoreWhitespace: true, gitPath: "C:\\git\\bin\\git.exe" });
    expect(useDiffStore.getState().context).toBe(8);
    expect(useDiffStore.getState().ignoreWhitespace).toBe(true);
  });

  it("falls back to 3 context lines and PATH when nothing is stored", async () => {
    await useSettingsStore.getState().load();
    expect(useSettingsStore.getState()).toMatchObject({ diffContext: DEFAULT_CONTEXT, ignoreWhitespace: false, gitPath: "" });
  });
});

describe("settingsStore setters", () => {
  it("setDiffContext clamps, persists and moves the diff store", async () => {
    useSettingsStore.getState().setDiffContext(120);
    expect(useSettingsStore.getState().diffContext).toBe(99);
    expect(useDiffStore.getState().context).toBe(99);
    await flush();
    expect(stored("diffContext")).toBe(99);
  });

  it("setIgnoreWhitespace persists and flips the open diff only when it differs", async () => {
    const toggle = vi.spyOn(useDiffStore.getState(), "toggleWhitespace");
    useSettingsStore.getState().setIgnoreWhitespace(true);
    expect(useDiffStore.getState().ignoreWhitespace).toBe(true);
    expect(toggle).toHaveBeenCalledTimes(1);
    // The diff already ignores whitespace: no second reload.
    useSettingsStore.getState().setIgnoreWhitespace(true);
    expect(toggle).toHaveBeenCalledTimes(1);
    await flush();
    expect(stored("ignoreWhitespace")).toBe(true);
  });

  it("setGitPath keeps a working executable and its version", async () => {
    mocked.setGitPath.mockResolvedValue("git version 2.55.0");
    await expect(useSettingsStore.getState().setGitPath("C:\\git\\bin\\git.exe")).resolves.toBe(true);
    expect(mocked.setGitPath).toHaveBeenCalledWith("C:\\git\\bin\\git.exe");
    expect(useSettingsStore.getState()).toMatchObject({ gitVersion: "git version 2.55.0", gitError: null });
    expect(stored("gitPath")).toBe("C:\\git\\bin\\git.exe");
  });

  it("setGitPath sends an empty path to PATH's git", async () => {
    mocked.setGitPath.mockResolvedValue("git version 2.55.0");
    await useSettingsStore.getState().setGitPath("");
    expect(mocked.setGitPath).toHaveBeenCalledWith("git");
    expect(stored("gitPath")).toBe("");
  });

  it("setGitPath leaves the stored path untouched when git refuses", async () => {
    mocked.setGitPath.mockRejectedValue({ kind: "gitNotFound", message: "not a git executable" });
    await expect(useSettingsStore.getState().setGitPath("C:\\nope.exe")).resolves.toBe(false);
    expect(useSettingsStore.getState().gitError).toBe("not a git executable");
    expect(useSettingsStore.getState().gitPath).toBe("");
    expect(stored("gitPath")).toBeNull();
  });
});
