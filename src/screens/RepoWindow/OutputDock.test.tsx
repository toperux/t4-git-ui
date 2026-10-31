import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Group } from "react-resizable-panels";
import * as ipc from "../../api/ipc";
import { useCmdHistoryStore } from "../../store/cmdHistoryStore";
import { useOpsStore } from "../../store/opsStore";
import { useRepoStore } from "../../store/repoStore";
import { armsDockGesture, DockPanel, isDraggedHeight } from "./RepoWindow";

vi.mock("../../api/ipc", () => ({
  cancelOp: vi.fn(() => Promise.resolve(true)),
  runGit: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
  getStatus: vi.fn(() => new Promise(() => {})),
  getRefs: vi.fn(() => new Promise(() => {})),
  getLinked: vi.fn(() => Promise.resolve(null)),
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
  // The dock shows the open repository's ops: the cases below feed `repoId: "r"`.
  showRepo("r");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function showRepo(id: string) {
  useRepoStore.setState({ repo: { id, name: id, path: `/${id}`, head: { oid: "a", branch: "main", detached: false } } });
}

/** A finished op against `repoId`, printing `lines`. */
function ran(repoId: string | null, opId: string, cmd: string, lines: string[]) {
  const st = useOpsStore.getState();
  st.onEvent({ repoId, opId, event: { kind: "started", opId, cmd } });
  st.onEvent({ repoId, opId, event: { kind: "stdout", lines } });
  st.onEvent({ repoId, opId, event: { kind: "exit", code: 0, elapsedMs: 10 } });
}

/** The dock only makes sense inside a Group; that's also where its resizing lives. */
const renderDock = (open: boolean) =>
  render(
    <Group orientation="vertical">
      <DockPanel open={open} gesture={{ current: false }} gestureEnd={{ current: () => {} }} group={{ current: null }} />
    </Group>,
  );

describe("OutputDock", () => {
  it("collapsed with no ops: shows the placeholder, and Expand opens it to the prompt", () => {
    const { getByRole, getByText, queryByRole } = renderDock(false);
    expect(getByText("No output yet")).toBeTruthy();
    expect(queryByRole("log", { name: "Command output" })).toBeNull();
    const expand = getByRole("button", { name: "Expand output" });
    expect(expand.hasAttribute("disabled")).toBe(false);
    fireEvent.click(expand);
    expect(useOpsStore.getState().open).toBe(true);
  });

  it("a finished op shows its command and exit line; expanding reveals the log", () => {
    act(() => {
      const st = useOpsStore.getState();
      st.onEvent({ repoId: "r", opId: "1", event: { kind: "started", opId: "1", cmd: "git fetch origin" } });
      st.onEvent({ repoId: "r", opId: "1", event: { kind: "stdout", lines: ["Receiving objects: 100%"] } });
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
        <DockPanel open gesture={{ current: false }} gestureEnd={{ current: () => {} }} group={{ current: null }} />
      </Group>,
    );
    expect(getByRole("log", { name: "Command output" }).textContent).toContain("Receiving objects: 100%");
  });

  it("a cancelled op reads as cancelled, muted, not as its exit code", async () => {
    act(() => {
      useOpsStore.getState().onEvent({ repoId: "r", opId: "1", event: { kind: "started", opId: "1", cmd: "git fetch origin" } });
    });
    await act(() => useOpsStore.getState().cancel("1"));
    act(() => {
      useOpsStore.getState().onEvent({ repoId: "r", opId: "1", event: { kind: "exit", code: -1, elapsedMs: 3300 } });
      useOpsStore.getState().setOpen(true);
    });
    const { getByRole, getAllByText, queryByText } = renderDock(true);
    // The header's summary and the log's exit line both.
    const lines = getAllByText(/cancelled · 3\.3s/);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line.querySelector("svg")).toBeTruthy();
      expect(line.className).toMatch(/muted/);
      expect(line.className).not.toMatch(/err/);
    }
    expect(queryByText(/exit -1/)).toBeNull();
    expect(getByRole("log", { name: "Command output" }).textContent).toContain("cancelled");
  });

  it("scrolls to the bottom when an op exits, so its last line is not cut off", () => {
    act(() => {
      const st = useOpsStore.getState();
      st.onEvent({ repoId: "r", opId: "1", event: { kind: "started", opId: "1", cmd: "git push origin main" } });
      st.onEvent({ repoId: "r", opId: "1", event: { kind: "stderr", lines: ["remote: rejected"] } });
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

  it("shows the open repository's ops and the repo-less ones; the collapsed bar names the tab's last command", () => {
    act(() => {
      ran(null, "1", "git clone x", ["cloned"]);
      ran("r", "2", "git status", ["on main"]);
      ran("other", "3", "git commit -F msg", ["other's commit"]);
    });
    const { getByRole, getByText, rerender } = renderDock(false);
    expect(getByText("$ git status")).toBeTruthy();

    act(() => useOpsStore.getState().setOpen(true));
    rerender(
      <Group orientation="vertical">
        <DockPanel open gesture={{ current: false }} gestureEnd={{ current: () => {} }} group={{ current: null }} />
      </Group>,
    );
    const log = getByRole("log", { name: "Command output" }).textContent;
    expect(log).toContain("cloned");
    expect(log).toContain("on main");
    expect(log).not.toContain("other's commit");
  });

  it("scrolls to the bottom on a tab switch, even when both tabs' lists have the same row count", () => {
    act(() => {
      ran("r1", "1", "git status", ["r1's"]);
      ran("r2", "2", "git status", ["r2's"]);
      useOpsStore.getState().setOpen(true);
    });
    showRepo("r1");
    // On the prototype, not the node: the switch remounts the log as a new node.
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", { value: 500, configurable: true });
    try {
      const { getByRole } = renderDock(true);
      getByRole("log", { name: "Command output" }).scrollTop = 0;
      act(() => showRepo("r2"));
      const log = getByRole("log", { name: "Command output" });
      expect(log.textContent).toContain("r2's");
      expect(log.scrollTop).toBe(500);
    } finally {
      delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
    }
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


// The dock remembers a height only when a gesture on the separator asked for it *and* the value is
// one a gesture could have produced. Both halves are pure and tested here; that they meet correctly
// is a layout question, and jsdom lays out no panels — the CDP walk in
// docs/archive/plans/2026-09-15-self-healing-layout-plan.md is the check for that.

describe("isDraggedHeight", () => {
  // Walked 2026-09-15: a drag below the 94px midpoint snaps to the 28px bar while the pointer is
  // still down, and a drag in a window too short for 160 reports the squeezed box. Both arrive as a
  // genuine gesture, and recording either reopened the dock as a bare header bar for the session —
  // the very bug the heal exists to prevent.
  it("takes the heights a gesture can produce", () => {
    expect(isDraggedHeight(200)).toBe(true);
    expect(isDraggedHeight(160)).toBe(true);
    expect(isDraggedHeight(320)).toBe(true);
  });

  it("rejects the snap to the collapsed bar, and a squeezed box", () => {
    expect(isDraggedHeight(159)).toBe(false);
    expect(isDraggedHeight(146)).toBe(false);
    expect(isDraggedHeight(32)).toBe(false);
    expect(isDraggedHeight(28)).toBe(false);
    expect(isDraggedHeight(321)).toBe(false);
  });
});

describe("armsDockGesture", () => {
  it("arms on a primary press while the dock is open", () => {
    expect(armsDockGesture({ pointerType: "mouse", button: 0 }, true)).toBe(true);
    expect(armsDockGesture({ pointerType: "touch" }, true)).toBe(true);
  });

  it("ignores a press on the collapsed dock, and a non-primary button", () => {
    // `disabled` on a Separator is only `aria-disabled` on a div, so the press still reaches us.
    expect(armsDockGesture({ pointerType: "mouse", button: 0 }, false)).toBe(false);
    // Right-click raises a context menu, and the release that would clear the flag may never come.
    expect(armsDockGesture({ pointerType: "mouse", button: 2 }, true)).toBe(false);
  });
});
