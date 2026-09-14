import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LinkedSnapshot, LogRow, RefsSnapshot } from "../../api/types";
import { useDialogStore } from "../../store/dialogStore";
import { useOpsStore } from "../../store/opsStore";
import { useRepoStore } from "../../store/repoStore";
import { DEFAULT_FOLDERS_MAX, useSettingsStore, type SidebarFolders } from "../../store/settingsStore";
import { useToastStore } from "../../store/toastStore";
import { Sidebar } from "./Sidebar";

vi.mock("../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/ipc")>();
  return {
    ...actual,
    getRefs: vi.fn(() => new Promise(() => {})),
    getLinked: vi.fn(() => Promise.resolve(null)),
    getStatus: vi.fn(() => new Promise(() => {})),
    stashDrop: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    openRepo: vi.fn(() => new Promise(() => {})),
    submoduleUpdate: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
  };
});
const ask = vi.hoisted(() => vi.fn((_message: string, _options?: unknown) => Promise.resolve(true)));
// `open` is the folder picker `actions.ts` imports; the row menus pull that module in.
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask, open: vi.fn() }));

import * as ipc from "../../api/ipc";

const branch = (name: string, isHead = false) => ({ name, oid: name, upstream: null, gone: false, mergedInto: null, ahead: 0, behind: 0, isHead });

/** A grid row: the sidebar only ever reads the commit's oid off the selected one. */
const rowAt = (oid: string): LogRow => ({
  row: { commit: { oid, short: oid, summary: "", authorName: "Ada", authorEmail: "a@b", authorTime: 0, committerTime: 0, parents: [], isMerge: false }, lane: 0, color: 0, lines: [], maxLane: 0 },
  labels: [],
});

const REFS: RefsSnapshot = {
  head: { oid: "a", branch: "main", detached: false },
  state: "clean",
  local: [branch("main", true), branch("feature/panels")],
  remotes: [
    {
      name: "origin",
      url: null,
      branches: [
        { name: "origin/main", oid: "a", mergedInto: null },
        { name: "origin/cross-platform", oid: "b", mergedInto: null },
        { name: "origin/feature/lanes", oid: "d", mergedInto: null },
      ],
    },
    { name: "fork", url: null, branches: [{ name: "fork/main", oid: "c", mergedInto: null }] },
  ],
  tags: [{ name: "v0.1.0", oid: "a", message: null }],
  stashes: [],
};

afterEach(cleanup);
beforeEach(() => {
  useRepoStore.setState({ refs: REFS, linked: null, remoteTags: {}, rows: [], selectedIndex: null, wtSelected: false });
  useDialogStore.setState({ dialog: null });
  useToastStore.setState({ toasts: [] });
  useSettingsStore.setState({ sidebarFolders: "expanded", sidebarFoldersMax: DEFAULT_FOLDERS_MAX });
});

/** The Tags section starts collapsed. */
const openTags = (view: ReturnType<typeof render>) => fireEvent.click(view.getByRole("button", { name: /^Tags/ }));

/** The Stashes section starts collapsed too. */
const openStashes = (view: ReturnType<typeof render>) => fireEvent.click(view.getByRole("button", { name: /^Stashes/ }));

