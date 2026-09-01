import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefsSnapshot } from "../../api/types";
import { useRepoStore } from "../../store/repoStore";
import { Sidebar } from "./Sidebar";

vi.mock("../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/ipc")>();
  return { ...actual, getRefs: vi.fn(() => new Promise(() => {})), getStatus: vi.fn(() => new Promise(() => {})) };
});

const branch = (name: string, isHead = false) => ({ name, oid: name, upstream: null, gone: false, ahead: 0, behind: 0, isHead });

const REFS: RefsSnapshot = {
  head: { oid: "a", branch: "main", detached: false },
  state: "clean",
  local: [branch("main", true), branch("feature/panels")],
  remotes: [
    {
      name: "origin",
      url: null,
      branches: [
        { name: "origin/main", oid: "a" },
        { name: "origin/cross-platform", oid: "b" },
      ],
    },
    { name: "fork", url: null, branches: [{ name: "fork/main", oid: "c" }] },
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
    expect(badges).toEqual({ Local: "2", Remotes: "3", Tags: "1", Stashes: "0" });
  });

  it("lists every remote with its branches", () => {
    const { getAllByRole } = render(<Sidebar />);
    const rows = getAllByRole("treeitem").map((r) => r.textContent);
    expect(rows).toEqual(expect.arrayContaining(["origin", "fork", "main", "cross-platform"]));
  });
});
