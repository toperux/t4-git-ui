import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefsSnapshot } from "../../api/types";
import { useDialogStore } from "../../store/dialogStore";
import { useRepoStore } from "../../store/repoStore";
import { DEFAULT_FOLDERS_MAX, useSettingsStore } from "../../store/settingsStore";
import { useViewStore } from "../../store/viewStore";
import { SidebarRail } from "./SidebarRail";

vi.mock("../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/ipc")>();
  return { ...actual, getRefs: vi.fn(() => new Promise(() => {})), getLinked: vi.fn(() => Promise.resolve(null)), getStatus: vi.fn(() => new Promise(() => {})) };
});
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(), open: vi.fn() }));

const branch = (name: string, isHead = false) => ({ name, oid: name, upstream: null, gone: false, mergedInto: null, ahead: 0, behind: 0, isHead });
const REFS: RefsSnapshot = {
  head: { oid: "main", branch: "main", detached: false },
  state: "clean",
  local: [branch("main", true), branch("feature/panels")],
  remotes: [{ name: "origin", url: null, branches: [{ name: "origin/main", oid: "main", mergedInto: null }] }],
  tags: [],
  stashes: [{ index: 0, oid: "s0", message: "WIP", baseOid: "main", time: 0, hasUntracked: false }],
};

beforeEach(() => {
  window.innerWidth = 720;
  useViewStore.getState().__resetForTests();
  useRepoStore.setState({ refs: REFS, linked: null, remoteTags: {} });
  useDialogStore.setState({ dialog: null });
  useSettingsStore.setState({ sidebarFolders: "expanded", sidebarFoldersMax: DEFAULT_FOLDERS_MAX });
});
afterEach(cleanup);

describe("SidebarRail", () => {
  it("one button per section with its count; a click opens that section alone as a flyout; Escape closes it", () => {
    const { getByRole, queryByRole } = render(<SidebarRail />);
    expect(getByRole("button", { name: "Local, 2" })).toBeTruthy();
    expect(getByRole("button", { name: "Remotes, 1" })).toBeTruthy();
    expect(getByRole("button", { name: "Stashes, 1" })).toBeTruthy();
    expect(queryByRole("button", { name: /^Worktrees/ })).toBeNull();
    expect(queryByRole("tree")).toBeNull();
    fireEvent.click(getByRole("button", { name: "Local, 2" }));
    expect(getByRole("tree", { name: "Local branches" })).toBeTruthy();
    expect(queryByRole("tree", { name: "Remote branches" })).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(queryByRole("tree")).toBeNull();
  });
  it("switching sections while the flyout is open shows the new section expanded", () => {
    const { getByRole } = render(<SidebarRail />);
    fireEvent.click(getByRole("button", { name: "Local, 2" }));
    expect(getByRole("tree", { name: "Local branches" })).toBeTruthy();
    // Stashes starts collapsed in the sidebar proper; the flyout for it must not.
    fireEvent.click(getByRole("button", { name: "Stashes, 1" }));
    expect(getByRole("tree", { name: "Stashes" })).toBeTruthy();
  });
  it("a press on a row's context menu (portalled to body) does not close the flyout", () => {
    const { getByRole, getAllByRole, queryByRole } = render(<SidebarRail />);
    fireEvent.click(getByRole("button", { name: "Local, 2" }));
    fireEvent.contextMenu(getByRole("treeitem", { name: /^main/ }));
    fireEvent.mouseDown(getAllByRole("menuitem")[0]);
    expect(getByRole("tree", { name: "Local branches" })).toBeTruthy();
    expect(queryByRole("menu")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(queryByRole("tree")).toBeNull();
  });
  it("the bottom button expands the sidebar", () => {
    const { getByRole } = render(<SidebarRail />);
    fireEvent.click(getByRole("button", { name: "Expand sidebar" }));
    expect(useViewStore.getState().railOverride).toBe(false);
  });
});
