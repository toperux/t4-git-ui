// Top-center toast stack. Info / success toasts auto-dismiss after `TOAST_MS`; errors persist
// until the user dismisses them (style guide §3).
import { create } from "zustand";
import type { AppError } from "../api/types";
import { firstDialogField } from "../components/ui/Dialog/Dialog";
import { useDialogStore } from "./dialogStore";

export const TOAST_MS = 6000;
/** Errors never expire on their own, so the stack is capped: the oldest falls off. */
export const MAX_TOASTS = 8;

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  kind: "error" | "success" | "info";
  title: string;
  detail?: string;
  action?: ToastAction;
  /**
   * What had the focus when the failing action started (`busy` has dropped it to `<body>` by the
   * time the toast is pushed). Dismiss and the action give it back. Held as a node: error toasts
   * live until dismissed and zustand state is never serialized.
   */
  origin?: HTMLElement | null;
}

export interface ToastStore {
  toasts: Toast[];
  push(toast: Omit<Toast, "id">): number;
  dismiss(id: number): void;
}

let nextId = 1;

const without = (id: number) => (s: { toasts: Toast[] }) => ({ toasts: s.toasts.filter((t) => t.id !== id) });

/**
 * Puts the focus back where the action that failed started: its `origin` while that is still in the
 * document, else the open dialog's first field (the origin was inside a dialog that has been
 * re-rendered), else nothing — better to leave the focus alone than to move it somewhere arbitrary.
 */
export function restoreFocus(origin: HTMLElement | null | undefined) {
  if (origin?.isConnected) origin.focus();
  else if (useDialogStore.getState().dialog) firstDialogField()?.focus();
}

export const useToastStore = create<ToastStore>()((set, get) => ({
  toasts: [],

  push(toast) {
    const id = nextId++;
    set((s) => {
      const toasts = [...s.toasts, { ...toast, id }];
      if (toasts.length > MAX_TOASTS) {
        // An info must not push an unread error off the screen: the oldest toast that expires by
        // itself goes first, and only a stack of nothing but errors loses its oldest error. Never
        // the one just pushed, whatever its kind.
        const victim = toasts.findIndex((t, i) => t.kind !== "error" && i < toasts.length - 1);
        toasts.splice(victim < 0 ? 0 : victim, 1);
      }
      return { toasts };
    });
    // Expiring on its own must not move the focus — nothing was clicked.
    if (toast.kind !== "error") setTimeout(() => set(without(id)), TOAST_MS);
    return id;
  },

  dismiss(id) {
    // Dismiss and the toast's action both come through here (`ToastStack`), so the focus goes back
    // once, after the toast is gone — a Retry that runs first would toast over its own origin.
    const origin = get().toasts.find((t) => t.id === id)?.origin;
    set(without(id));
    restoreFocus(origin);
  },
}));

/** First stderr line of a `cli` error message (`` `git x` exited with code 1: <stderr> ``). */
export function cliDetail(message: string): string {
  const rest = message.replace(/^`[^`]*` exited with code -?\d+:?\s*/, "");
  return rest.split("\n").find((l) => l.trim()) ?? message;
}

/**
 * Shows `err` as an error toast; `retry` adds a Retry action for `indexLocked`, `origin` the control
 * the focus goes back to once the toast is dismissed (captured when the action started, not here).
 */
export function toastError(err: AppError, title: string, retry?: () => void, origin?: HTMLElement | null) {
  const push = useToastStore.getState().push;
  if (err.kind === "indexLocked") {
    push({
      kind: "error",
      title,
      detail: "Index is locked — another git process is running",
      action: retry && { label: "Retry", onClick: retry },
      origin,
    });
  } else if (err.kind === "cli") {
    push({ kind: "error", title, detail: cliDetail(err.message), origin });
  } else {
    push({ kind: "error", title, detail: err.message, origin });
  }
}
