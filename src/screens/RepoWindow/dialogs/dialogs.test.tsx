import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefsSnapshot, RepoSummary } from "../../../api/types";
import { useOpsStore } from "../../../store/opsStore";
import { useRepoStore } from "../../../store/repoStore";
import { useToastStore } from "../../../store/toastStore";
import { MergeDialog, PushDialog } from "./OpsDialogs";

vi.mock("../../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/ipc")>();
  return {
    ...actual,
    push: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    merge: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    getDefaultRemote: vi.fn(() => Promise.resolve("origin")),
    getConfig: vi.fn(() => Promise.resolve(null)),
    getStatus: vi.fn(() => new Promise(() => {})),
    getRefs: vi.fn(() => new Promise(() => {})),
  };
});

import * as ipc from "../../../api/ipc";
const mocked = ipc as unknown as { push: ReturnType<typeof vi.fn>; merge: ReturnType<typeof vi.fn> };

const REPO: RepoSummary = { id: "r", name: "r", path: "/r", head: { oid: "a", branch: "main", detached: false } };
const REFS: RefsSnapshot = {
  head: { oid: "a", branch: "main", detached: false },
  state: "clean",
  local: [
    { name: "main", oid: "a", upstream: "origin/main", gone: false, ahead: 2, behind: 0, isHead: true },
    { name: "feature/lane-graph", oid: "b", upstream: null, gone: false, ahead: 0, behind: 0, isHead: false },
  ],
  remotes: [{ name: "origin", url: "git@x/y.git", branches: [{ name: "origin/main", oid: "a" }] }],
  tags: [],
  stashes: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  useRepoStore.setState({ repo: REPO, refs: REFS });
  useOpsStore.setState({ ops: [], open: false, busy: null });
  useToastStore.setState({ toasts: [] });
});
afterEach(cleanup);

const preview = (el: HTMLElement) => el.querySelector("code")!.textContent;

describe("PushDialog", () => {
  it("previews the command for the option combinations and pushes the current branch", async () => {
    const { getByRole } = render(<PushDialog onClose={() => {}} />);
    const dialog = getByRole("dialog", { name: "Push" });
    await waitFor(() => expect(preview(dialog)).toBe("git push --progress origin main"));
    // `main` already has an upstream → Set upstream starts off.
    fireEvent.click(getByRole("checkbox", { name: "Set upstream" }));
    expect(preview(dialog)).toBe("git push --progress -u origin main");
    fireEvent.click(getByRole("checkbox", { name: "Force (with lease)" }));
    fireEvent.click(getByRole("checkbox", { name: "Push tags" }));
    expect(preview(dialog)).toBe("git push --progress -u --force-with-lease --tags origin main");
    fireEvent.click(getByRole("button", { name: "Push" }));
    await waitFor(() => expect(mocked.push).toHaveBeenCalledWith("r", "origin", "main", true, true, true));
  });

  it("checks Set upstream when the branch has none", async () => {
    const { getByRole } = render(<PushDialog onClose={() => {}} branch="feature/lane-graph" />);
    await waitFor(() => expect((getByRole("checkbox", { name: "Set upstream" }) as HTMLInputElement).checked).toBe(true));
    expect(preview(getByRole("dialog"))).toBe("git push --progress -u origin feature/lane-graph");
  });
});

describe("MergeDialog", () => {
  it("builds the merge args from strategy / squash / message", async () => {
    const onClose = vi.fn();
    const { getByRole } = render(<MergeDialog onClose={onClose} />);
    const dialog = getByRole("dialog", { name: "Merge into main" });
    expect(preview(dialog)).toBe("git merge --ff feature/lane-graph");
    fireEvent.change(getByRole("combobox", { name: "Strategy" }), { target: { value: "no" } });
    fireEvent.click(getByRole("checkbox", { name: "Squash into one commit" }));
    fireEvent.change(getByRole("textbox", { name: "Commit message" }), { target: { value: "custom msg" } });
    expect(preview(dialog)).toBe("git merge --no-ff --squash -m 'custom msg' feature/lane-graph");
    fireEvent.click(getByRole("button", { name: "Merge" }));
    expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(mocked.merge).toHaveBeenCalledWith("r", "feature/lane-graph", "no", true, "custom msg"));
  });
});
