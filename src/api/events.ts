import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { LogProgress } from "./types";

const LOG_PROGRESS = "log://progress";

/** Subscribes to walk progress. Returns an unsubscribe function (safe to call before the listener is attached). */
export function onLogProgress(cb: (p: LogProgress) => void): () => void {
  let unlisten: UnlistenFn | null = null;
  let cancelled = false;
  void listen<LogProgress>(LOG_PROGRESS, (e) => cb(e.payload)).then((fn) => {
    if (cancelled) fn();
    else unlisten = fn;
  });
  return () => {
    cancelled = true;
    unlisten?.();
  };
}
