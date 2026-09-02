import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Group } from "react-resizable-panels";
import * as ipc from "../../api/ipc";
import { useCmdHistoryStore } from "../../store/cmdHistoryStore";
import { useOpsStore } from "../../store/opsStore";
import { useRepoStore } from "../../store/repoStore";
import { DockPanel } from "./RepoWindow";

vi.mock("../../api/ipc", () => ({
  cancelOp: vi.fn(() => Promise.resolve(true)),
  runGit: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
  getStatus: vi.fn(() => new Promise(() => {})),
  getRefs: vi.fn(() => new Promise(() => {})),
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
  vi.clearAllMocks();
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

  it("scrolls to the bottom when an op exits, so its last line is not cut off", () => {
    act(() => {
      const st = useOpsStore.getState();
      st.onEvent({ repoId: "r", opId: "1", event: { kind: "started", opId: "1", cmd: "git push origin main" } });
      st.onEvent({ repoId: "r", opId: "1", event: { kind: "stderr", line: "remote: rejected" } });
      st.setOpen(true);
    });
    const { getByRole } = renderDock(true);
    const log = getByRole("log", { name: "Command output" });
    // jsdom does no layout, so the overflow the effect scrolls past has to be faked.
    Object.defineProperty(log, "scrollHeight", { value: 500, configurable: true });
    log.scrollTop = 0;

    act(() => {
      useOpsStore.getState().onEvent({ repoId: "r", opId: "1", event: { kind: "exit", code: 1, elapsedMs: 10 } });
    });
    expect(log.scrollTop).toBe(500);
  });

  it("a running op offers Cancel", () => {
    act(() => {
      useOpsStore.getState().onEvent({ repoId: "r", opId: "9", event: { kind: "started", opId: "9", cmd: "git clone x" } });
    });
    const { getByRole } = renderDock(false);
    expect(getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("expanded: the prompt runs a typed line, clears itself, and records the line", async () => {
    useRepoStore.setState({ repo: { id: "r", name: "r", path: "/r", head: { oid: "a", branch: "main", detached: false } } });
    useCmdHistoryStore.setState({ history: [] });
    act(() => useOpsStore.getState().setOpen(true));
    const { getByRole } = renderDock(true);
    const prompt = getByRole("combobox", { name: "Run git command" }) as HTMLInputElement;
    fireEvent.change(prompt, { target: { value: "status" } });
    fireEvent.keyDown(prompt, { key: "Enter" });
    await waitFor(() => expect(ipc.runGit).toHaveBeenCalledWith("r", ["status"]));
    expect(prompt.value).toBe("");
    expect(useCmdHistoryStore.getState().history).toEqual(["status"]);
  });

  it("while an op runs the prompt stays enabled (and focused) but Enter waits; afterwards it runs", async () => {
    useRepoStore.setState({ repo: { id: "r", name: "r", path: "/r", head: { oid: "a", branch: "main", detached: false } } });
    useOpsStore.setState({ open: true, busy: "Fetching…" });
    const { getByRole } = renderDock(true);
    const prompt = getByRole("combobox", { name: "Run git command" }) as HTMLInputElement;
    expect(prompt.disabled).toBe(false);
    expect(prompt.placeholder).toBe("Running…");
    prompt.focus();
    fireEvent.change(prompt, { target: { value: "status" } });
    fireEvent.keyDown(prompt, { key: "Enter" });
    expect(ipc.runGit).not.toHaveBeenCalled();
    expect(prompt.value).toBe("status");

    act(() => useOpsStore.setState({ busy: null }));
    expect(document.activeElement).toBe(prompt);
    fireEvent.keyDown(prompt, { key: "Enter" });
    await waitFor(() => expect(ipc.runGit).toHaveBeenCalledWith("r", ["status"]));
  });

  it("refuses a flag that needs a terminal", () => {
    useOpsStore.setState({ open: true });
    const { getByRole, getByText } = renderDock(true);
    const prompt = getByRole("combobox", { name: "Run git command" });
    fireEvent.change(prompt, { target: { value: "add -p" } });
    fireEvent.keyDown(prompt, { key: "Enter" });
    expect(getByText("-p needs a terminal")).toBeTruthy();
    expect(ipc.runGit).not.toHaveBeenCalled();
  });
});
