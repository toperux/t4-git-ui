import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { LogProgress, OpEvent, RepoChanged } from "./types";

/** Subscribes to a Tauri event. Returns an unsubscribe function (safe to call before the listener is attached). */
function subscribe<T>(name: string, cb: (payload: T) => void): () => void {
  let unlisten: UnlistenFn | null = null;
  let cancelled = false;
  void listen<T>(name, (e) => cb(e.payload)).then(
    (fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    },
    // Outside Tauri (tests, a plain browser) there is no event bus: the app runs without live updates.
    () => {},
  );
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

/** Walk progress (`log://progress`). */
export const onLogProgress = (cb: (p: LogProgress) => void) => subscribe<LogProgress>("log://progress", cb);

/** Working tree / index / refs changed (`repo://changed`). */
export const onRepoChanged = (cb: (p: RepoChanged) => void) => subscribe<RepoChanged>("repo://changed", cb);

/** Streamed output of a CLI op (`op://event`). */
export const onOpEvent = (cb: (p: OpEvent) => void) => subscribe<OpEvent>("op://event", cb);

/**
 * `onOpEvent` that resolves only once the listener is attached — use it before invoking a command
 * whose very first event (`started`, which carries the `opId`) must not be missed.
 */
export async function onOpEventReady(cb: (p: OpEvent) => void): Promise<() => void> {
  try {
    return await listen<OpEvent>("op://event", (e) => cb(e.payload));
  } catch {
    // Outside Tauri (tests, a plain browser) there is no event bus.
    return () => {};
  }
}
