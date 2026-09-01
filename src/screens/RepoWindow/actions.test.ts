import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOpsStore } from "../../store/opsStore";
import { useRepoStore } from "../../store/repoStore";
import { useToastStore } from "../../store/toastStore";
import { closeRepo, pickAndOpenRepo, switchRepo } from "./actions";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(() => Promise.resolve("/elsewhere")) }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));

import { open as openFolder } from "@tauri-apps/plugin-dialog";

const openRepo = vi.fn(() => Promise.resolve());
const closeRepoStore = vi.fn(() => Promise.resolve());

beforeEach(() => {
  vi.clearAllMocks();
  useRepoStore.setState({
    repo: { id: "r", name: "r", path: "/r", head: { oid: "a", branch: "main", detached: false } },
    openRepo: openRepo as never,
    closeRepo: closeRepoStore as never,
  });
  useToastStore.setState({ toasts: [] });
});

describe("leaving the repository while an operation runs", () => {
  it("refuses switch / open / close with one info toast each, and does nothing else", async () => {
    useOpsStore.setState({ busy: "Fetching slow…" });
    switchRepo("/other");
    await pickAndOpenRepo();
    closeRepo();
    expect(openRepo).not.toHaveBeenCalled();
    expect(closeRepoStore).not.toHaveBeenCalled();
    // No picker either: a folder chosen and then refused is worse than no picker.
    expect(openFolder).not.toHaveBeenCalled();
    const toasts = useToastStore.getState().toasts;
    expect(toasts.map((t) => t.title)).toEqual(["Operation in progress", "Operation in progress", "Operation in progress"]);
    expect(toasts.every((t) => t.kind === "info")).toBe(true);
  });

  it("goes ahead once nothing is running", async () => {
    useOpsStore.setState({ busy: null });
    switchRepo("/other");
    expect(openRepo).toHaveBeenCalledWith("/other");
    await pickAndOpenRepo();
    expect(openRepo).toHaveBeenCalledWith("/elsewhere");
    closeRepo();
    expect(closeRepoStore).toHaveBeenCalled();
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});
