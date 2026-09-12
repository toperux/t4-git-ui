// Top-center toast stack. Info / success toasts auto-dismiss after `TOAST_MS`; errors persist
// until the user dismisses them (style guide §3).
import { create } from "zustand";
import type { AppError } from "../api/types";

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
}

export interface ToastStore {
  toasts: Toast[];
  push(toast: Omit<Toast, "id">): number;
  dismiss(id: number): void;
}

let nextId = 1;

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
    if (toast.kind !== "error") setTimeout(() => get().dismiss(id), TOAST_MS);
    return id;
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** First stderr line of a `cli` error message (`` `git x` exited with code 1: <stderr> ``). */
export function cliDetail(message: string): string {
  const rest = message.replace(/^`[^`]*` exited with code -?\d+:?\s*/, "");
  return rest.split("\n").find((l) => l.trim()) ?? message;
}

/** Shows `err` as an error toast; `retry` adds a Retry action for `indexLocked`. */
export function toastError(err: AppError, title: string, retry?: () => void) {
  const push = useToastStore.getState().push;
  if (err.kind === "indexLocked") {
    push({
      kind: "error",
      title,
      detail: "Index is locked — another git process is running",
      action: retry && { label: "Retry", onClick: retry },
    });
  } else if (err.kind === "cli") {
    push({ kind: "error", title, detail: cliDetail(err.message) });
  } else {
    push({ kind: "error", title, detail: err.message });
  }
}