describe("Sidebar section counts", () => {
  it("counts refs in every section — Remotes counts branches, not remotes", () => {
    const { getAllByRole } = render(<Sidebar />);
    // Section headers are the buttons carrying aria-expanded; the badge is the trailing number.
    const badges = Object.fromEntries(
      getAllByRole("button")
        .filter((b) => b.getAttribute("aria-expanded") !== null)
        .map((b) => [b.textContent!.replace(/\d+$/, ""), b.textContent!.match(/\d+$/)?.[0]]),
    );
    expect(badges).toEqual({ Local: "2", Remotes: "4", Tags: "1", Stashes: "0" });
  });

  it("lists every remote with its branches", () => {
    const { getAllByRole } = render(<Sidebar />);
    const rows = getAllByRole("treeitem").map((r) => r.textContent);
    expect(rows).toEqual(expect.arrayContaining(["origin", "fork", "main", "cross-platform"]));
  });

  it("marks a branch inside another one as merged, naming the container", () => {
    useRepoStore.setState({
      refs: {
        ...REFS,
        local: [branch("main", true), { ...branch("done"), mergedInto: "main" }],
        remotes: [{ name: "origin", url: null, branches: [{ name: "origin/done", oid: "d", mergedInto: "origin/main" }] }],
      },
    });
    const { getAllByText, getAllByRole } = render(<Sidebar />);
    expect(getAllByText("merged")).toHaveLength(2);
    const titles = getAllByRole("treeitem").map((r) => r.title);
    expect(titles).toContain("done — merged into main");
    expect(titles).toContain("origin/done — merged into origin/main");
    expect(titles).toContain("main");
  });

  it("says it is loading while the refs are still on their way", () => {
    useRepoStore.setState({ refs: null });
    const { getByText, queryAllByRole } = render(<Sidebar />);
    expect(getByText("Loading branches…")).toBeTruthy();
    expect(queryAllByRole("button")).toHaveLength(0);
  });

  it("marks the checked-out branch with a check in place of the branch icon", () => {
    useRepoStore.setState({ refs: { ...REFS, local: [branch("main", true), branch("feature")] } });
    const { getAllByRole } = render(<Sidebar />);
    const row = (title: string) => getAllByRole("treeitem").find((r) => r.title === title)!;
    const main = row("main");
    expect(main.getAttribute("aria-current")).toBe("true");
    expect(main.querySelector("svg.lucide-check")).not.toBeNull();
    const feature = row("feature");
    expect(feature.getAttribute("aria-current")).toBeNull();
    expect(feature.querySelector("svg.lucide-git-branch")).not.toBeNull();
  });

  it("never marks the current branch as merged: it cannot be deleted", () => {
    useRepoStore.setState({ refs: { ...REFS, local: [{ ...branch("main", true), mergedInto: "feature" }, branch("feature")] } });
    const { queryByText, getAllByRole } = render(<Sidebar />);
    expect(queryByText("merged")).toBeNull();
    const titles = getAllByRole("treeitem").map((r) => r.title);
    expect(titles).toContain("main");
    expect(titles).not.toContain("main — merged into feature");
  });

  it("never marks a protected branch as merged either: nothing offers to delete it", () => {
    // `master` by name, `develop` by `origin/HEAD`; `feature` is the control.
    useRepoStore.setState({
      refs: {
        ...REFS,
        local: [branch("main", true), { ...branch("master"), mergedInto: "main" }, { ...branch("develop"), mergedInto: "main" }, { ...branch("feature"), mergedInto: "main" }],
        remotes: [{ name: "origin", url: null, head: "origin/develop", branches: [{ name: "origin/master", oid: "b", mergedInto: "origin/main" }, { name: "origin/develop", oid: "c", mergedInto: "origin/main" }] }],
      },
    });
    const { getAllByText, getAllByRole } = render(<Sidebar />);
    expect(getAllByText("merged")).toHaveLength(1);
    const titles = getAllByRole("treeitem").map((r) => r.title);
    expect(titles).toContain("feature — merged into main");
    expect(titles).toContain("master");
    expect(titles).toContain("develop");
    expect(titles).toContain("origin/master");
    expect(titles).toContain("origin/develop");
  });

  it("nests remote branches in folders like local ones, collapsing per remote", () => {
    const { getAllByRole, queryByRole } = render(<Sidebar />);
    // `feature/panels` (local) and `origin/feature/lanes` each get a `feature` folder.
    const folders = getAllByRole("treeitem", { name: /^feature/ });
    expect(folders).toHaveLength(2);
    expect(queryByRole("treeitem", { name: "lanes" })).not.toBeNull();
    expect(getAllByRole("treeitem", { name: "lanes" })[0].getAttribute("aria-level")).toBe("3");

    fireEvent.click(folders[1]);
    expect(queryByRole("treeitem", { name: "lanes" })).toBeNull();
    expect(queryByRole("treeitem", { name: "panels" })).not.toBeNull();
  });

  it("greys Merge and Rebase while no branch is checked out or an operation is in progress", () => {
    const item = (title: string, name: RegExp) => {
      const r = render(<Sidebar />);
      fireEvent.contextMenu(r.getAllByRole("treeitem").find((row) => row.title === title)!);
      const el = within(r.getByRole("menu", { name: "Reference actions" })).getByRole("menuitem", { name });
      const out = { disabled: (el as HTMLButtonElement).disabled, title: el.getAttribute("title") };
      r.unmount();
      return out;
    };
    useRepoStore.setState({ refs: { ...REFS, head: { oid: "a", branch: null, detached: true }, local: REFS.local.map((b) => ({ ...b, isHead: false })) } });
    expect(item("feature/panels", /^Merge into current/)).toEqual({ disabled: true, title: "No branch is checked out" });
    expect(item("origin/main", /^Rebase current onto/)).toEqual({ disabled: true, title: "No branch is checked out" });

    useRepoStore.setState({ refs: { ...REFS, state: "rebase" } });
    expect(item("feature/panels", /^Rebase main onto/)).toEqual({ disabled: true, title: "An operation is in progress" });
    expect(item("origin/main", /^Merge into main/)).toEqual({ disabled: true, title: "An operation is in progress" });

    useRepoStore.setState({ refs: REFS });
    expect(item("feature/panels", /^Merge into main/)).toEqual({ disabled: false, title: null });
  });

  it("never offers to delete main, master or the branch a remote's HEAD points at", () => {
    // `fork/HEAD → fork/feature/panels` protects that short name locally and on every remote.
    useRepoStore.setState({
      refs: { ...REFS, local: [...REFS.local, branch("wip")], remotes: REFS.remotes.map((r) => (r.name === "fork" ? { ...r, head: "fork/feature/panels" } : r)) },
    });
    const { getAllByRole, getByRole } = render(<Sidebar />);
    // Rows carry the full ref name as their title; the label is only the last segment.
    const menu = (title: string) => {
      fireEvent.contextMenu(getAllByRole("treeitem").find((r) => r.title === title)!);
      return within(getByRole("menu", { name: "Reference actions" }));
    };
    const items = (title: string) => menu(title).queryAllByRole("menuitem").map((el) => el.textContent);

    // Hidden, not disabled — and the separator above it goes too: the same groups as the commit menu
    // (switch · integrate · new refs · network · clipboard · edit · delete), minus the last one.
    expect(items("main")).toEqual(["Checkout", "Merge into main…", "Rebase main onto…", "Create branch here…", "Create worktree here…", "Push…", "Copy name", "Rename…"]);
    expect(menu("main").queryAllByRole("separator")).toHaveLength(5);
    expect(items("feature/panels")).not.toContain("Delete…");
    expect(items("wip")).toContain("Delete…");
    expect(menu("wip").queryAllByRole("separator")).toHaveLength(6);

    expect(items("origin/main")).toEqual(["Checkout", "Merge into main…", "Rebase main onto…", "Create branch here…", "Copy name"]);
    expect(menu("origin/main").queryAllByRole("separator")).toHaveLength(3);
    expect(items("fork/main")).not.toContain("Delete on remote…");
    expect(items("origin/feature/lanes")).toContain("Delete on remote…");
    expect(menu("origin/feature/lanes").queryAllByRole("separator")).toHaveLength(4);
  });
});

