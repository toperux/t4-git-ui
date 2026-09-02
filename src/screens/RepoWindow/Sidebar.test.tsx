import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefsSnapshot } from "../../api/types";
import { useRepoStore } from "../../store/repoStore";
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
  useRepoStore.setState({ refs: REFS });
});

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
});
