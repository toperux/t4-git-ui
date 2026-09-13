import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefsSnapshot, Stash } from "../../../api/types";
import { useDialogStore } from "../../../store/dialogStore";
import { useDiffStore } from "../../../store/diffStore";
import { useOpsStore } from "../../../store/opsStore";
import { __resetForTests as resetRepo, useRepoStore } from "../../../store/repoStore";
import { useStatusStore } from "../../../store/statusStore";
import { StashesDialog } from "./StashesDialog";

const ok = { opId: "1", code: 0, conflicts: [], failure: null };
vi.mock("../../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/ipc")>();
  return {
    ...actual,
    getChangedFiles: vi.fn(() => Promise.resolve([])),
    getFileDiff: vi.fn(() => new Promise(() => {})),
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

const open = () => render(<StashesDialog onClose={() => {}} />);
const rows = (view: ReturnType<typeof render>) => view.getAllByRole("option");

describe("StashesDialog", () => {
  it("lists every entry with its age and untracked mark, and previews stash@{0} on open", () => {
    const view = open();
    expect(rows(view).map((r) => r.getAttribute("title"))).toEqual(["stash@{0}: WIP on main", "stash@{1}: WIP on feature"]);
    expect(view.getByTitle("Includes untracked files")).toBeTruthy();
    expect(useRepoStore.getState().preview).toEqual(STASHES[0]);
    expect(rows(view)[0].getAttribute("aria-selected")).toBe("true");
  });

  it("previews the row that is clicked, and ↑/↓ move the preview", () => {
    const view = open();
    fireEvent.click(rows(view)[1]);
    expect(useRepoStore.getState().preview).toEqual(STASHES[1]);
    fireEvent.keyDown(view.getByRole("listbox", { name: "Stashes" }), { key: "ArrowUp" });
    expect(useRepoStore.getState().preview).toEqual(STASHES[0]);
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

  it("stashes nothing while there is nothing to stash", async () => {
    open();
    const button = () => document.querySelector<HTMLButtonElement>('button[title="No changes"]')!;
    expect(button().disabled).toBe(true);

    cleanup();
    useStatusStore.setState({ status: { entries: [], staged: 1, unstaged: 0, conflicted: 0, untracked: 0, state: "clean" } });
    const view = open();
    fireEvent.change(view.getByLabelText("Message"), { target: { value: "later" } });
    fireEvent.click(view.getAllByRole("button", { name: "Stash" })[0]);
    await waitFor(() => expect(ipc.stashPush).toHaveBeenCalledWith("r", "later", true, false));

    // The entry it made is what the list previews once the refs refresh brings it.
    const fresh = { ...stash(0, "later"), oid: "fresh" };
    act(() => useRepoStore.setState({ refs: refs([fresh, ...STASHES.map((st) => ({ ...st, index: st.index + 1 }))]) }));
    expect(useRepoStore.getState().preview).toEqual(fresh);
  });
});
