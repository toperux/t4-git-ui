import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
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
    startLog: vi.fn(() => Promise.resolve(1)),
    getLogPage: vi.fn(() => new Promise(() => {})),
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

  it("clears the search filter first — the pseudo-row that mounts the panel is hidden while it flattens the walk", () => {
    useRepoStore.setState({
      refs: { head: { oid: "a", branch: "main", detached: false }, state: "merge", local: [], remotes: [], tags: [], stashes: [] },
      filter: { text: "lane" },
      log: { generation: 1, total: 1, complete: true, error: null, flat: true },
      wtSelected: false,
    });
    const { getByRole, getByLabelText } = render(<Toolbar />);
    expect((getByLabelText("Search commits") as HTMLInputElement).value).toBe("lane");

    fireEvent.click(getByRole("button", { name: "Commit" }));
    expect(useRepoStore.getState().filter.text).toBeNull();
    expect(useRepoStore.getState().wtSelected).toBe(true);
    // The field follows the store, so it doesn't keep showing a filter that is no longer applied.
    expect((getByLabelText("Search commits") as HTMLInputElement).value).toBe("");
  });
});

describe("Toolbar Branch menu", () => {
  it("names its own button as the dialog's focus target, even once an op wraps it in a hint", () => {
    const { getByRole } = render(<Toolbar />);
    fireEvent.click(getByRole("button", { name: "Branch" }));
    // An op starting under the open menu wraps the disabled trigger in a `DisabledHint` span.
    act(() => useOpsStore.setState({ busy: "Pushing to origin…" }));
    const branch = getByRole("button", { name: "Branch" });
    expect(branch.parentElement?.getAttribute("role")).toBe("none");

    fireEvent.click(getByRole("menuitem", { name: /Create branch/ }));
    expect(useDialogStore.getState().returnFocus).toBe(branch);
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
  it("offers Add remote…, which opens the dialog", () => {
    const { getByRole } = render(<Toolbar />);
    fireEvent.click(getByRole("button", { name: "r" }));
    fireEvent.click(getByRole("menuitem", { name: /Add remote/ }));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "addRemote" });
  });
  it("groups the items: act on the open repo, switch to another, close", () => {
    const { getByRole } = render(<Toolbar />);
    fireEvent.click(getByRole("button", { name: "r" }));
    // The Kbd renders inside the item, so strip the shortcut off the text.
    const items = Array.from(getByRole("menu", { name: "Repository" }).children).map((el) => (el.getAttribute("role") === "separator" ? "---" : el.textContent!.replace(/Ctrl.*$/, "")));
    expect(items).toEqual(["Commit…", "Add remote…", "Run git command…", "---", "Open repository…", "No other recent repositories", "---", "Close repository"]);
  });
});