describe("Sidebar selected commit", () => {
  const tint = (view: ReturnType<typeof render>, title: string) => view.getAllByRole("treeitem").find((r) => r.title === title)!.getAttribute("aria-selected");

  it("tints every ref on the selected commit, not the checked-out branch", () => {
    // The fixture gives a local branch its own name as its oid; `origin/main` and the tag sit at `a`.
    useRepoStore.setState({ rows: [rowAt("main"), rowAt("a")], selectedIndex: 0 });
    const view = render(<Sidebar />);
    expect(tint(view, "main")).toBe("true");
    expect(tint(view, "origin/main")).toBeNull();
    expect(tint(view, "feature/panels")).toBeNull();

    act(() => useRepoStore.setState({ selectedIndex: 1 }));
    // `main` is HEAD and still loses the tint: the check alone marks the checkout.
    expect(tint(view, "main")).toBeNull();
    expect(tint(view, "origin/main")).toBe("true");

    act(() => useRepoStore.setState({ wtSelected: true }));
    expect(tint(view, "origin/main")).toBeNull();
  });

  it("tints a tag on the selected commit", () => {
    useRepoStore.setState({ rows: [rowAt("a")], selectedIndex: 0 });
    const view = render(<Sidebar />);
    openTags(view);
    expect(tint(view, "v0.1.0")).toBe("true");
  });

  it("tints a collapsed folder holding a ref on the selected commit, the row itself once it opens", () => {
    useSettingsStore.setState({ sidebarFolders: "collapsed" });
    useRepoStore.setState({ rows: [rowAt("feature/panels")], selectedIndex: 0 });
    const view = render(<Sidebar />);
    const folder = () => view.getAllByRole("treeitem", { name: /^feature/ })[0];
    expect(folder().getAttribute("aria-selected")).toBe("true");

    fireEvent.click(folder());
    expect(folder().getAttribute("aria-selected")).toBeNull();
    expect(tint(view, "feature/panels")).toBe("true");
  });
});

