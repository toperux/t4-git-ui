// One modal dialog at a time. `DialogHost` (RepoWindow/dialogs) renders the component for `dialog.kind`.
import { create } from "zustand";

export type DialogSpec =
  | { kind: "push"; branch?: string }
  | { kind: "pull" }
  | { kind: "fetch" }
  | { kind: "runCommand" }
  /** App preferences (git executable, theme, diff defaults). */
  | { kind: "settings" }
  /** The commit panel as a full-window dialog (Unstaged / Staged / Message stacked | Diff). */
  | { kind: "commit" }
  /** The details pane's files + diff as a full-window dialog (the selected commit or compare). */
  | { kind: "diff" }
  | { kind: "merge"; branch?: string }
  | { kind: "rebase"; onto?: string }
  /** Edit git's own `rebase -i` todo before it runs; `ontoLabel` names the branch when it came from the Rebase dialog. */
  | { kind: "rebaseInteractive"; base: string; ontoLabel?: string }
  /** Cherry-pick / revert one commit from its row; `parents` decides whether a mainline is asked for. */
  | { kind: "cherryPick" | "revert"; oid: string; short: string; summary: string; parents: string[] }
  | { kind: "checkout" }
  /**
   * Pick one of several branches sitting at a commit. A remote one (`remote` set) is checked out
   * as a new tracking local branch of the same short name.
   */
  | { kind: "checkoutBranch"; branches: { name: string; remote: string | null }[] }
  /** Reset the current branch (or a detached HEAD) to `target` (an oid or a ref name). */
  | { kind: "reset"; target: string }
  /** Move a branch that is not checked out to `target` (`git branch -f`). */
  | { kind: "resetBranch"; branch: string; target: string }
  /** `startPoint` = ref name / oid preselected as the start point (default HEAD). */
  | { kind: "createBranch"; startPoint?: string }
  | { kind: "deleteBranch"; name: string }
  | { kind: "renameBranch"; name: string }
  | { kind: "createTag"; target?: string }
  | { kind: "deleteTag"; name: string }
  | { kind: "pushTag"; name: string }
  /** `remote` preselects it (a remote tag row knows which one); the default remote otherwise. */
  | { kind: "deleteRemoteTag"; name: string; remote?: string }
  | { kind: "deleteRemoteBranch"; remote: string; name: string }
  | { kind: "addRemote" }
  | { kind: "renameRemote"; name: string }
  /** `url` is the remote's current fetch URL, `null` when it has none configured. */
  | { kind: "setRemoteUrl"; name: string; url: string | null }
  | { kind: "removeRemote"; name: string }
  | { kind: "stashPush" }
  /** Apply / Pop / Drop of one stash. */
  | { kind: "stash"; index: number; message: string };

export type DialogKind = DialogSpec["kind"];

export interface OpenOptions {
  /**
   * Where focus goes when the dialog closes. Menus / context menus pass their anchor: the item that
   * was clicked unmounts in the same commit, so `document.activeElement` is already `<body>` by then.
   */
  returnFocusTo?: HTMLElement | null;
}

export interface DialogStore {
  dialog: DialogSpec | null;
  /** Focus target for the open dialog (`null` = whatever had focus when it mounted). */
  returnFocus: HTMLElement | null;
  open(spec: DialogSpec, opts?: OpenOptions): void;
  close(): void;
}

export const useDialogStore = create<DialogStore>()((set) => ({
  dialog: null,
  returnFocus: null,
  open: (dialog, opts) => set({ dialog, returnFocus: opts?.returnFocusTo ?? null }),
  close: () => set({ dialog: null, returnFocus: null }),
}));
