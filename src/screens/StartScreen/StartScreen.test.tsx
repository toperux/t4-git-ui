import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpEvent } from "../../api/types";

const events = vi.hoisted(() => ({ opCb: null as ((e: OpEvent) => void) | null }));

vi.mock("@tauri-apps/plugin-store", () => ({ load: vi.fn(() => Promise.reject(new Error("not in tauri"))) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/api/path", () => ({ homeDir: vi.fn(() => Promise.resolve("C:\\Users\\me\\")) }));
vi.mock("../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/ipc")>();
  const pending = () => new Promise<never>(() => {});
  return {
    ...actual,
    openRepo: vi.fn(),
    getRefs: vi.fn(pending),
    startLog: vi.fn(pending),
    cancelOp: vi.fn(() => Promise.resolve(true)),
    cloneRepo: vi.fn(pending),
    initRepo: vi.fn(),
  };
});
vi.mock("../../api/events", () => ({
  onOpEvent: vi.fn((cb: (e: OpEvent) => void) => {
    events.opCb = cb;
    return () => {};
  }),
  // `CloneDialog` awaits this before invoking `clone_repo`, so the `started` event can't be missed.
  onOpEventReady: vi.fn((cb: (e: OpEvent) => void) => {
    events.opCb = cb;
    return Promise.resolve(() => {});
  }),
}));

import * as ipc from "../../api/ipc";
import { sortRecents, useRecentsStore } from "../../store/recentsStore";
import { useRepoStore } from "../../store/repoStore";
import { StartScreen } from "./StartScreen";

const NOW = Date.now();

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  events.opCb = null;
  useRepoStore.setState({ repo: null, gitVersion: "git version 2.55.0" });
  useRecentsStore.setState({
    recents: sortRecents([
      { path: "F:\\src\\rust", name: "rust", lastOpened: NOW - 3 * 3600_000, pinned: false },
      { path: "F:\\src\\t4-git-ui", name: "t4-git-ui", lastOpened: NOW - 2 * 3600_000, pinned: true },
      { path: "C:\\Users\\me\\dotfiles", name: "dotfiles", lastOpened: NOW - 26 * 3600_000, pinned: false },
    ]),
    lastCloneDir: null,
    loaded: true,
  });
});