describe("Sidebar remote menu", () => {
  const rowMenu = (title: string, view: ReturnType<typeof render>) => {
    fireEvent.contextMenu(view.getAllByRole("treeitem").find((r) => r.title === title)!);
    return within(view.getByRole("menu", { name: "Reference actions" }));
  };

  it("offers the remote's own actions on its folder row, with Copy URL disabled without a URL", () => {
    const view = render(<Sidebar />);
    const menu = rowMenu("origin", view);
    expect(menu.queryAllByRole("menuitem").map((el) => el.textContent)).toEqual(["Fetch origin", "Copy URL", "Rename…", "Change URL…", "Remove…"]);
    expect(menu.queryAllByRole("separator")).toHaveLength(3);
    expect(menu.getByRole("menuitem", { name: "Copy URL" }).hasAttribute("disabled")).toBe(true);
  });

  it("opens each remote dialog with the remote it was invoked on", () => {
    useRepoStore.setState({ refs: { ...REFS, remotes: [{ ...REFS.remotes[0], url: "git@x/y.git" }] } });
    const view = render(<Sidebar />);
    // The row's title is the URL once there is one.
    expect(rowMenu("git@x/y.git", view).getByRole("menuitem", { name: "Copy URL" }).hasAttribute("disabled")).toBe(false);

    fireEvent.click(rowMenu("git@x/y.git", view).getByRole("menuitem", { name: "Rename…" }));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "renameRemote", name: "origin" });
    fireEvent.click(rowMenu("git@x/y.git", view).getByRole("menuitem", { name: "Change URL…" }));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "setRemoteUrl", name: "origin", url: "git@x/y.git" });
    fireEvent.click(rowMenu("git@x/y.git", view).getByRole("menuitem", { name: "Remove…" }));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "removeRemote", name: "origin" });
  });

  it("offers Add remote… as the empty state of a repository without remotes", () => {
    useRepoStore.setState({ refs: { ...REFS, remotes: [] } });
    const { getByText, getByRole } = render(<Sidebar />);
    expect(getByText("No remotes")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Add remote…" }));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "addRemote" });
  });

  it("greys the empty state's Add remote… while an op runs, like the toolbar item", () => {
    useRepoStore.setState({ refs: { ...REFS, remotes: [] } });
    useOpsStore.setState({ busy: "Fetching…" });
    const { getByRole } = render(<Sidebar />);
    expect(getByRole("button", { name: "Add remote…" }).hasAttribute("disabled")).toBe(true);
    useOpsStore.setState({ busy: null });
  });
});

