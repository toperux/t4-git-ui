import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefsSnapshot, RepoSummary } from "../../../api/types";
import { useOpsStore } from "../../../store/opsStore";
import { useRepoStore } from "../../../store/repoStore";
import { useToastStore } from "../../../store/toastStore";
import { DeleteRemoteTagDialog, MergeDialog, PullDialog, PushDialog, PushTagDialog, ResetBranchDialog, ResetDialog } from "./OpsDialogs";
import { CheckoutBranchDialog, CreateBranchDialog, CreateTagDialog, DeleteTagDialog } from "./RefDialogs";

vi.mock("../../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/ipc")>();
  return {
    ...actual,
    push: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    merge: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    pull: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    reset: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    resetBranch: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    checkout: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    createBranch: vi.fn(() => Promise.resolve()),
    createTag: vi.fn(() => Promise.resolve()),
    deleteTag: vi.fn(() => Promise.resolve()),
    deleteRemoteBranch: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    getDefaultRemote: vi.fn(() => Promise.resolve("origin")),
    getConfig: vi.fn(() => Promise.resolve(null)),
    getStatus: vi.fn(() => new Promise(() => {})),
    getRefs: vi.fn(() => new Promise(() => {})),
  };
});

import * as ipc from "../../../api/ipc";
const mocked = ipc as unknown as Record<
  "push" | "merge" | "pull" | "reset" | "resetBranch" | "checkout" | "createBranch" | "createTag" | "deleteTag" | "deleteRemoteBranch",
  ReturnType<typeof vi.fn>
>;

const REPO: RepoSummary = { id: "r", name: "r", path: "/r", head: { oid: "a", branch: "main", detached: false } };
const REFS: RefsSnapshot = {
  head: { oid: "a", branch: "main", detached: false },
  state: "clean",
  local: [
    { name: "main", oid: "a", upstream: "origin/main", gone: false, mergedInto: null, ahead: 2, behind: 0, isHead: true },
    { name: "feature/lane-graph", oid: "b", upstream: null, gone: false, mergedInto: null, ahead: 0, behind: 0, isHead: false },
  ],
  remotes: [{ name: "origin", url: "git@x/y.git", branches: [{ name: "origin/main", oid: "a", mergedInto: null }] }],
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

describe("PushTagDialog", () => {
  it("pushes one tag by its full ref, to the default remote", async () => {
    const { getByRole } = render(<PushTagDialog onClose={() => {}} name="v1.2.0" />);
    const dialog = getByRole("dialog", { name: "Push tag" });
    // `refs/tags/…`, not the bare name: a branch called v1.2.0 must not be what goes out.
    await waitFor(() => expect(preview(dialog)).toBe("git push --progress origin refs/tags/v1.2.0"));
    fireEvent.click(getByRole("button", { name: "Push" }));
    await waitFor(() => expect(mocked.push).toHaveBeenCalledWith("r", "origin", "refs/tags/v1.2.0", false, false, false));
  });
});

describe("DeleteTagDialog", () => {
  it("deletes locally only by default; with the box ticked the remote goes first, and a failure there keeps the local tag", async () => {
    const { getByRole, unmount } = render(<DeleteTagDialog onClose={() => {}} name="v1.2.0" />);
    const dialog = getByRole("dialog", { name: "Delete tag" });
    expect(preview(dialog)).toBe("git tag -d v1.2.0");
    fireEvent.click(getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mocked.deleteTag).toHaveBeenCalledWith("r", "v1.2.0"));
    expect(mocked.deleteRemoteBranch).not.toHaveBeenCalled();
    unmount();

    vi.clearAllMocks();
    const second = render(<DeleteTagDialog onClose={() => {}} name="v1.2.0" />);
    fireEvent.click(second.getByRole("checkbox", { name: "Also delete on the remote" }));
    await waitFor(() => expect(preview(second.getByRole("dialog"))).toBe("git push origin --delete refs/tags/v1.2.0 && git tag -d v1.2.0"));
    fireEvent.click(second.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mocked.deleteTag).toHaveBeenCalledWith("r", "v1.2.0"));
    expect(mocked.deleteRemoteBranch).toHaveBeenCalledWith("r", "origin", "refs/tags/v1.2.0");
    // Remote first: once the local tag is gone there is nothing left to retry from.
    expect(mocked.deleteRemoteBranch.mock.invocationCallOrder[0]).toBeLessThan(mocked.deleteTag.mock.invocationCallOrder[0]);
    second.unmount();

    vi.clearAllMocks();
    mocked.deleteRemoteBranch.mockImplementationOnce(() => Promise.resolve({ opId: "1", code: 1, conflicts: [], failure: { kind: "other", message: "no" } }));
    const third = render(<DeleteTagDialog onClose={() => {}} name="v1.2.0" />);
    fireEvent.click(third.getByRole("checkbox", { name: "Also delete on the remote" }));
    fireEvent.click(third.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mocked.deleteRemoteBranch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(mocked.deleteTag).not.toHaveBeenCalled();
  });
});