describe("StartScreen", () => {
  it("lists recents pinned-first and Enter opens the selected one", () => {
    const { getAllByRole, getByRole, container } = render(<StartScreen />);
    const rows = getAllByRole("option");
    // Each row shows its name and full path (the path is also its tooltip).
    expect(rows.map((r) => r.getAttribute("title"))).toEqual(["F:\\src\\t4-git-ui", "F:\\src\\rust", "C:\\Users\\me\\dotfiles"]);
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining("t4-git-ui"), expect.stringContaining("rust"), expect.stringContaining("dotfiles")]);
    expect(rows[0].getAttribute("aria-selected")).toBe("true");
    expect(container.textContent).toContain("3 recent");
    expect(container.textContent).toContain("git 2.55.0");

    const list = getByRole("listbox", { name: "Recent repositories" });
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "Enter" });
    expect(ipc.openRepo).toHaveBeenCalledWith("F:\\src\\rust");
  });

  it("pinning marks the row right away, not only after a restart", () => {
    const { getAllByRole } = render(<StartScreen />);
    const pins = () => getAllByRole("option").map((r) => r.querySelector("button")!);
    // Only the pinned row's pin is drawn at rest — the rest appear on hover.
    expect(pins().map((b) => b.getAttribute("aria-label"))).toEqual(["Unpin", "Pin to top", "Pin to top"]);
    expect(pins()[0].querySelector("svg")?.getAttribute("fill")).toBe("currentColor");

    // Pinning "rust" keeps it behind the pinned repo opened more recently, but marks it at once.
    fireEvent.click(pins()[1]);
    expect(getAllByRole("option").map((r) => r.getAttribute("title"))).toEqual(["F:\\src\\t4-git-ui", "F:\\src\\rust", "C:\\Users\\me\\dotfiles"]);
    expect(pins()[1].getAttribute("aria-pressed")).toBe("true");
    expect(pins()[1].getAttribute("aria-label")).toBe("Unpin");
    expect(pins()[1].querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
    expect(useRecentsStore.getState().recents.find((r) => r.name === "rust")?.pinned).toBe(true);
  });

  it("removes a row with the mouse (the X button), without opening it", () => {
    const { getAllByRole } = render(<StartScreen />);
    fireEvent.click(getAllByRole("button", { name: "Remove from list" })[1]);
    expect(useRecentsStore.getState().recents.map((r) => r.name)).toEqual(["t4-git-ui", "dotfiles"]);
    expect(ipc.openRepo).not.toHaveBeenCalled();
  });

  it("filter narrows the list from the input; Delete removes the selected row", () => {
    const { getByRole, getAllByRole, queryAllByRole } = render(<StartScreen />);
    const input = getByRole("textbox", { name: "Filter repositories" });
    fireEvent.change(input, { target: { value: "RUST" } });
    expect(getAllByRole("option")).toHaveLength(1);
    fireEvent.keyDown(input, { key: "Delete" });
    expect(queryAllByRole("option")).toHaveLength(0);
    expect(useRecentsStore.getState().recents.map((r) => r.name)).toEqual(["t4-git-ui", "dotfiles"]);
  });

  it("Delete with the caret mid-text edits the filter instead of removing the row", () => {
    const { getByRole, getAllByRole } = render(<StartScreen />);
    const input = getByRole("textbox", { name: "Filter repositories" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "RUST" } });
    input.setSelectionRange(0, 0);
    const ev = fireEvent.keyDown(input, { key: "Delete" });
    expect(ev).toBe(true); // not preventDefault-ed: the browser forward-deletes
    expect(getAllByRole("option")).toHaveLength(1);
    expect(useRecentsStore.getState().recents).toHaveLength(3);
  });

  it("the gear opens Settings, and closing it puts the dialog away", () => {
    const { getAllByRole, getByRole, queryByRole } = render(<StartScreen />);
    fireEvent.click(getByRole("button", { name: "Settings" }));
    expect(getByRole("dialog", { name: "Settings" })).toBeTruthy();
    // Title-bar X and the footer button share the name; the footer one is last.
    const closers = getAllByRole("button", { name: "Close" });
    fireEvent.click(closers[closers.length - 1]);
    expect(queryByRole("dialog", { name: "Settings" })).toBeNull();
  });

  it("clone dialog derives the folder name, runs clone_repo and shows the latest progress line", async () => {
    const { getByRole, findByRole, getByText } = render(<StartScreen />);
    fireEvent.click(getByRole("button", { name: /^Clone…/ }));
    const dialog = await findByRole("dialog", { name: "Clone repository" });
    const url = getByRole("textbox", { name: "URL" });
    fireEvent.change(url, { target: { value: "https://github.com/x/repo.git" } });
    expect((getByRole("textbox", { name: "Folder name" }) as HTMLInputElement).value).toBe("repo");
    // Default parent = parent of the most recent (pinned first) repo.
    expect(dialog.textContent).toContain("Clones into F:\\src\\repo");

    // The op subscription is awaited before the invoke, so let the submit's microtasks run.
    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Clone" }));
    });
    expect(ipc.cloneRepo).toHaveBeenCalledWith({ url: "https://github.com/x/repo.git", dest: "F:\\src\\repo", recurseSubmodules: false, depth: undefined });
    expect(events.opCb).not.toBeNull();
    act(() => {
      events.opCb!({ repoId: null as unknown as string, opId: "op1", event: { kind: "started", opId: "op1", cmd: "git clone" } });
      events.opCb!({ repoId: null as unknown as string, opId: "op1", event: { kind: "progress", line: "Receiving objects:  58% (7/12)" } });
    });
    expect(getByText((t) => t.replace(/\s+/g, " ") === "Receiving objects: 58% (7/12)")).toBeTruthy();

    fireEvent.click(getByRole("button", { name: "Cancel" }));
    expect(ipc.cancelOp).toHaveBeenCalledWith("op1");
  });
});