describe("Sidebar tags tree", () => {
  const tag = (name: string) => ({ name, oid: name, message: null });
  const remoteTags = (...names: string[]) => names.map((name) => ({ name, oid: name }));
  const rows = (view: ReturnType<typeof render>) => view.getAllByRole("treeitem");

  it("folds local tags by `/` like the branches, the folder collapsing on click", () => {
    useRepoStore.setState({ refs: { ...REFS, tags: [tag("v0.1.0"), tag("releases/qas/v1.1.1")] } });
    const view = render(<Sidebar />);
    openTags(view);
    expect(view.getByRole("treeitem", { name: "v1.1.1" }).getAttribute("aria-level")).toBe("3");
    fireEvent.click(view.getByRole("treeitem", { name: /^releases/ }));
    expect(view.queryByRole("treeitem", { name: "v1.1.1" })).toBeNull();
  });

  it("gives every remote that answered its own folder, and none to one that is gone", () => {
    useRepoStore.setState({
      remoteTags: { origin: { tags: remoteTags("v0.1.0", "v0.2.0"), at: Date.now() - 5 * 60_000 }, upstream: { tags: remoteTags("v9"), at: Date.now() } },
    });
    const view = render(<Sidebar />);
    openTags(view);
    // The folder row is dated; `upstream` is not a remote of this repository, so it has no folder.
    expect(rows(view).find((r) => r.title === "Checked 5m ago")!.textContent).toBe("origin");
    expect(rows(view).filter((r) => r.textContent === "upstream")).toHaveLength(0);
    // `v0.1.0` is both the local tag and origin's copy; `v0.2.0` is origin's alone.
    expect(rows(view).filter((r) => r.title === "v0.1.0")).toHaveLength(2);
    expect(rows(view).filter((r) => r.title === "v0.2.0")).toHaveLength(1);
  });

  it("reveals a remote tag's commit, and says so when the walk has no such row", async () => {
    const revealOid = vi.fn(() => Promise.resolve(true));
    useRepoStore.setState({ remoteTags: { origin: { tags: remoteTags("v0.2.0"), at: Date.now() } }, revealOid });
    const view = render(<Sidebar />);
    openTags(view);
    fireEvent.click(rows(view).find((r) => r.title === "v0.2.0")!);
    expect(revealOid).toHaveBeenCalledWith("v0.2.0");
    expect(useToastStore.getState().toasts).toHaveLength(0);

    revealOid.mockResolvedValue(false);
    fireEvent.click(rows(view).find((r) => r.title === "v0.2.0")!);
    await waitFor(() => expect(useToastStore.getState().toasts).toMatchObject([{ kind: "info", title: "Not in the current history" }]));
  });

  it("badges a tag none of the remotes has, naming them all and dating the oldest answer", () => {
    useRepoStore.setState({ remoteTags: { origin: { tags: remoteTags("v0.0.9"), at: Date.now() - 2 * 3600_000 }, fork: { tags: [], at: Date.now() } } });
    const view = render(<Sidebar />);
    openTags(view);
    expect(view.getByText("local").title).toBe("Not on origin or fork (as of 2h ago)");
  });

  it("leaves a tag one of the remotes has plain, and badges nothing at all without an answer", () => {
    useRepoStore.setState({ remoteTags: { fork: { tags: remoteTags("v0.1.0"), at: Date.now() } } });
    const view = render(<Sidebar />);
    openTags(view);
    expect(view.queryByText("local")).toBeNull();
    cleanup();

    useRepoStore.setState({ remoteTags: {} });
    const cold = render(<Sidebar />);
    openTags(cold);
    expect(cold.queryByText("local")).toBeNull();
  });

  it("re-asks the remotes from the tag row menu", () => {
    const refreshRemoteTags = vi.fn(() => Promise.resolve());
    useRepoStore.setState({ refreshRemoteTags });
    const view = render(<Sidebar />);
    openTags(view);
    fireEvent.contextMenu(rows(view).find((r) => r.title === "v0.1.0")!);
    fireEvent.click(within(view.getByRole("menu", { name: "Reference actions" })).getByRole("menuitem", { name: "Refresh remote tags" }));
    expect(refreshRemoteTags).toHaveBeenCalledWith({ announce: true });
  });

  it("offers a remote tag row Copy name / Refresh / Delete on remote…, that remote preselected", () => {
    useRepoStore.setState({ remoteTags: { origin: { tags: remoteTags("v0.2.0"), at: Date.now() } } });
    const view = render(<Sidebar />);
    openTags(view);
    fireEvent.contextMenu(rows(view).find((r) => r.title === "v0.2.0")!);
    const menu = within(view.getByRole("menu", { name: "Reference actions" }));
    // No Checkout / Create branch here: the object may not exist locally.
    expect(menu.queryAllByRole("menuitem").map((el) => el.textContent)).toEqual(["Refresh remote tags", "Copy name", "Delete on remote…"]);
    fireEvent.click(menu.getByRole("menuitem", { name: "Delete on remote…" }));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "deleteRemoteTag", name: "v0.2.0", remote: "origin" });
  });
});

describe("Sidebar stashes", () => {
  const STASH = { index: 0, oid: "s0", message: "WIP on main", baseOid: "a", time: 1_700_000_000, hasUntracked: false };

  beforeEach(() => useRepoStore.setState({ refs: { ...REFS, stashes: [STASH] }, preview: null }));

  it("keeps the section shut until its header is clicked", () => {
    const view = render(<Sidebar />);
    expect(view.queryAllByRole("treeitem").find((r) => r.title === `stash@{0}: ${STASH.message}`)).toBeUndefined();
    openStashes(view);
    expect(view.queryAllByRole("treeitem").find((r) => r.title === `stash@{0}: ${STASH.message}`)).toBeTruthy();
  });

  it("previews the entry a row click names — stash commits are not in the history to reveal", () => {
    const view = render(<Sidebar />);
    openStashes(view);
    const row = () => view.getAllByRole("treeitem").find((r) => r.title === `stash@{0}: ${STASH.message}`)!;
    fireEvent.click(row());
    expect(useRepoStore.getState().preview).toEqual(STASH);
    expect(row().getAttribute("aria-selected")).toBe("true");
  });

  it("opens the browser from the header button", () => {
    const view = render(<Sidebar />);
    fireEvent.click(view.getByRole("button", { name: "Manage stashes" }));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "stashes" });
  });
});

