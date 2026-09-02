import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDialogStore } from "../../store/dialogStore";
import { useOpsStore } from "../../store/opsStore";
import { useRepoStore } from "../../store/repoStore";
import { useShortcuts } from "./useShortcuts";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));

beforeEach(() => {
  useRepoStore.setState({ repo: { id: "r", name: "r", path: "/r", head: { oid: "a", branch: "main", detached: false } } });
  useDialogStore.setState({ dialog: null });
  useOpsStore.setState({ ops: [], open: false, busy: null });
});
afterEach(cleanup);

describe("useShortcuts", () => {
  it("Ctrl+Shift+R opens the Run git command dialog, not while an op runs", () => {
    renderHook(() => useShortcuts());
    fireEvent.keyDown(window, { key: "R", ctrlKey: true, shiftKey: true });
    expect(useDialogStore.getState().dialog).toEqual({ kind: "runCommand" });

    useDialogStore.setState({ dialog: null });
    useOpsStore.setState({ busy: "Fetching…" });
    fireEvent.keyDown(window, { key: "R", ctrlKey: true, shiftKey: true });
    expect(useDialogStore.getState().dialog).toBeNull();
  });

  it("Ctrl+` toggles the dock even from a text field, where the other shortcuts are ignored", () => {
    renderHook(() => useShortcuts());
    const input = document.body.appendChild(document.createElement("input"));
    expect(fireEvent.keyDown(input, { key: "`", ctrlKey: true })).toBe(false);
    expect(useOpsStore.getState().open).toBe(true);
    fireEvent.keyDown(input, { key: "R", ctrlKey: true, shiftKey: true });
    expect(useDialogStore.getState().dialog).toBeNull();
    fireEvent.keyDown(input, { key: "`", ctrlKey: true });
    expect(useOpsStore.getState().open).toBe(false);
    input.remove();
  });
});
