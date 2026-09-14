import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefsSnapshot, Stash, StatusEntry } from "../../../api/types";
import { useDialogStore } from "../../../store/dialogStore";
import { useDiffStore } from "../../../store/diffStore";
import { useOpsStore } from "../../../store/opsStore";
import { __resetForTests as resetRepo, useRepoStore } from "../../../store/repoStore";
import { useStatusStore } from "../../../store/statusStore";
import { useCommitSync } from "../CommitPanel/CommitPanel";
import { StashPushDialog } from "./StashDialogs";
import { StashesDialog } from "./StashesDialog";

const ok = { opId: "1", code: 0, conflicts: [], failure: null };
vi.mock("../../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/ipc")>();
  return {
    ...actual,
    getChangedFiles: vi.fn(() => Promise.resolve([])),
    getFileDiff: vi.fn(() => new Promise(() => {})),
    getAuthor: vi.fn(() => Promise.resolve({ name: "Ada", email: "ada@x" })),
    stashApply: vi.fn(() => Promise.resolve(ok)),
    stashPop: vi.fn(() => Promise.resolve(ok)),
    stashDrop: vi.fn(() => Promise.resolve(ok)),
    stashClear: vi.fn(() => Promise.resolve(ok)),
    stashPush: vi.fn(() => Promise.resolve(ok)),
  };
});
const ask = vi.hoisted(() => vi.fn((_message: string, _options?: unknown) => Promise.resolve(true)));
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask, open: vi.fn() }));
// jsdom has no ResizeObserver: flatten the resizable layout.
vi.mock("react-resizable-panels", () => ({
  Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Separator: () => null,
}));

import * as ipc from "../../../api/ipc";

const stash = (index: number, message: string, hasUntracked = false): Stash => ({ index, oid: `s${index}`, message, baseOid: "a", time: 1_700_000_000, hasUntracked });
const STASHES = [stash(0, "WIP on main", true), stash(1, "WIP on feature")];

const refs = (stashes: Stash[]): RefsSnapshot => ({
  head: { oid: "a", branch: "main", detached: false },
  state: "clean",
  local: [],
  remotes: [],
  tags: [],
  stashes,
});

const entry = (path: string, patch: Partial<StatusEntry> = {}): StatusEntry => ({
  path,
  oldPath: null,
  index: null,
  workdir: "modified",
  conflicted: false,
  submodule: false,
  submoduleDirtyOnly: false,
  workdirStamp: null,
  ...patch,
});
/** A dirty tree the stash surfaces read through `useStashFiles`. */
const dirty = (...entries: StatusEntry[]) =>
  useStatusStore.setState({ status: { entries, staged: 0, unstaged: entries.length, untracked: 0, conflicted: 0, state: "clean" } });

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  resetRepo();
  useDialogStore.setState({ dialog: null, returnFocus: null });
  useOpsStore.setState({ busy: null });
  useDiffStore.setState({ files: [], filesLoading: false, filesError: null, selectedPath: null, diff: null, tab: "changes" });
  useStatusStore.setState({ status: null });
  useRepoStore.setState({ repo: { id: "r", name: "r", path: "/r", head: { oid: "a", branch: "main", detached: false } }, refs: refs(STASHES) });
});

/** What `RepoWindow` does above the browser: feed the status into the commit store its panels read. */
function Synced({ children }: { children: React.ReactNode }) {
  useCommitSync(true);
  return children;
}
const open = () =>
  render(
    <Synced>
      <StashesDialog onClose={() => {}} />
    </Synced>,
  );
/** The stash rows — the working tree sits above them in the same listbox. */
const rows = (view: ReturnType<typeof render>) => view.getAllByRole("option").slice(1);
const wtRow = (view: ReturnType<typeof render>) => view.getAllByRole("option")[0];

