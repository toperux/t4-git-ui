import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkdirStatus } from "../../../api/types";
import { useCommitStore } from "../../../store/commitStore";
import { useRepoStore } from "../../../store/repoStore";
import { useStatusStore } from "../../../store/statusStore";
import { CommitPanel } from "./CommitPanel";

vi.mock("../../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/ipc")>();
  return {
    ...actual,
    getStatus: vi.fn(() => new Promise(() => {})),
    getChangedFiles: vi.fn(() => Promise.resolve([])),
    getFileDiff: vi.fn(() => new Promise(() => {})),
    getAuthor: vi.fn(() => Promise.resolve({ name: "Ada", email: "ada@x" })),
    stagePaths: vi.fn(() => Promise.resolve()),
    unstagePaths: vi.fn(() => Promise.resolve()),
  };
});
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(() => Promise.resolve(true)) }));
// jsdom has no ResizeObserver: flatten the resizable layout.
vi.mock("react-resizable-panels", () => ({
  Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Separator: () => null,
}));

import * as ipc from "../../../api/ipc";
const mocked = ipc as unknown as { stagePaths: ReturnType<typeof vi.fn> };

const STATUS: WorkdirStatus = {
  entries: [
    { path: "a.rs", oldPath: null, index: null, workdir: "modified", conflicted: false },
    { path: "both.rs", oldPath: null, index: "modified", workdir: "modified", conflicted: false },
    { path: "conflict.rs", oldPath: null, index: null, workdir: null, conflicted: true },
    { path: "new.rs", oldPath: null, index: "added", workdir: null, conflicted: false },
    { path: "untracked.txt", oldPath: null, index: null, workdir: "untracked", conflicted: false },
  ],
  staged: 2,
  unstaged: 2,
  untracked: 1,
  conflicted: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  useRepoStore.setState({ repo: { id: "r", name: "r", path: "r", head: { oid: "h", branch: "main", detached: false } }, wtSelected: true });
  useStatusStore.setState({ status: STATUS, error: null });
  useCommitStore.getState().reset();
});
afterEach(cleanup);

const text = (el: Element) => el.textContent?.replace(/\s+/g, " ").trim();

describe("CommitPanel", () => {
  it("splits the status into Unstaged / Staged lists with glyphs and marks conflicts non-stageable", () => {
    const { getByRole } = render(<CommitPanel />);
    const unstaged = Array.from(getByRole("listbox", { name: "Unstaged files" }).querySelectorAll('[role="option"]'));
    const staged = Array.from(getByRole("listbox", { name: "Staged files" }).querySelectorAll('[role="option"]'));
    expect(unstaged.map(text)).toEqual(["Ma.rs", "Mboth.rs", "Cconflict.rs", "Uuntracked.txt"]);
    expect(staged.map(text)).toEqual(["Mboth.rs", "Anew.rs"]);
    expect(unstaged[2].getAttribute("aria-disabled")).toBe("true");
    expect(unstaged[2].getAttribute("title")).toBe("Resolve conflicts first");
    expect(getByRole("listbox", { name: "Unstaged files" }).getAttribute("aria-multiselectable")).toBe("true");
    // First unstaged file is focused by default.
    expect(unstaged[0].getAttribute("aria-selected")).toBe("true");
  });

  it("Stage all stages every non-conflicted unstaged path", () => {
    const { getByRole } = render(<CommitPanel />);
    fireEvent.click(getByRole("button", { name: "Stage all" }));
    expect(mocked.stagePaths).toHaveBeenCalledWith("r", ["a.rs", "both.rs", "untracked.txt"]);
  });

  it("click / ctrl / shift build a multi-selection in one list", () => {
    const { getByRole } = render(<CommitPanel />);
    const rows = () => Array.from(getByRole("listbox", { name: "Unstaged files" }).querySelectorAll('[role="option"]'));
    fireEvent.click(rows()[0]);
    fireEvent.click(rows()[3], { shiftKey: true });
    expect(rows().map((r) => r.getAttribute("aria-selected"))).toEqual(["true", "true", "true", "true"]);
    fireEvent.click(rows()[1], { ctrlKey: true });
    expect(rows().map((r) => r.getAttribute("aria-selected"))).toEqual(["true", "false", "true", "true"]);
    // Clicking the other list moves the selection there.
    const staged = Array.from(getByRole("listbox", { name: "Staged files" }).querySelectorAll('[role="option"]'));
    fireEvent.click(staged[1]);
    expect(rows().every((r) => r.getAttribute("aria-selected") === "false")).toBe(true);
    expect(staged[1].getAttribute("aria-selected")).toBe("true");
  });

  it("Commit is disabled until a summary exists; the counter turns danger past 72", async () => {
    const { getByRole, getByLabelText, findByText } = render(<CommitPanel />);
    const commit = getByRole("button", { name: "Commit" });
    expect(commit.hasAttribute("disabled")).toBe(true);
    // Commit & Push follows the same rules as Commit (it commits, then opens the Push dialog).
    expect(getByRole("button", { name: "Commit & Push" }).hasAttribute("disabled")).toBe(true);
    await findByText(/Ada <ada@x> · will commit 2 staged files/);

    const summary = getByLabelText("Summary") as HTMLInputElement;
    fireEvent.change(summary, { target: { value: "Fix lanes" } });
    expect(commit.hasAttribute("disabled")).toBe(false);
    const counter = getByLabelText(/of 72 characters/);
    expect(counter.textContent).toBe("9/72");
    expect(counter.className).not.toMatch(/over/);
    fireEvent.change(summary, { target: { value: "x".repeat(73) } });
    expect(counter.textContent).toBe("73/72");
    expect(counter.className).toMatch(/over/);
  });

  it("Commit stays disabled with nothing staged unless amending; the staged header says so", () => {
    useStatusStore.setState({ status: { ...STATUS, staged: 0, entries: STATUS.entries.filter((e) => e.index === null) } });
    useCommitStore.setState({ summary: "msg" });
    const { getByRole, getByText } = render(<CommitPanel />);
    expect(getByRole("button", { name: "Commit" }).hasAttribute("disabled")).toBe(true);
    act(() => useCommitStore.setState({ amend: true }));
    expect(getByRole("button", { name: "Commit" }).hasAttribute("disabled")).toBe(false);
    expect(getByText("Staged (amending)")).toBeTruthy();
  });
});