describe("ResetDialog", () => {
  it("defaults to mixed, previews the exact command, and hard turns the button into a danger action", async () => {
    const oid = "deadbeefcafe0123456789abcdef0123456789ab";
    const { getByRole } = render(<ResetDialog onClose={() => {}} target={oid} />);
    const dialog = getByRole("dialog", { name: "Reset main" });
    expect(preview(dialog)).toBe(`git reset --mixed ${oid}`);

    fireEvent.click(getByRole("combobox", { name: "Mode" }));
    fireEvent.click(getByRole("option", { name: "Hard — discard all uncommitted changes" }));
    expect(preview(dialog)).toBe(`git reset --hard ${oid}`);
    fireEvent.click(getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(mocked.reset).toHaveBeenCalledWith("r", "hard", oid));
  });

  it("shows a ref target as is", () => {
    const { getByRole } = render(<ResetDialog onClose={() => {}} target="origin/main" />);
    expect(preview(getByRole("dialog", { name: "Reset main" }))).toBe("git reset --mixed origin/main");
  });
});

describe("ResetBranchDialog", () => {
  it("force-moves the branch with `git branch -f`", async () => {
    const { getByRole } = render(<ResetBranchDialog onClose={() => {}} branch="feature/lane-graph" target="origin/main" />);
    expect(preview(getByRole("dialog", { name: "Reset feature/lane-graph" }))).toBe("git branch -f feature/lane-graph origin/main");
    fireEvent.click(getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(mocked.resetBranch).toHaveBeenCalledWith("r", "feature/lane-graph", "origin/main"));
  });
});

describe("CheckoutBranchDialog", () => {
  it("checks out the picked local branch, or a remote one as a new tracking local", async () => {
    const branches = [
      { name: "feature/lane-graph", remote: null },
      { name: "origin/topic", remote: "origin" },
    ];
    const { getByRole } = render(<CheckoutBranchDialog onClose={() => {}} branches={branches} />);
    const dialog = getByRole("dialog", { name: "Checkout" });
    expect(preview(dialog)).toBe("git checkout feature/lane-graph");

    fireEvent.click(getByRole("combobox", { name: "Branch" }));
    fireEvent.click(getByRole("option", { name: "origin/topic" }));
    expect(preview(dialog)).toBe("git checkout --track -b topic origin/topic");
    fireEvent.click(getByRole("button", { name: "Checkout" }));
    await waitFor(() => expect(mocked.checkout).toHaveBeenCalledWith("r", "origin/topic", "topic", true));
  });
});

describe("DeleteRemoteTagDialog", () => {
  it("deletes the tag on the chosen remote by its full ref and leaves the local one alone", async () => {
    useRepoStore.setState({ refs: { ...REFS, remotes: [...REFS.remotes, { name: "fork", url: null, branches: [] }] } });
    const { getByRole } = render(<DeleteRemoteTagDialog onClose={() => {}} name="v1.2.0" />);
    const dialog = getByRole("dialog", { name: "Delete remote tag" });
    await waitFor(() => expect(preview(dialog)).toBe("git push origin --delete refs/tags/v1.2.0"));
    fireEvent.click(getByRole("combobox", { name: "Remote" }));
    fireEvent.click(getByRole("option", { name: "fork" }));
    expect(preview(dialog)).toBe("git push fork --delete refs/tags/v1.2.0");
    fireEvent.click(getByRole("button", { name: "Delete on remote" }));
    await waitFor(() => expect(mocked.deleteRemoteBranch).toHaveBeenCalledWith("r", "fork", "refs/tags/v1.2.0"));
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
    expect(getByRole("combobox", { name: "Start point" }).textContent).toBe("0123456");
    fireEvent.change(getByRole("textbox", { name: "Name" }), { target: { value: "fix" } });
    // Not "HEAD": the branch must land on the commit the context menu was opened on.
    expect(preview(getByRole("dialog"))).toBe(`git checkout -b fix ${oid}`);
    fireEvent.click(getByRole("checkbox", { name: "Check out after create" }));
    fireEvent.click(getByRole("button", { name: "Create" }));
    await waitFor(() => expect(mocked.createBranch).toHaveBeenCalledWith("r", "fix", oid, false));
  });
});

describe("CreateTagDialog", () => {
  it("tags the commit the context menu was opened on, not HEAD", async () => {
    const oid = "0123456789abcdef0123456789abcdef01234567";
    const { getByRole } = render(<CreateTagDialog onClose={() => {}} target={oid} />);
    expect(getByRole("combobox", { name: "Target" }).textContent).toBe("0123456");
    fireEvent.change(getByRole("textbox", { name: "Name" }), { target: { value: "v1.2.0" } });
    expect(preview(getByRole("dialog"))).toBe(`git tag v1.2.0 ${oid}`);
    fireEvent.click(getByRole("button", { name: "Create" }));
    await waitFor(() => expect(mocked.createTag).toHaveBeenCalledWith("r", "v1.2.0", oid, null));
  });
});

describe("MergeDialog", () => {
  it("builds the merge args from strategy / squash / message", async () => {
    const onClose = vi.fn();
    const { getByRole } = render(<MergeDialog onClose={onClose} />);
    const dialog = getByRole("dialog", { name: "Merge into main" });
    expect(preview(dialog)).toBe("git merge --ff feature/lane-graph");
    fireEvent.click(getByRole("combobox", { name: "Strategy" }));
    fireEvent.click(getByRole("option", { name: "Always create a merge commit" }));
    fireEvent.click(getByRole("checkbox", { name: "Squash into one commit" }));
    fireEvent.change(getByRole("textbox", { name: "Commit message" }), { target: { value: "custom msg" } });
    expect(preview(dialog)).toBe("git merge --no-ff --squash -m 'custom msg' feature/lane-graph");
    fireEvent.click(getByRole("button", { name: "Merge" }));
    expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(mocked.merge).toHaveBeenCalledWith("r", "feature/lane-graph", "no", true, "custom msg"));
  });
});
