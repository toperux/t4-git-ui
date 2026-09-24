import { emit, listen, type EventTarget, type UnlistenFn } from "@tauri-apps/api/event";
import { windowLabel } from "../lib/appWindow";
import type { LogProgress, OpEvent, RepoChanged, UpdateInfo } from "./types";

/**
 * Subscribes to a Tauri event. Returns an unsubscribe function (safe to call before the listener is attached).
 * `target` narrows the listener to events addressed to it: a listener without one is `Any`, and `Any`
 * hears every emit — an `emit_to` some other window included (`tauri/src/event/listener.rs`).
 */
function subscribe<T>(name: string, cb: (payload: T) => void, target?: EventTarget): () => void {
  let unlisten: UnlistenFn | null = null;
  let cancelled = false;
  void listen<T>(name, (e) => cb(e.payload), target && { target }).then(
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

/**
 * A preference was written in one window (`settings://changed`). Every window — the one that wrote
 * it included — reloads `settingsStore`, or the others keep a stale theme / diff default.
 */
export const onSettingsChanged = (cb: () => void) => subscribe<null>("settings://changed", () => cb());

/** Tells every window a preference changed; a no-op outside Tauri. */
export function emitSettingsChanged() {
  emit("settings://changed").catch((e: unknown) => console.warn("events: could not emit \"settings://changed\"", e));
}

/**
 * A check came back in some window (`update://checked`), the asking one included. Only the main
 * window checks at launch, so this is how the others learn of a release.
 */
export const onUpdateChecked = (cb: (info: UpdateInfo | null) => void) => subscribe<UpdateInfo | null>("update://checked", cb);

/** Subscribes to an event the backend addresses to this window alone (`emit_to(label, …)`). */
const subscribeHere = <T,>(name: string, cb: (payload: T) => void) => subscribe<T>(name, cb, { kind: "Window", label: windowLabel() });

/**
 * A window `spawn_window` promised could not be built (`tab-spawn-failed`), emitted to the window
 * the tabs came from — which has already let them go, so it takes them back. Every tab the window
 * was to open, not just its active one.
 */
export const onTabSpawnFailed = (cb: (paths: string[]) => void) => subscribeHere<{ paths: string[] }>("tab-spawn-failed", (p) => cb(p.paths));

/**
 * A tab dragged in another window is over this one (`tab-drag-over`): `x` is where it would land, in
 * this window's CSS pixels.
 */
export const onTabDragOver = (cb: (x: number) => void) => subscribeHere<{ x: number; y: number }>("tab-drag-over", (p) => cb(p.x));

/** The drag left this window, or ended (`tab-drag-out`): the drop caret goes. */
export const onTabDragOut = (cb: () => void) => subscribeHere<null>("tab-drag-out", () => cb());

/** A tab was dropped on this window (`tab-adopt`); the backend has already moved the repository's holder here. */
export const onTabAdopt = (cb: (p: { path: string; x: number }) => void) => subscribeHere<{ path: string; x: number }>("tab-adopt", cb);

/**
 * Streamed output of a CLI op (`op://event`), addressed to the window that owns the op: untargeted,
 * a failed push in another window opened this one's dock, and two clones crossed their op ids.
 */
export const onOpEvent = (cb: (p: OpEvent) => void) => subscribeHere<OpEvent>("op://event", cb);

/**
 * `subscribe` for callers that must already be listening when they invoke: it resolves only once the
 * listener is attached, so an event the very command being invoked emits cannot be missed.
 */
async function subscribeReady<T>(name: string, cb: (payload: T) => void, target?: EventTarget): Promise<() => void> {
  try {
    return await listen<T>(name, (e) => cb(e.payload), target && { target });
  } catch {
    // Outside Tauri (tests, a plain browser) there is no event bus.
    return () => {};
  }
}

/** `onOpEvent` awaited: the first event (`started`, which carries the `opId`) must not be missed. */
export const onOpEventReady = (cb: (p: OpEvent) => void) =>
  subscribeReady<OpEvent>("op://event", cb, { kind: "Window", label: windowLabel() });

/**
 * Download percentage of the update being installed (`update://progress`): 0..=100, or `null` while
 * the total size is unknown. Awaited too — the download starts inside `install_update`, so a later
 * subscription loses the first percentages.
 */
export const onUpdateProgressReady = (cb: (percent: number | null) => void) =>
  subscribeReady<number | null>("update://progress", cb);