describe("Sidebar stash menu", () => {
  const STASH = { index: 2, oid: "s2", message: "WIP on main: fix tests", baseOid: "a", time: 1_700_000_000, hasUntracked: true };
  const dropped = ipc.stashDrop as unknown as ReturnType<typeof vi.fn>;

  const clickDrop = () => {
    // `clickDrop` runs twice in one test, so the queries stay inside this render's own container.
    const view = within(render(<Sidebar />).container);
    fireEvent.click(view.getByRole("button", { name: /^Stashes/ }));
    fireEvent.contextMenu(view.getAllByRole("treeitem").find((r) => r.title === `stash@{2}: ${STASH.message}`)!);
    fireEvent.click(within(screen.getByRole("menu", { name: "Reference actions" })).getByRole("menuitem", { name: "Drop" }));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useRepoStore.setState({ refs: { ...REFS, stashes: [STASH] }, repo: { id: "r", name: "r", path: "/r", head: { oid: "a", branch: "main", detached: false } } });
    useOpsStore.setState({ busy: null });
  });

  it("drops nothing until the confirmation is accepted, naming the entry and its message", async () => {
    let accept!: (ok: boolean) => void;
    ask.mockReturnValueOnce(new Promise<boolean>((resolve) => (accept = resolve)));
    clickDrop();
    expect(dropped).not.toHaveBeenCalled();
    expect(ask).toHaveBeenCalledWith(`Drop stash@{2} "${STASH.message}"? This cannot be undone.`, expect.objectContaining({ title: "Drop stash", kind: "warning", okLabel: "Drop", cancelLabel: "Cancel" }));

    accept(true);
    await waitFor(() => expect(dropped).toHaveBeenCalledWith("r", 2));
  });

  it("drops nothing when the confirmation is declined — a failed dialog counts as declined too", async () => {
    ask.mockResolvedValueOnce(false);
    clickDrop();
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(dropped).not.toHaveBeenCalled();

    ask.mockRejectedValueOnce(new Error("no dialog plugin"));
    clickDrop();
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
    expect(dropped).not.toHaveBeenCalled();
  });
});

