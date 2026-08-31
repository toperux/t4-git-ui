// One modal dialog at a time. `DialogHost` (RepoWindow/dialogs) renders the component for `dialog.kind`.
import { create } from "zustand";

export type DialogSpec =
  | { kind: "push"; branch?: string }
  | { kind: "pull" }
  | { kind: "fetch" }
  | { kind: "merge"; branch?: string }
  | { kind: "rebase"; onto?: string }
  | { kind: "checkout" }
  /** `startPoint` = ref name / oid preselected as the start point (default HEAD). */
  | { kind: "createBranch"; startPoint?: string }
  | { kind: "deleteBranch"; name: string }
  | { kind: "renameBranch"; name: string }
  | { kind: "createTag"; target?: string }
  | { kind: "deleteTag"; name: string }
  | { kind: "deleteRemoteBranch"; remote: string; name: string }
  | { kind: "stashPush" }
  /** Apply / Pop / Drop of one stash. */
  | { kind: "stash"; index: number; message: string };

export type DialogKind = DialogSpec["kind"];

export interface DialogStore {
  dialog: DialogSpec | null;
  open(spec: DialogSpec): void;
  close(): void;
}

export const useDialogStore = create<DialogStore>()((set) => ({
  dialog: null,
  open: (dialog) => set({ dialog }),
  close: () => set({ dialog: null }),
}));
