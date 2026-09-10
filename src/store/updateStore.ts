// The update check and the install that follows it. Both live here rather than in the dialog because
// the badge beside the Settings gear reads the same answer, on both screens. A successful install
// never comes back — the app restarts into the new version — so only its failures land in `error`.
import { create } from "zustand";
import { onUpdateProgressReady } from "../api/events";
import * as ipc from "../api/ipc";
import { toAppError } from "../api/ipc";
import type { UpdateInfo } from "../api/types";

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
    set({ installing: true, progress: null, error: null });
    // Attached before the call, the way CloneDialog attaches its op listener: the download starts
    // inside `install_update`, so a subscription made afterwards can miss its first percentages.
    const unlisten = await onUpdateProgressReady((progress) => set({ progress }));
    try {
      await ipc.installUpdate();
    } catch (e) {
      set({ error: toAppError(e).message });
    } finally {
      // Reached only when the install failed (or refused to take over): the section goes back to
      // being usable, with the message beside the buttons, rather than stuck on a dead progress bar.
      set({ installing: false, progress: null });
      unlisten();
    }
  },
}));