describe("StashesDialog", () => {
  it("lists every entry with its age and untracked mark, and previews stash@{0} on open", () => {
    const view = open();
    expect(rows(view).map((r) => r.getAttribute("title"))).toEqual(["stash@{0}: WIP on main", "stash@{1}: WIP on feature"]);
    expect(view.getByTitle("Includes untracked files")).toBeTruthy();
    expect(useRepoStore.getState().preview).toEqual(STASHES[0]);
    expect(rows(view)[0].getAttribute("aria-selected")).toBe("true");
  });

  it("opens on stash@{0} when the tree is clean", () => {
    const view = open();
    expect(view.getByRole("button", { name: "Apply" })).toBeTruthy();
    expect(wtRow(view).getAttribute("aria-selected")).toBe(null);
  });

  it("previews the row that is clicked, and ↑/↓ move the preview", () => {
    const view = open();
    fireEvent.click(rows(view)[1]);
    expect(useRepoStore.getState().preview).toEqual(STASHES[1]);
    fireEvent.keyDown(view.getByRole("listbox", { name: "Stashes" }), { key: "ArrowUp" });
    expect(useRepoStore.getState().preview).toEqual(STASHES[0]);
  });

  it("the Working tree row swaps the controls and the panels", () => {
    dirty(entry("a.txt"));
    const view = open();
    expect(wtRow(view).getAttribute("aria-selected")).toBe("true");
    expect(view.getByLabelText("Message")).toBeTruthy();
    expect(view.queryByRole("button", { name: "Apply" })).toBe(null);
    expect(view.getByText("Unstaged")).toBeTruthy();

    fireEvent.click(rows(view)[0]);
    expect(view.getByRole("button", { name: "Apply" })).toBeTruthy();
    expect(view.queryByLabelText("Message")).toBe(null);
    expect(view.queryByText("Unstaged")).toBe(null);

    fireEvent.keyDown(view.getByRole("listbox", { name: "Stashes" }), { key: "ArrowUp" });
    expect(wtRow(view).getAttribute("aria-selected")).toBe("true");
  });

  it("follows the untracked box", () => {
    dirty(entry("a.txt"), entry("new.txt", { workdir: "untracked" }));
    const view = open();
    expect(view.getByRole("button", { name: "Stash 2 files" })).toBeTruthy();
    fireEvent.click(view.getByLabelText("Include untracked files"));
    expect(view.getByRole("button", { name: "Stash 1 file" })).toBeTruthy();
  });

  it("applies, pops and drops the previewed entry", async () => {
    const view = open();
    fireEvent.click(rows(view)[1]);
    fireEvent.click(view.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(ipc.stashApply).toHaveBeenCalledWith("r", 1));
    fireEvent.click(view.getByRole("button", { name: "Pop" }));
    await waitFor(() => expect(ipc.stashPop).toHaveBeenCalledWith("r", 1));
  });

  it("Delete on the list drops the previewed entry, once the confirmation is accepted", async () => {
    const view = open();
    fireEvent.keyDown(view.getByRole("listbox", { name: "Stashes" }), { key: "Delete" });
    expect(ask).toHaveBeenCalledWith(`Drop stash@{0} "WIP on main"? This cannot be undone.`, expect.objectContaining({ title: "Drop stash" }));
    await waitFor(() => expect(ipc.stashDrop).toHaveBeenCalledWith("r", 0));
  });

  it("Clear all names the count and clears once confirmed", async () => {
    const view = open();
    fireEvent.click(view.getByRole("button", { name: "Clear all…" }));
    expect(ask).toHaveBeenCalledWith("Drop all 2 stashes? This cannot be undone.", expect.objectContaining({ title: "Clear stashes" }));
    await waitFor(() => expect(ipc.stashClear).toHaveBeenCalledWith("r"));
  });

  it("moves the preview to the entry that took its place once one is gone", () => {
    const view = open();
    fireEvent.click(rows(view)[1]);
    // A pop / drop clears the preview and the refs refresh brings one entry back.
    act(() => useRepoStore.setState({ preview: null, refs: refs([stash(0, "WIP on main", true)]) }));
    expect(useRepoStore.getState().preview).toEqual(stash(0, "WIP on main", true));
  });

  it("lands on the working tree once the last entry is gone", () => {
    const view = open();
    fireEvent.click(rows(view)[0]);
    expect(wtRow(view).getAttribute("aria-selected")).toBeNull();
    act(() => useRepoStore.setState({ preview: null, refs: refs([]) }));
    expect(wtRow(view).getAttribute("aria-selected")).toBe("true");
    expect(view.getByLabelText("Message")).toBeTruthy();
  });

  it("stashes nothing while there is nothing to stash", async () => {
    const clean = open();
    fireEvent.click(wtRow(clean));
    const button = () => document.querySelector<HTMLButtonElement>('button[title="No changes"]')!;
    expect(button().disabled).toBe(true);
    expect(button().textContent).toBe("Stash");

    cleanup();
    dirty(entry("a.txt"));
    const view = open();
    expect(wtRow(view).getAttribute("aria-selected")).toBe("true");
    fireEvent.change(view.getByLabelText("Message"), { target: { value: "later" } });
    fireEvent.click(view.getByRole("button", { name: "Stash 1 file" }));
    await waitFor(() => expect(ipc.stashPush).toHaveBeenCalledWith("r", "later", true, false));

    // The entry it made is what the list previews once the refs refresh brings it.
    const fresh = { ...stash(0, "later"), oid: "fresh" };
    act(() => useRepoStore.setState({ refs: refs([fresh, ...STASHES.map((st) => ({ ...st, index: st.index + 1 }))]) }));
    expect(useRepoStore.getState().preview).toEqual(fresh);
    expect(wtRow(view).getAttribute("aria-selected")).toBeNull();
    expect(view.getByRole("button", { name: "Apply" })).toBeTruthy();
  });
});

