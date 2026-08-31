// Recent repositories + start-up state, persisted through lib/kv (store plugin `recents.json`).
// `recents` is kept sorted (pinned first, then most recently opened) so views render it as is.
import { create } from "zustand";
import { kvGet, kvSet } from "../lib/kv";
import { baseName } from "../lib/paths";

export interface RecentRepo {
  path: string;
  name: string;
  /** Unix ms. */
  lastOpened: number;
  pinned: boolean;
}

/** Unpinned entries kept; pinned ones never count. */
export const MAX_UNPINNED = 20;

/** M1 persisted only the last repository here; folded into `recents` on the first load. */
const LEGACY_KEY = "lastRepo";

export interface RecentsStore {
  recents: RecentRepo[];
  /** Repository open at last exit (auto-reopened on start); `null` after an explicit close. */
  lastOpen: string | null;
  /** Parent folder of the last clone. */
  lastCloneDir: string | null;
  loaded: boolean;

  load(): Promise<void>;
  /** Records a successful open (moves `path` to the top, capping unpinned entries). */
  touch(path: string, name?: string): void;
  remove(path: string): void;
  togglePin(path: string): void;
  setLastOpen(path: string | null): void;
  setLastCloneDir(dir: string): void;
}

/** Pinned first, then most recently opened. */
export function sortRecents(list: RecentRepo[]): RecentRepo[] {
  return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastOpened - a.lastOpened);
}

/** Sorted, with the oldest unpinned entries beyond `max` dropped. */
export function capRecents(list: RecentRepo[], max = MAX_UNPINNED): RecentRepo[] {
  let unpinned = 0;
  return sortRecents(list).filter((r) => r.pinned || ++unpinned <= max);
}

/** Case-insensitive substring match on name or path; blank text keeps everything. */
export function filterRecents(list: RecentRepo[], text: string): RecentRepo[] {
  const q = text.trim().toLowerCase();
  if (!q) return list;
  return list.filter((r) => r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q));
}

export const useRecentsStore = create<RecentsStore>()((set, get) => {
  function update(recents: RecentRepo[]) {
    const capped = capRecents(recents);
    set({ recents: capped });
    void kvSet("recents", capped);
  }

  return {
    recents: [],
    lastOpen: null,
    lastCloneDir: null,
    loaded: false,

    async load() {
      const [stored, lastOpen, lastCloneDir] = await Promise.all([
        kvGet<RecentRepo[]>("recents"),
        kvGet<string | null>("lastOpen"),
        kvGet<string | null>("lastCloneDir"),
      ]);
      let recents = stored ?? [];
      let open = lastOpen ?? null;
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        localStorage.removeItem(LEGACY_KEY);
        if (!recents.some((r) => r.path === legacy)) {
          recents = [...recents, { path: legacy, name: baseName(legacy), lastOpened: Date.now(), pinned: false }];
        }
        open ??= legacy;
      }
      set({ recents: capRecents(recents), lastOpen: open, lastCloneDir: lastCloneDir ?? null, loaded: true });
      if (legacy) {
        void kvSet("recents", get().recents);
        void kvSet("lastOpen", open);
      }
    },

    touch(path, name = baseName(path)) {
      const rest = get().recents.filter((r) => r.path !== path);
      const prev = get().recents.find((r) => r.path === path);
      update([...rest, { path, name, lastOpened: Date.now(), pinned: prev?.pinned ?? false }]);
    },

    remove: (path) => update(get().recents.filter((r) => r.path !== path)),

    togglePin: (path) => update(get().recents.map((r) => (r.path === path ? { ...r, pinned: !r.pinned } : r))),

    setLastOpen(lastOpen) {
      set({ lastOpen });
      void kvSet("lastOpen", lastOpen);
    },

    setLastCloneDir(lastCloneDir) {
      set({ lastCloneDir });
      void kvSet("lastCloneDir", lastCloneDir);
    },
  };
});
