// The update check and the install that follows it. Both live here rather than in the dialog because
// the badge beside the Settings gear reads the same answer, on both screens. A successful install
// never comes back — the app restarts into the new version — so only its failures land in `error`.
import { ask } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";
import { onUpdateProgressReady } from "../api/events";
import * as ipc from "../api/ipc";
import { toAppError } from "../api/ipc";
import type { UpdateInfo } from "../api/types";
import { APP_NAME } from "../lib/app";

/**
 * `installing` isn't set until after the drafts query and the ask below, so a second Install click in
 * that gap would start a second install flow. Guarded here rather than by setting `installing` early:
 * Settings reads `installing` as "Downloading…", which must not show while it is still asking.
 */
let confirming = false;

export interface UpdateStore {
  /** The release newer than this build, once a check found one. */
  info: UpdateInfo | null;
  /**
   * Whether a check has come back at all. `info === null` alone cannot tell "nothing newer exists"
   * from "nobody has asked yet", and the dialog must not answer "up to date" on the strength of the
   * second — at launch with the setting off, no check ever runs.
   */
  checked: boolean;
  checking: boolean;
  installing: boolean;
  /** Download percentage 0–100, `null` while the total size is unknown. */
  progress: number | null;
  error: string | null;

  check(): Promise<void>;
  install(): Promise<void>;
  /** Another window's check came back (`update://checked`): its answer is this window's too. */
  learn(info: UpdateInfo | null): void;
}

export const useUpdateStore = create<UpdateStore>()((set) => ({
  info: null,
  checked: false,
  checking: false,
  installing: false,
  progress: null,
  error: null,

  async check() {
    // The message belongs to the previous check: the dialog must not show it beside this one's result.
    set({ checking: true, error: null });
    try {
      const info = await ipc.checkForUpdate();
      set({ info, checked: true, checking: false });
    } catch (e) {
      // `checked` stays where it was: a failed check answered nothing, and claiming otherwise is how
      // "up to date" gets shown to someone who is offline.
      set({ checking: false, error: toAppError(e).message });
    }
  },

  async install() {
    if (confirming) return;
    confirming = true;
    try {
      // The restart takes every window with it, and a typed commit message lives only in its window.
      // A failed query installs anyway: an update must not be blocked by bookkeeping.
      const drafts = await ipc.commitDrafts().catch(() => [] as string[]);
      if (drafts.length > 0) {
        const ok = await ask(`Installing restarts ${APP_NAME}. The commit message typed in ${drafts.join(", ")} will be lost.`, {
          title: "Install the update",
          kind: "warning",
          cancelLabel: "Cancel",
          okLabel: "Install",
        }).catch(() => false);
        if (!ok) return;
      }
    } finally {
      confirming = false;
    }
    set({ installing: true, progress: null, error: null });
    // Inside the try, so a subscription that rejects still reaches the `finally`: `installing` also
    // disables Close and Esc, and leaving it stuck true strands the whole dialog until a restart.
    let unlisten: (() => void) | undefined;
    try {
      // Attached before the call, the way CloneDialog attaches its op listener: the download starts
      // inside `install_update`, so a subscription made afterwards can miss its first percentages.
      unlisten = await onUpdateProgressReady((progress) => set({ progress }));
      await ipc.installUpdate();
    } catch (e) {
      set({ error: toAppError(e).message });
    } finally {
      // Reached only when the install failed (or refused to take over): the section goes back to
      // being usable, with the message beside the buttons, rather than stuck on a dead progress bar.
      set({ installing: false, progress: null });
      unlisten?.();
    }
  },

  // The check this window failed is answered now, so its message goes, unless an install is running:
  // that message is about the download, not the check.
  learn: (info) => set((s) => (s.installing ? { info, checked: true } : { info, checked: true, error: null })),
}));
