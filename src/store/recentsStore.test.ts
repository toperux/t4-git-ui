import { beforeEach, describe, expect, it, vi } from "vitest";

// No Tauri runtime: the store plugin fails to load and lib/kv falls back to localStorage.
vi.mock("@tauri-apps/plugin-store", () => ({ load: vi.fn(() => Promise.reject(new Error("not in tauri"))) }));

import { capRecents, filterRecents, MAX_UNPINNED, sortRecents, useRecentsStore, type RecentRepo } from "./recentsStore";

const r = (path: string, lastOpened: number, pinned = false): RecentRepo => ({ path, name: path.split(/[\\/]/).pop()!, lastOpened, pinned });
const flush = () => new Promise((res) => setTimeout(res, 0));
const stored = () => JSON.parse(localStorage.getItem("kv:recents") ?? "null") as RecentRepo[] | null;

beforeEach(() => {
  localStorage.clear();
  useRecentsStore.setState({ recents: [], lastOpen: null, lastCloneDir: null, loaded: false });
});

describe("recents helpers", () => {
  it("sorts pinned first, then most recently opened", () => {
    const list = [r("a", 1), r("b", 3), r("c", 2, true), r("d", 5), r("e", 4, true)];
    expect(sortRecents(list).map((x) => x.path)).toEqual(["e", "c", "d", "b", "a"]);
  });

  it("caps unpinned entries at MAX_UNPINNED and keeps every pinned one", () => {
    const list = Array.from({ length: MAX_UNPINNED + 5 }, (_, i) => r(`p${i}`, i));
    list.push(r("pinned-old", -1, true));
    const capped = capRecents(list);
    expect(capped).toHaveLength(MAX_UNPINNED + 1);
    expect(capped[0].path).toBe("pinned-old");
    expect(capped.some((x) => x.path === "p0")).toBe(false); // oldest unpinned dropped
    expect(capped.some((x) => x.path === `p${MAX_UNPINNED + 4}`)).toBe(true);
  });

  it("filters by name or path, case-insensitively", () => {
    const list = [r("C:\\src\\Rust", 1), r("C:\\Users\\me\\dotfiles", 2), r("F:\\work\\GitExtensions", 3)];
    expect(filterRecents(list, "rust").map((x) => x.name)).toEqual(["Rust"]);
    expect(filterRecents(list, "USERS").map((x) => x.name)).toEqual(["dotfiles"]);
    expect(filterRecents(list, "  ")).toBe(list);
  });
});

describe("recentsStore", () => {
  it("migrates localStorage.lastRepo into recents and lastOpen on first load", async () => {
    localStorage.setItem("lastRepo", "C:\\src\\legacy");
    await useRecentsStore.getState().load();
    const st = useRecentsStore.getState();
    expect(st.loaded).toBe(true);
    expect(st.recents.map((x) => x.name)).toEqual(["legacy"]);
    expect(st.lastOpen).toBe("C:\\src\\legacy");
    expect(localStorage.getItem("lastRepo")).toBeNull();
    await flush();
    expect(stored()?.[0].path).toBe("C:\\src\\legacy");
    expect(JSON.parse(localStorage.getItem("kv:lastOpen")!)).toBe("C:\\src\\legacy");
  });

  it("touch moves a repo to the top, keeps its pin, and persists via the fallback backend", async () => {
    useRecentsStore.setState({ recents: sortRecents([r("a", 10, true), r("b", 20)]) });
    useRecentsStore.getState().touch("a", "a");
    useRecentsStore.getState().touch("c");
    const st = useRecentsStore.getState();
    expect(st.recents.map((x) => x.path)).toEqual(["a", "c", "b"]);
    expect(st.recents[0].pinned).toBe(true);
    expect(st.recents[1].name).toBe("c");
    await flush();
    expect(stored()?.map((x) => x.path)).toEqual(["a", "c", "b"]);
  });

  it("remove / togglePin / setLastOpen round-trip through load", async () => {
    useRecentsStore.setState({ recents: [r("a", 1), r("b", 2)] });
    useRecentsStore.getState().remove("b");
    useRecentsStore.getState().togglePin("a");
    useRecentsStore.getState().setLastOpen("a");
    useRecentsStore.getState().setLastCloneDir("C:\\src");
    await flush();
    useRecentsStore.setState({ recents: [], lastOpen: null, lastCloneDir: null, loaded: false });
    await useRecentsStore.getState().load();
    const st = useRecentsStore.getState();
    expect(st.recents).toEqual([{ ...r("a", 1), pinned: true }]);
    expect(st.lastOpen).toBe("a");
    expect(st.lastCloneDir).toBe("C:\\src");
  });
});
