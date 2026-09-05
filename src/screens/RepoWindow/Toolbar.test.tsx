import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDialogStore } from "../../store/dialogStore";
import { useOpsStore } from "../../store/opsStore";
import { useRepoStore } from "../../store/repoStore";
import { Toolbar } from "./Toolbar";

vi.mock("../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/ipc")>();
  return {
    ...actual,
    fetch: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    getDefaultRemote: vi.fn(() => Promise.resolve("origin")),
    getStatus: vi.fn(() => new Promise(() => {})),
    getRefs: vi.fn(() => new Promise(() => {})),
  };
});

import * as ipc from "../../api/ipc";
const mocked = ipc as unknown as Record<"fetch", ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
  useRepoStore.setState({ repo: { id: "r", name: "r", path: "/r", head: { oid: "a", branch: "main", detached: false } }, refs: null });
  useOpsStore.setState({ ops: [], open: false, busy: null });
  useDialogStore.setState({ dialog: null });
});
afterEach(cleanup);

describe("Toolbar Fetch", () => {
  it("is a split button: the label fetches the default remote, the ▾ opens the Fetch dialog", async () => {
    const { getByRole } = render(<Toolbar />);
    fireEvent.click(getByRole("button", { name: "Fetch" }));
    await waitFor(() => expect(mocked.fetch).toHaveBeenCalledWith("r", "origin", true, false));
    expect(useDialogStore.getState().dialog).toBeNull();

    fireEvent.click(getByRole("button", { name: "Fetch options" }));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "fetch" });
  });
});

describe("Toolbar settings", () => {
  it("the gear opens the settings dialog", () => {
    const { getByRole } = render(<Toolbar />);
    fireEvent.click(getByRole("button", { name: "Settings" }));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "settings" });
  });
});

describe("Toolbar Commit", () => {
  it("is disabled with no changes, but a merge still to be committed enables it", () => {
    const { getByRole, rerender } = render(<Toolbar />);
    expect(getByRole("button", { name: "Commit" }).hasAttribute("disabled")).toBe(true);
    // "Keep main's version" on the only conflict: MERGE_HEAD is there, the status is empty.
    useRepoStore.setState({ refs: { head: { oid: "a", branch: "main", detached: false }, state: "merge", local: [], remotes: [], tags: [], stashes: [] } });
    rerender(<Toolbar />);
    expect(getByRole("button", { name: "Commit" }).hasAttribute("disabled")).toBe(false);
  });
});

describe("Toolbar Repository menu", () => {
  it("offers Commit…, which opens the commit dialog", () => {
    const { getByRole } = render(<Toolbar />);
    fireEvent.click(getByRole("button", { name: "r" }));
    fireEvent.click(getByRole("menuitem", { name: /Commit…/ }));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "commit" });
  });
  it("offers Run git command…, which opens the dialog", () => {
    const { getByRole } = render(<Toolbar />);
    fireEvent.click(getByRole("button", { name: "r" }));
    fireEvent.click(getByRole("menuitem", { name: /Run git command/ }));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "runCommand" });
  });
});
