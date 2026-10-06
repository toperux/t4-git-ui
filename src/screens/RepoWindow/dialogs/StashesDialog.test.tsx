import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefsSnapshot, Stash, StatusEntry } from "../../../api/types";
import { useDialogStore } from "../../../store/dialogStore";
import { useDiffStore } from "../../../store/diffStore";
import { useOpsStore } from "../../../store/opsStore";
import { __resetForTests as resetRepo, useRepoStore } from "../../../store/repoStore";
import { useStatusStore } from "../../../store/statusStore";
import { useCommitSync } from "../CommitPanel/CommitPanel";
import { StashPushDialog, stashFiles } from "./StashDialogs";
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
  indexStamp: null,
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
  useDiffStore.setState({ repoId: null, target: null, files: [], filesLoading: false, filesError: null, selectedPath: null, diff: null, tab: "changes" });
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
  it("loads the previewed stash itself, not what the details pane last held", async () => {
    // Opened from Changes: no details pane is mounted, and the diff store still holds History's commit.
    useDiffStore.setState({ repoId: "r", target: { kind: "commit", oid: "X" } });
    const view = open();
    await waitFor(() => expect(ipc.getChangedFiles).toHaveBeenLastCalledWith("r", { kind: "stash", oid: "s0" }));
    expect(useDiffStore.getState().target).toEqual({ kind: "stash", oid: "s0" });
    fireEvent.click(rows(view)[1]);
    await waitFor(() => expect(ipc.getChangedFiles).toHaveBeenLastCalledWith("r", { kind: "stash", oid: "s1" }));
  });

  it("leaves a stash the details pane already loaded alone", () => {
    // Opened from History: the pane behind the scrim has loaded the previewed stash already.
    useDiffStore.setState({ repoId: "r", target: { kind: "stash", oid: "s0" } });
    useRepoStore.setState({ preview: STASHES[0] });
    open();
    // The commit panel's sync reads the tree's own sides; no stash is fetched again.
    expect(ipc.getChangedFiles).not.toHaveBeenCalledWith("r", expect.objectContaining({ kind: "stash" }));
  });

  it("lists every entry with its age and untracked mark, and previews stash@{0} on open", () => {
    const view = open();
    expect(rows(view).map((r) => r.getAttribute("title"))).toEqual(["stash@{0}: WIP on main", "stash@{1}: WIP on feature"]);
    expect(view.getByTitle("Includes untracked files")).toBeTruthy();
    expect(useRepoStore.getState().preview).toEqual(STASHES[0]);
    expect(rows(view)[0].getAttribute("aria-selected")).toBe("true");
  });

  it("draws the Working tree row with a dashed circle, as the grid does", () => {
    const view = open();
    expect(wtRow(view).querySelector("svg.lucide-circle-dashed")).toBeTruthy();
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

  it("Esc still closes after Apply disables itself", async () => {
    // The webview drops the focus to <body> when the focused button goes disabled; jsdom keeps it, so blur().
    (ipc.stashApply as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise(() => {}));
    const onClose = vi.fn();
    const view = render(
      <Synced>
        <StashesDialog onClose={onClose} />
      </Synced>,
    );
    const apply = view.getByRole("button", { name: "Apply" }) as HTMLButtonElement;
    apply.focus();
    fireEvent.click(apply);
    await waitFor(() => expect(apply.disabled).toBe(true));
    apply.blur();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
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

  it("a changed submodule alone is nothing to stash, and the form says why", () => {
    dirty(entry("subs/a", { submodule: true, submoduleDirtyOnly: true }));
    const view = open();
    // Nothing stashable: the browser opens on stash@{0}.
    expect(wtRow(view).getAttribute("aria-selected")).toBeNull();
    fireEvent.click(wtRow(view));
    const button = document.querySelector<HTMLButtonElement>('button[title="No changes"]')!;
    expect(button.disabled).toBe(true);
    expect(view.getByText("Submodules and nested repositories aren't stashed")).toBeTruthy();
  });
});

// Closing the browser puts back what the details pane showed before it opened.
describe("StashesDialog dismiss", () => {
  // As `DialogHost` does: the close unmounts the browser in the same render as the restore, so its
  // "lost its preview" effect never sees the cleared preview.
  function Host() {
    const [shown, setShown] = useState(true);
    return <Synced>{shown && <StashesDialog onClose={() => setShown(false)} />}</Synced>;
  }
  const open = () => render(<Host />);
  const escape = () => fireEvent.keyDown(document.body, { key: "Escape" });
  const commitRow = (oid: string) => ({ row: { commit: { oid } } }) as never;
  const PAIR = { from: { oid: "A" }, to: { oid: "B" } } as never;

  it("no preview before: the stash it opened on goes", () => {
    open();
    expect(useRepoStore.getState().preview).toEqual(STASHES[0]);
    escape();
    expect(useRepoStore.getState().preview).toBeNull();
  });

  it("a stash previewed before comes back, not the one browsed last", () => {
    useRepoStore.setState({ preview: STASHES[1] });
    const view = open();
    fireEvent.click(rows(view)[0]);
    escape();
    expect(useRepoStore.getState().preview).toEqual(STASHES[1]);
  });

  it("a stash previewed before and dropped meanwhile does not come back", () => {
    useRepoStore.setState({ preview: STASHES[1] });
    const view = open();
    fireEvent.click(rows(view)[0]);
    act(() => useRepoStore.setState({ refs: refs([STASHES[0]]) }));
    escape();
    expect(useRepoStore.getState().preview).toBeNull();
  });

  it("a push inside the browser: the stash comes back under its new index", async () => {
    useRepoStore.setState({ preview: STASHES[1] });
    dirty(entry("a.txt"));
    const view = open();
    fireEvent.click(view.getByRole("button", { name: "Stash 1 file" }));
    await waitFor(() => expect(ipc.stashPush).toHaveBeenCalled());
    const fresh = { ...stash(0, "later"), oid: "fresh" };
    act(() => useRepoStore.setState({ refs: refs([fresh, ...STASHES.map((st) => ({ ...st, index: st.index + 1 }))]) }));
    expect(useRepoStore.getState().preview).toEqual(fresh);
    escape();
    expect(useRepoStore.getState().preview).toEqual({ ...STASHES[1], index: 2 });
  });

  it("a compare the preview cleared comes back, unless the selection left its pair meanwhile", () => {
    useRepoStore.setState({ rows: [commitRow("X"), commitRow("A"), commitRow("B")], selectedIndex: 1, compare: PAIR });
    open();
    expect(useRepoStore.getState().compare).toBeNull();
    escape();
    expect(useRepoStore.getState().compare).toBe(PAIR);
    expect(useRepoStore.getState().preview).toBeNull();

    cleanup();
    open();
    // An outside rewrite: `reselect` hands the selection to the first row.
    act(() => useRepoStore.setState({ selectedIndex: 0 }));
    escape();
    expect(useRepoStore.getState().compare).toBeNull();
    expect(useRepoStore.getState().preview).toBeNull();
  });

  it("a conflicted Apply inside moved the selection onto the working tree: the stash before does not come back", async () => {
    (ipc.stashApply as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ...ok, code: 1, conflicts: ["a"], failure: { kind: "conflicts", paths: ["a"] } });
    useRepoStore.setState({ preview: STASHES[1] });
    const view = open();
    fireEvent.click(view.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(useRepoStore.getState().wtSelected).toBe(true));
    escape();
    expect(useRepoStore.getState().preview).toBeNull();
  });

  it("the working tree selected before, with a stash previewed: the stash comes back", () => {
    useRepoStore.setState({ wtSelected: true, preview: STASHES[1] });
    const view = open();
    fireEvent.click(rows(view)[0]);
    escape();
    expect(useRepoStore.getState().preview).toEqual(STASHES[1]);
  });
});

describe("stashFiles", () => {
  const paths = (...entries: StatusEntry[]) =>
    stashFiles({ entries, staged: 0, unstaged: entries.length, untracked: 0, conflicted: 0, state: "clean" }, true).map((e) => e.path);

  // git stashes neither a submodule's own edits nor its checkout moved to another commit, and
  // `stash -u` leaves a nested repository where it is.
  it("leaves out a submodule with no staged pointer and a nested repository", () => {
    expect(paths(entry("dirty", { submodule: true, submoduleDirtyOnly: true }))).toEqual([]);
    expect(paths(entry("moved", { submodule: true }))).toEqual([]);
    expect(paths(entry("nested/", { submodule: true, workdir: "untracked" }))).toEqual([]);
  });

  it("keeps a submodule with a staged pointer, and a plain file", () => {
    expect(paths(entry("staged", { submodule: true, index: "modified" }), entry("a.txt"))).toEqual(["staged", "a.txt"]);
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

  it("a changed submodule alone is nothing to stash, and says why", () => {
    dirty(entry("subs/a", { submodule: true }));
    const view = push();
    expect(view.getByText("Nothing to stash")).toBeTruthy();
    expect((view.getByRole("button", { name: "Stash" }) as HTMLButtonElement).disabled).toBe(true);
    expect(view.getByText("Submodules and nested repositories aren't stashed")).toBeTruthy();
  });

  it("lists the files beside a changed submodule, not the submodule", () => {
    dirty(entry("subs/a", { submodule: true }), entry("a.txt"));
    const view = push();
    expect(files(view)).toHaveLength(1);
    expect(view.queryByText("subs/a")).toBe(null);
    expect(view.getByRole("button", { name: "Stash 1 file" })).toBeTruthy();
    expect(view.getByText("Submodules and nested repositories aren't stashed")).toBeTruthy();
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
