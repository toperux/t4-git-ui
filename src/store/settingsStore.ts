// Preferences that survive a restart (kv store): the diff defaults and the git executable.
// The live state stays where it already lives — the diff defaults are pushed into `diffStore`, and
// the theme is read/written through `theme/theme.ts`, so it is deliberately absent here.
import { create } from "zustand";
import * as ipc from "../api/ipc";
import { toAppError } from "../api/ipc";
import { kvGet, kvSet } from "../lib/kv";
import { useDiffStore } from "./diffStore";
import { useRepoStore } from "./repoStore";

export const DEFAULT_CONTEXT = 3;
export const MAX_CONTEXT = 99;

/** Anything unusable (a corrupt kv value, an empty number field) reads as the default. */
export const clampContext = (n: number): number => (Number.isFinite(n) ? Math.min(MAX_CONTEXT, Math.max(0, Math.round(n))) : DEFAULT_CONTEXT);

export interface SettingsStore {
  diffContext: number;
  ignoreWhitespace: boolean;
  /** `""` = whatever `git` resolves to on PATH. */
  gitPath: string;
  /** `git --version` of the executable the last apply accepted (`null` = never applied here). */
  gitVersion: string | null;
  gitError: string | null;

  load(): Promise<void>;
  setDiffContext(n: number): void;
  setIgnoreWhitespace(b: boolean): void;
  /** Tries `path` before keeping it; `false` (with `gitError` set) when git refused to answer. */
  setGitPath(path: string): Promise<boolean>;
  /** Drops the last probe's message: it describes a path that is being edited away. */
  clearGitError(): void;
}

const persist = (key: string, value: unknown) => kvSet(key, value).catch((e: unknown) => console.warn(`kv: could not persist "${key}"`, e));

export const useSettingsStore = create<SettingsStore>()((set) => ({
  diffContext: DEFAULT_CONTEXT,
  ignoreWhitespace: false,
  gitPath: "",
  gitVersion: null,
  gitError: null,

  async load() {
    const [context, whitespace, gitPath] = await Promise.all([kvGet<number>("diffContext"), kvGet<boolean>("ignoreWhitespace"), kvGet<string>("gitPath")]);
    const diffContext = clampContext(context ?? DEFAULT_CONTEXT);
    const ignoreWhitespace = whitespace ?? false;
    set({ diffContext, ignoreWhitespace, gitPath: gitPath ?? "" });
    // Nothing is loaded yet at startup, so seeding the diff store needs no reload.
    useDiffStore.getState().setContext(diffContext);
    useDiffStore.setState({ ignoreWhitespace });
  },

  setDiffContext(n) {
    const diffContext = clampContext(n);
    set({ diffContext });
    void persist("diffContext", diffContext);
    useDiffStore.getState().setContext(diffContext);
  },

  setIgnoreWhitespace(ignoreWhitespace) {
    set({ ignoreWhitespace });
    void persist("ignoreWhitespace", ignoreWhitespace);
    // The open diff may have been toggled for this session only; move it (and reload) just when it differs.
    const diff = useDiffStore.getState();
    if (diff.ignoreWhitespace !== ignoreWhitespace) diff.toggleWhitespace();
  },

  async setGitPath(path) {
    // The error belongs to the previous probe: the dialog must not show it beside this one's result.
    set({ gitError: null });
    try {
      const gitVersion = await ipc.setGitPath(path || "git");
      set({ gitPath: path, gitVersion, gitError: null });
      // The start screen's status line shows repoStore's copy from the launch probe; keep it current.
      useRepoStore.getState().setGitVersion(gitVersion);
      // Only a working executable is remembered: a bad one would break the next launch's probe.
      await persist("gitPath", path);
      return true;
    } catch (e) {
      set({ gitError: toAppError(e).message });
      return false;
    }
  },

  clearGitError: () => set({ gitError: null }),
}));