describe("StashPushDialog", () => {
  const push = () => render(<StashPushDialog onClose={() => {}} />);
  const files = (view: ReturnType<typeof render>) => within(view.getByRole("list", { name: "Files to stash" })).getAllByRole("listitem");

  it("lists what the push will take, and follows the untracked box", () => {
    dirty(entry("a.txt"), entry("b.txt", { index: "added", workdir: null }), entry("new.txt", { workdir: "untracked" }));
    const view = push();
    expect(files(view)).toHaveLength(3);
    expect(view.getByRole("button", { name: "Stash 3 files" })).toBeTruthy();

    fireEvent.click(view.getByLabelText("Include untracked files"));
    expect(files(view)).toHaveLength(2);
    expect(view.queryByText("new.txt")).toBe(null);
    expect(view.getByRole("button", { name: "Stash 2 files" })).toBeTruthy();
  });

  it("pushes what it listed", async () => {
    dirty(entry("a.txt"));
    const view = push();
    fireEvent.click(view.getByLabelText("Include untracked files"));
    fireEvent.click(view.getByRole("button", { name: "Stash 1 file" }));
    await waitFor(() => expect(ipc.stashPush).toHaveBeenCalledWith("r", null, false, false));
  });

  it("says so and refuses on a clean tree", () => {
    const view = push();
    expect(view.getByText("Nothing to stash")).toBeTruthy();
    const button = view.getByRole("button", { name: "Stash" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(ipc.stashPush).not.toHaveBeenCalled();
  });

  it("refuses while a conflict is unresolved: git will not write the index", () => {
    useStatusStore.setState({
      status: { entries: [entry("a.txt"), entry("f", { conflicted: true })], staged: 0, unstaged: 1, untracked: 0, conflicted: 1, state: "merge" },
    });
    const view = push();
    expect(view.getByText("Resolve conflicts first")).toBeTruthy();
    expect(view.queryByText("a.txt")).toBe(null);
    expect((view.getByRole("button", { name: "Stash" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
