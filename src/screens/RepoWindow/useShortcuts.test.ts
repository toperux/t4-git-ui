import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDialogStore } from "../../store/dialogStore";
import { useOpsStore } from "../../store/opsStore";
import { useRepoStore } from "../../store/repoStore";
import { useViewStore } from "../../store/viewStore";
import { usePaletteStore } from "./CommandPalette/paletteStore";
import { useShortcuts } from "./useShortcuts";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));

beforeEach(() => {
  useRepoStore.setState({ repo: { id: "r", name: "r", path: "/r", head: { oid: "a", branch: "main", detached: false } } });
  useDialogStore.setState({ dialog: null });
  useOpsStore.setState({ ops: [], open: false, busy: null });
  useViewStore.getState().__resetForTests();
  usePaletteStore.getState().__resetForTests();
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

  it("Alt+1 / Alt+2 switch the view; Ctrl+2 still means the second tab", () => {
    renderHook(() => useShortcuts());
    fireEvent.keyDown(window, { key: "2", code: "Digit2", altKey: true });
    expect(useViewStore.getState().view).toBe("changes");
    fireEvent.keyDown(window, { key: "¡", code: "Digit1", altKey: true }); // Option+1 on a Mac keyboard
    expect(useViewStore.getState().view).toBe("history");
    fireEvent.keyDown(window, { key: "2", code: "Digit2", ctrlKey: true });
    expect(useViewStore.getState().view).toBe("history");
  });

  it("Ctrl+Shift+` toggles the sidebar rail, even from a text field", () => {
    window.innerWidth = 1280;
    renderHook(() => useShortcuts());
    const input = document.body.appendChild(document.createElement("input"));
    // `key` is layout-dependent once shifted (`~` on a US layout), so the match is on `code`.
    fireEvent.keyDown(input, { key: "~", code: "Backquote", ctrlKey: true, shiftKey: true });
    expect(useViewStore.getState().railOverride).toBe(true);
    input.remove();
  });

  it("Ctrl+K toggles the palette, even from a text field; other shortcuts sleep while it is open", () => {
    renderHook(() => useShortcuts());
    const input = document.body.appendChild(document.createElement("input"));
    fireEvent.keyDown(input, { key: "k", ctrlKey: true });
    expect(usePaletteStore.getState().open).toBe(true);
    fireEvent.keyDown(window, { key: "2", code: "Digit2", altKey: true });
    expect(useViewStore.getState().view).toBe("history");
    fireEvent.keyDown(input, { key: "k", ctrlKey: true });
    expect(usePaletteStore.getState().open).toBe(false);
    input.remove();
  });
});
