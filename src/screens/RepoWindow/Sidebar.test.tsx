import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefsSnapshot } from "../../api/types";
import { useDialogStore } from "../../store/dialogStore";
import { useOpsStore } from "../../store/opsStore";
import { useRepoStore } from "../../store/repoStore";
import { useToastStore } from "../../store/toastStore";
import { Sidebar } from "./Sidebar";

vi.mock("../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/ipc")>();
  return { ...actual, getRefs: vi.fn(() => new Promise(() => {})), getStatus: vi.fn(() => new Promise(() => {})) };
});

const branch = (name: string, isHead = false) => ({ name, oid: name, upstream: null, gone: false, mergedInto: null, ahead: 0, behind: 0, isHead });

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
  useRepoStore.setState({ refs: REFS, remoteTags: {} });
  useDialogStore.setState({ dialog: null });
  useToastStore.setState({ toasts: [] });
});

/** The Tags section starts collapsed. */
const openTags = (view: ReturnType<typeof render>) => fireEvent.click(view.getByRole("button", { name: /^Tags/ }));

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
    const folders = getAllByRole("treeitem", { name: "feature" });
    expect(folders).toHaveLength(2);
    expect(queryByRole("treeitem", { name: "lanes" })).not.toBeNull();
    expect(getAllByRole("treeitem", { name: "lanes" })[0].getAttribute("aria-level")).toBe("3");

    fireEvent.click(folders[1]);
    expect(queryByRole("treeitem", { name: "lanes" })).toBeNull();
    expect(queryByRole("treeitem", { name: "panels" })).not.toBeNull();
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

    // Hidden, not disabled — and the separator above it goes too.
    expect(items("main")).not.toContain("Delete…");
    expect(menu("main").queryAllByRole("separator")).toHaveLength(0);
    expect(items("feature/panels")).not.toContain("Delete…");
    expect(items("wip")).toContain("Delete…");

    expect(items("origin/main")).not.toContain("Delete on remote…");
    expect(menu("origin/main").queryAllByRole("separator")).toHaveLength(0);
    expect(items("fork/main")).not.toContain("Delete on remote…");
    expect(items("origin/feature/lanes")).toContain("Delete on remote…");
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
    expect(menu.queryAllByRole("menuitem").map((el) => el.textContent)).toEqual(["Fetch origin", "Rename…", "Change URL…", "Copy URL", "Remove…"]);
    expect(menu.queryAllByRole("separator")).toHaveLength(1);
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
    fireEvent.click(view.getByRole("treeitem", { name: "releases" }));
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
    expect(menu.queryAllByRole("menuitem").map((el) => el.textContent)).toEqual(["Copy name", "Refresh remote tags", "Delete on remote…"]);
    fireEvent.click(menu.getByRole("menuitem", { name: "Delete on remote…" }));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "deleteRemoteTag", name: "v0.2.0", remote: "origin" });
  });
});
