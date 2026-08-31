import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Group } from "react-resizable-panels";
import { useOpsStore } from "../../store/opsStore";
import { DockPanel } from "./RepoWindow";

vi.mock("../../api/ipc", () => ({
  cancelOp: vi.fn(() => Promise.resolve(true)),
  toAppError: (e: unknown) => ({ kind: "unknown", message: String(e) }),
}));

// jsdom has neither ResizeObserver nor layout; `Group` needs the former to mount at all.
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  localStorage.clear();
  useOpsStore.setState({ ops: [], open: false, busy: null });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The dock only makes sense inside a Group; that's also where its resizing lives. */
const renderDock = (open: boolean) =>
  render(
    <Group orientation="vertical">
      <DockPanel open={open} />
    </Group>,
  );

describe("OutputDock", () => {
  it("collapsed: shows the placeholder and an Expand button that is disabled with no ops", () => {
    const { getByRole, getByText, queryByRole } = renderDock(false);
    expect(getByText("No output yet")).toBeTruthy();
    expect(getByRole("button", { name: "Expand output" }).hasAttribute("disabled")).toBe(true);
    expect(queryByRole("log", { name: "Command output" })).toBeNull();
  });

  it("a finished op shows its command and exit line; expanding reveals the log", () => {
    act(() => {
      const st = useOpsStore.getState();
      st.onEvent({ repoId: "r", opId: "1", event: { kind: "started", opId: "1", cmd: "git fetch origin" } });
      st.onEvent({ repoId: "r", opId: "1", event: { kind: "stdout", line: "Receiving objects: 100%" } });
      st.onEvent({ repoId: "r", opId: "1", event: { kind: "exit", code: 0, elapsedMs: 1500 } });
    });
    const { getByRole, getByText, rerender } = renderDock(false);
    expect(getByText("$ git fetch origin")).toBeTruthy();
    // Style guide §2: an icon, not a ✓ / ✗ dingbat — the exit code carries the meaning in text.
    const exit = getByText(/exit 0/);
    expect(exit.textContent).not.toMatch(/[✓✗]/);
    expect(exit.querySelector("svg")).toBeTruthy();

    fireEvent.click(getByRole("button", { name: "Expand output" }));
    expect(useOpsStore.getState().open).toBe(true);
    rerender(
      <Group orientation="vertical">
        <DockPanel open />
      </Group>,
    );
    expect(getByRole("log", { name: "Command output" }).textContent).toContain("Receiving objects: 100%");
  });

  it("a running op offers Cancel", () => {
    act(() => {
      useOpsStore.getState().onEvent({ repoId: "r", opId: "9", event: { kind: "started", opId: "9", cmd: "git clone x" } });
    });
    const { getByRole } = renderDock(false);
    expect(getByRole("button", { name: "Cancel" })).toBeTruthy();
  });
});
