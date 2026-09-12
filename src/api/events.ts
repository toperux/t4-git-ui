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
    // Outside Tauri (tests, a plain browser) there is no event bus: the app runs without live
    // updates. Inside it, this is why the UI stopped refreshing itself — say which event was lost.
    (e: unknown) => console.warn(`events: could not listen to "${name}"`, e),
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
 * `subscribe` for callers that must already be listening when they invoke: it resolves only once the
 * listener is attached, so an event the very command being invoked emits cannot be missed.
 */
async function subscribeReady<T>(name: string, cb: (payload: T) => void): Promise<() => void> {
  try {
    return await listen<T>(name, (e) => cb(e.payload));
  } catch {
    // Outside Tauri (tests, a plain browser) there is no event bus.
    return () => {};
  }
}

/** `onOpEvent` awaited: the first event (`started`, which carries the `opId`) must not be missed. */
export const onOpEventReady = (cb: (p: OpEvent) => void) => subscribeReady<OpEvent>("op://event", cb);

/**
 * Download percentage of the update being installed (`update://progress`): 0..=100, or `null` while
 * the total size is unknown. Awaited too — the download starts inside `install_update`, so a later
 * subscription loses the first percentages.
 */
export const onUpdateProgressReady = (cb: (percent: number | null) => void) =>
  subscribeReady<number | null>("update://progress", cb);