describe("Sidebar folder collapse", () => {
  // `feature` holds four refs, two of them under `feature/deep`: a rule counting only the rows
  // directly inside it would see three and leave it open at N = 3.
  const NESTED: RefsSnapshot = {
    ...REFS,
    local: [branch("main", true), branch("feature/a"), branch("feature/b"), branch("feature/deep/x"), branch("feature/deep/y")],
  };
  const rule = (sidebarFolders: SidebarFolders, sidebarFoldersMax = DEFAULT_FOLDERS_MAX) => useSettingsStore.setState({ sidebarFolders, sidebarFoldersMax });
  /** `origin` has a `feature` folder too; the Local section renders first, so its row is the first match. */
  const feature = (view: ReturnType<typeof render>) => view.queryAllByRole("treeitem", { name: /^feature/ })[0];
  const refresh = (refs: RefsSnapshot) => act(() => useRepoStore.setState({ refs }));

  it("counts the refs under a folder row, in its meta slot", () => {
    useRepoStore.setState({ refs: NESTED });
    const view = render(<Sidebar />);
    expect(feature(view).lastElementChild!.textContent).toBe("4");
  });

  it("leaves every folder expanded by default", () => {
    useRepoStore.setState({ refs: NESTED });
    const view = render(<Sidebar />);
    expect(feature(view).getAttribute("aria-expanded")).toBe("true");
    expect(view.getByRole("treeitem", { name: "x" })).toBeTruthy();
  });

  it("collapses every folder row when the setting says always, and no top-level group", () => {
    useRepoStore.setState({ refs: NESTED });
    rule("collapsed");
    const view = render(<Sidebar />);
    expect(view.getAllByRole("treeitem", { name: /^feature/ }).map((r) => r.getAttribute("aria-expanded"))).toEqual(["false", "false"]);
    expect(view.queryByRole("treeitem", { name: "a" })).toBeNull();
    expect(view.queryByRole("treeitem", { name: "lanes" })).toBeNull();
    // The remote's own row is a group, not a folder: the rule never visits it.
    expect(view.getByRole("treeitem", { name: "origin" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("counts the refs under a folder at any depth for the threshold", () => {
    useRepoStore.setState({ refs: NESTED });
    rule("auto", 3);
    const view = render(<Sidebar />);
    // Four refs under `feature`, one under origin's: only the first is over the threshold.
    expect(view.getAllByRole("treeitem", { name: /^feature/ }).map((r) => r.getAttribute("aria-expanded"))).toEqual(["false", "true"]);

    fireEvent.click(feature(view));
    // `feature/deep` holds two: under the threshold, so it came up expanded.
    expect(view.getByRole("treeitem", { name: /^deep/ }).getAttribute("aria-expanded")).toBe("true");
    expect(view.getByRole("treeitem", { name: "x" })).toBeTruthy();
  });

  it("leaves a folder the user opened open across a refs refresh", () => {
    useRepoStore.setState({ refs: NESTED });
    rule("collapsed");
    const view = render(<Sidebar />);
    fireEvent.click(feature(view));
    expect(feature(view).getAttribute("aria-expanded")).toBe("true");

    refresh({ ...NESTED, local: [...NESTED.local, branch("feature/c")] });
    expect(feature(view).getAttribute("aria-expanded")).toBe("true");
    expect(view.getByRole("treeitem", { name: "c" })).toBeTruthy();
  });

  it("seeds a folder that first appears mid-session, and only that once", () => {
    useRepoStore.setState({ refs: { ...REFS, remotes: [], local: [branch("main", true)] } });
    rule("collapsed");
    const view = render(<Sidebar />);
    expect(view.queryByRole("treeitem", { name: "feature" })).toBeNull();

    refresh({ ...REFS, remotes: [], local: [branch("main", true), branch("feature/a")] });
    expect(feature(view).getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(feature(view));
    refresh({ ...REFS, remotes: [], local: [branch("main", true), branch("feature/a"), branch("feature/b")] });
    expect(feature(view).getAttribute("aria-expanded")).toBe("true");
  });

  it("reseeds every folder when the setting changes", () => {
    useRepoStore.setState({ refs: NESTED });
    rule("auto", 3);
    const view = render(<Sidebar />);
    fireEvent.click(feature(view));
    expect(feature(view).getAttribute("aria-expanded")).toBe("true");

    // The same rule with a lower threshold: the folder the user opened goes back to collapsed.
    act(() => rule("auto", 2));
    expect(feature(view).getAttribute("aria-expanded")).toBe("false");
  });
});

describe("Sidebar linked checkouts", () => {
  const LINKED: LinkedSnapshot = {
    worktrees: [
      { path: "C:/src/work", head: { oid: "a", branch: "main", detached: false }, main: true, current: true, locked: false, lockReason: null, prunable: false },
      { path: "C:/src/work-panels", head: { oid: "b", branch: "feature/panels", detached: false }, main: false, current: false, locked: true, lockReason: "on a USB stick", prunable: false },
    ],
    submodules: [{ path: "vendor/lib", url: "git@x/lib.git", headOid: "0123456789abcdef0123456789abcdef01234567", workdirOid: null }],
  };
  const rowMenu = (title: string, view: ReturnType<typeof render>) => {
    fireEvent.contextMenu(view.getAllByRole("treeitem").find((r) => r.title === title)!);
    return within(view.getByRole("menu", { name: "Reference actions" }));
  };
  const items = (menu: ReturnType<typeof within>) => menu.queryAllByRole("menuitem").map((el: HTMLElement) => el.textContent);

  beforeEach(() => {
    vi.clearAllMocks();
    useRepoStore.setState({ refs: REFS, linked: LINKED, repo: { id: "r", name: "work", path: "C:/src/work", head: { oid: "a", branch: "main", detached: false } } });
    useOpsStore.setState({ busy: null });
  });

  it("lists the worktrees and submodules with their badges", () => {
    const view = render(<Sidebar />);
    const row = (title: string) => view.getAllByRole("treeitem").find((r) => r.title === title)!;

    // The branch (or `detached`) then the badges, in the row's meta slot.
    const meta = (title: string) => Array.from(row(title).lastElementChild!.children).map((el) => el.textContent);

    // Named by the directory, not the whole path — that is the row's title.
    expect(within(row("C:/src/work")).getByText("work")).toBeTruthy();
    expect(meta("C:/src/work")).toEqual(["main", "main", "current"]);

    const linked = row("C:/src/work-panels");
    expect(within(linked).getByText("work-panels")).toBeTruthy();
    expect(meta("C:/src/work-panels")).toEqual(["feature/panels", "locked"]);
    expect(within(linked).getByText("locked").getAttribute("title")).toBe("on a USB stick");

    expect(within(row("git@x/lib.git")).getByText("vendor/lib")).toBeTruthy();
    expect(meta("git@x/lib.git")).toEqual(["0123456", "not initialized"]);
  });

  it("shows neither section for an ordinary repository: one worktree is just the repository", () => {
    const section = (view: ReturnType<typeof render>) => view.queryAllByRole("button").filter((b) => /^(Worktrees|Submodules)/.test(b.textContent!));
    useRepoStore.setState({ linked: null });
    const plain = render(<Sidebar />);
    expect(section(plain)).toHaveLength(0);
    plain.unmount();

    useRepoStore.setState({ linked: { worktrees: [LINKED.worktrees[0]], submodules: [] } });
    const single = render(<Sidebar />);
    expect(section(single)).toHaveLength(0);
  });

  it("opens another worktree from its row, and offers neither Open nor Remove on the current one", () => {
    const view = render(<Sidebar />);
    const linked = rowMenu("C:/src/work-panels", view);
    // Locked, so Unlock rather than Lock…
    expect(items(linked)).toEqual(["Open", "Copy path", "Unlock", "Remove…"]);
    fireEvent.click(linked.getByRole("menuitem", { name: "Open" }));
    expect(ipc.openRepo).toHaveBeenCalledWith("C:/src/work-panels");

    const currentMenu = rowMenu("C:/src/work", view);
    expect(items(currentMenu)).toEqual(["Open", "Copy path", "Lock…", "Remove…"]);
    expect(currentMenu.getByRole("menuitem", { name: "Open" }).getAttribute("title")).toBe("Already the open repository");
    const remove = currentMenu.getByRole("menuitem", { name: "Remove…" });
    expect((remove as HTMLButtonElement).disabled).toBe(true);
    expect(remove.getAttribute("title")).toBe("The main working tree stays");
  });

  it("greys Open on a submodule that has no checkout, and updates one from its row", () => {
    const view = render(<Sidebar />);
    const menu = rowMenu("git@x/lib.git", view);
    expect(items(menu)).toEqual(["Open", "Update", "Copy path"]);
    expect(menu.getByRole("menuitem", { name: "Open" }).getAttribute("title")).toBe("Not initialized — update it first");
    fireEvent.click(menu.getByRole("menuitem", { name: "Update" }));
    expect(ipc.submoduleUpdate).toHaveBeenCalledWith("r", "vendor/lib");
  });

  it("opens a nested submodule with the repo's own separator", () => {
    useRepoStore.setState({
      repo: { id: "r", name: "work", path: "C:\\src\\work", head: { oid: "a", branch: "main", detached: false } },
      linked: { ...LINKED, submodules: [{ ...LINKED.submodules[0], workdirOid: "0123456789abcdef0123456789abcdef01234567" }] },
    });
    const view = render(<Sidebar />);
    fireEvent.click(rowMenu("git@x/lib.git", view).getByRole("menuitem", { name: "Open" }));
    expect(ipc.openRepo).toHaveBeenCalledWith("C:\\src\\work\\vendor\\lib");
  });

  it("hangs the whole-list actions off the section headers", () => {
    const view = render(<Sidebar />);
    const header = (name: RegExp) => {
      fireEvent.contextMenu(view.getAllByRole("button").find((b) => name.test(b.textContent!))!);
      return within(view.getByRole("menu", { name: "Reference actions" }));
    };
    const worktrees = header(/^Worktrees/);
    expect(items(worktrees)).toEqual(["Add worktree…", "Prune"]);
    fireEvent.click(worktrees.getByRole("menuitem", { name: "Add worktree…" }));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "addWorktree" });

    const submodules = header(/^Submodules/);
    expect(items(submodules)).toEqual(["Update all"]);
    fireEvent.click(submodules.getByRole("menuitem", { name: "Update all" }));
    expect(ipc.submoduleUpdate).toHaveBeenCalledWith("r", null);
  });

  it("offers Create worktree here… on a branch row, greyed while a worktree already has it out", () => {
    const view = render(<Sidebar />);
    const free = rowMenu("main", view).getByRole("menuitem", { name: "Create worktree here…" });
    // `main` is out in the current worktree, `feature/panels` in the linked one: neither can be added again.
    expect((free as HTMLButtonElement).disabled).toBe(true);
    expect(free.getAttribute("title")).toBe("Already checked out in a worktree");

    useRepoStore.setState({ linked: { ...LINKED, worktrees: [LINKED.worktrees[0]] } });
    const item = rowMenu("feature/panels", view).getByRole("menuitem", { name: "Create worktree here…" });
    expect((item as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(item);
    expect(useDialogStore.getState().dialog).toEqual({ kind: "addWorktree", branch: "feature/panels" });
  });
});

describe("Sidebar only", () => {
  it("renders that one section, open, and a collapse button when asked", () => {
    const onCollapse = vi.fn();
    const { getByRole, queryByRole } = render(<Sidebar only="remotes" onCollapse={onCollapse} />);
    expect(getByRole("tree", { name: "Remote branches" })).toBeTruthy();
    expect(queryByRole("tree", { name: "Local branches" })).toBeNull();
    expect(queryByRole("button", { name: /^Tags/ })).toBeNull();
    fireEvent.click(getByRole("button", { name: "Collapse sidebar" }));
    expect(onCollapse).toHaveBeenCalled();
  });
});
