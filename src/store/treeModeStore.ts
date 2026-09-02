// The commit file lists flat or nested by folder. One value for every mount — the panel keeps showing
// behind the commit dialog, and a toggle in either must move both — persisted in
// `localStorage.commitFileListMode`.
import { create } from "zustand";

const KEY = "commitFileListMode";

const read = () => {
  try {
    return localStorage.getItem(KEY) === "tree";
  } catch {
    return false;
  }
};

interface TreeModeStore {
  tree: boolean;
  toggle(): void;
}

export const useTreeModeStore = create<TreeModeStore>()((set, get) => ({
  tree: read(),
  toggle() {
    const tree = !get().tree;
    try {
      localStorage.setItem(KEY, tree ? "tree" : "flat");
    } catch {
      // Storage unavailable: the choice just doesn't persist.
    }
    set({ tree });
  },
}));

/** `[tree, toggle]` for both lists. */
export function useTreeMode(): [boolean, () => void] {
  return [useTreeModeStore((st) => st.tree), useTreeModeStore((st) => st.toggle)];
}

/** Re-reads the stored preference, as a fresh launch would. */
export function __resetForTests() {
  useTreeModeStore.setState({ tree: read() });
}
