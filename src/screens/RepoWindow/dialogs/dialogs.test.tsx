import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefsSnapshot, RepoSummary } from "../../../api/types";
import { useOpsStore } from "../../../store/opsStore";
import { useRepoStore } from "../../../store/repoStore";
import { useToastStore } from "../../../store/toastStore";
import { MergeDialog, PullDialog, PushDialog } from "./OpsDialogs";
import { CreateBranchDialog } from "./RefDialogs";

vi.mock("../../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/ipc")>();
  return {
    ...actual,
    push: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    merge: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    pull: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    createBranch: vi.fn(() => Promise.resolve()),
    getDefaultRemote: vi.fn(() => Promise.resolve("origin")),
    getConfig: vi.fn(() => Promise.resolve(null)),
    getStatus: vi.fn(() => new Promise(() => {})),
    getRefs: vi.fn(() => new Promise(() => {})),
  };
});

import * as ipc from "../../../api/ipc";
const mocked = ipc as unknown as Record<"push" | "merge" | "pull" | "createBranch", ReturnType<typeof vi.fn>>;

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

describe("PullDialog", () => {
  it("pulls the upstream's remote branch, not the local name", async () => {
    // `main` tracks `origin/main` here; the refspec must be the remote-side name.
    const { getByRole } = render(<PullDialog onClose={() => {}} />);
    const dialog = getByRole("dialog", { name: "Pull" });
    await waitFor(() => expect(preview(dialog)).toBe("git pull --progress --no-rebase origin main"));
    fireEvent.click(getByRole("button", { name: "Pull" }));
    await waitFor(() => expect(mocked.pull).toHaveBeenCalledWith("r", "origin", "main", "merge"));
  });

  it("names no branch when the current one does not track the chosen remote", async () => {
    useRepoStore.setState({ refs: { ...REFS, local: [{ ...REFS.local[0], upstream: "upstream/develop" }] } });
    const { getByRole } = render(<PullDialog onClose={() => {}} />);
    await waitFor(() => expect(preview(getByRole("dialog"))).toBe("git pull --progress --no-rebase origin"));
    fireEvent.click(getByRole("button", { name: "Pull" }));
    await waitFor(() => expect(mocked.pull).toHaveBeenCalledWith("r", "origin", null, "merge"));
  });
});

describe("CreateBranchDialog", () => {
  it("keeps a start point that is not a known ref (a commit oid from the grid)", async () => {
    const oid = "0123456789abcdef0123456789abcdef01234567";
    const { getByRole } = render(<CreateBranchDialog onClose={() => {}} startPoint={oid} />);
    const start = getByRole("combobox", { name: "Start point" }) as HTMLSelectElement;
    expect(start.value).toBe(oid);
    expect(Array.from(start.options)[0].textContent).toBe("0123456");
    fireEvent.change(getByRole("textbox", { name: "Name" }), { target: { value: "fix" } });
    // Not "HEAD": the branch must land on the commit the context menu was opened on.
    expect(preview(getByRole("dialog"))).toBe(`git checkout -b fix ${oid}`);
    fireEvent.click(getByRole("checkbox", { name: "Check out after create" }));
    fireEvent.click(getByRole("button", { name: "Create" }));
    await waitFor(() => expect(mocked.createBranch).toHaveBeenCalledWith("r", "fix", oid, false));
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
