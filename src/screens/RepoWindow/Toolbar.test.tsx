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
  useRepoStore.setState({ repo: { id: "r", name: "r", path: "/r", head: { oid: "a", branch: "main", detached: false } } });
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
