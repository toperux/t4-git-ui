import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RebaseTodo, RefsSnapshot, RepoSummary, TodoLine } from "../../../api/types";
import { useCmdHistoryStore } from "../../../store/cmdHistoryStore";
import { useDialogStore } from "../../../store/dialogStore";
import { useOpsStore } from "../../../store/opsStore";
import { useRepoStore } from "../../../store/repoStore";
import { useStatusStore } from "../../../store/statusStore";
import { useToastStore } from "../../../store/toastStore";
import { DeleteRemoteTagDialog, MergeDialog, PickDialog, PullDialog, PushDialog, PushTagDialog, RebaseDialog, ResetBranchDialog, ResetDialog } from "./OpsDialogs";
import { RebaseInteractiveDialog } from "./RebaseInteractiveDialog";
import { CheckoutBranchDialog, CheckoutDialog, CreateBranchDialog, CreateTagDialog, DeleteTagDialog } from "./RefDialogs";
import { AddRemoteDialog, RemoveRemoteDialog, RenameRemoteDialog, SetRemoteUrlDialog } from "./RemoteDialogs";
import { RunCommandDialog } from "./RunCommandDialog";

vi.mock("../../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/ipc")>();
  return {
    ...actual,
    push: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    merge: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    rebase: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    rebaseTodo: vi.fn(() => new Promise(() => {})),
    rebaseInteractive: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    cherryPick: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    revert: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    pull: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    reset: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    resetBranch: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    checkout: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    fetch: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    createBranch: vi.fn(() => Promise.resolve()),
    addRemote: vi.fn(() => Promise.resolve()),
    renameRemote: vi.fn(() => Promise.resolve()),
    setRemoteUrl: vi.fn(() => Promise.resolve()),
    removeRemote: vi.fn(() => Promise.resolve()),
    createTag: vi.fn(() => Promise.resolve()),
    deleteTag: vi.fn(() => Promise.resolve()),
    deleteRemoteBranch: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    runGit: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    getDefaultRemote: vi.fn(() => Promise.resolve("origin")),
    // Every remote op refreshes the remote's tags; a failure there toasts, which these tests would see.
    remoteTags: vi.fn(() => Promise.resolve([])),
    getConfig: vi.fn(() => Promise.resolve(null)),
    getMergeMessage: vi.fn(() => Promise.resolve("Add the parser")),
    getStatus: vi.fn(() => new Promise(() => {})),
    getRefs: vi.fn(() => new Promise(() => {})),
  };
});

import * as ipc from "../../../api/ipc";
const mocked = ipc as unknown as Record<
  | "push"
  | "merge"
  | "rebase"
  | "rebaseTodo"
  | "rebaseInteractive"
  | "cherryPick"
  | "revert"
  | "pull"
  | "reset"
  | "resetBranch"
  | "checkout"
  | "createBranch"
  | "createTag"
  | "deleteTag"
  | "deleteRemoteBranch"
  | "runGit"
  | "fetch"
  | "getMergeMessage"
  | "addRemote"
  | "renameRemote"
  | "setRemoteUrl"
  | "removeRemote"
  | "getDefaultRemote",
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
  useRepoStore.setState({ repo: REPO, refs: REFS, gitVersion: null });
  useOpsStore.setState({ ops: [], open: false, busy: null });
  useToastStore.setState({ toasts: [] });
  useCmdHistoryStore.setState({ history: [] });
  useStatusStore.setState({ status: null });
  useDialogStore.setState({ dialog: null, returnFocus: null });
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

describe("CheckoutDialog", () => {
  it("previews what the pick will run: the existing local for a remote that has one, a tracking checkout otherwise, a tag by its full ref", () => {
    useRepoStore.setState({
      refs: {
        ...REFS,
        remotes: [{ ...REFS.remotes[0], branches: [...REFS.remotes[0].branches, { name: "origin/topic", oid: "c", mergedInto: null }] }],
        tags: [{ name: "v1", oid: "a", message: null }],
      },
    });
    const { getByRole } = render(<CheckoutDialog onClose={() => {}} />);
    const dialog = getByRole("dialog", { name: "Checkout" });
    const filter = getByRole("textbox", { name: "Branch or tag" });
    fireEvent.change(filter, { target: { value: "origin/main" } });
    expect(preview(dialog)).toBe("git checkout main");
    fireEvent.change(filter, { target: { value: "origin/topic" } });
    expect(preview(dialog)).toBe("git checkout --track -b topic origin/topic");
    fireEvent.change(filter, { target: { value: "v1" } });
    expect(preview(dialog)).toBe("git checkout --detach refs/tags/v1");
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

  it("preselects the remote it was opened on, without asking for the default one", async () => {
    useRepoStore.setState({ refs: { ...REFS, remotes: [...REFS.remotes, { name: "fork", url: null, branches: [] }] } });
    const { getByRole } = render(<DeleteRemoteTagDialog onClose={() => {}} name="v1.2.0" remote="fork" />);
    const dialog = getByRole("dialog", { name: "Delete remote tag" });
    expect(preview(dialog)).toBe("git push fork --delete refs/tags/v1.2.0");
    await waitFor(() => expect(mocked.getDefaultRemote).not.toHaveBeenCalled());
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
    expect(mocked.push).not.toHaveBeenCalled();
  });

  it("pushes the new tag by its full ref when the box is ticked", async () => {
    const { getByRole } = render(<CreateTagDialog onClose={() => {}} />);
    fireEvent.change(getByRole("textbox", { name: "Name" }), { target: { value: "v1" } });
    fireEvent.click(getByRole("checkbox", { name: "Push to remote after creating" }));
    // The push half is built from the real argv, `--progress` included.
    await waitFor(() => expect(preview(getByRole("dialog"))).toBe("git tag v1 HEAD && git push --progress origin refs/tags/v1"));
    fireEvent.click(getByRole("button", { name: "Create" }));
    await waitFor(() => expect(mocked.push).toHaveBeenCalledWith("r", "origin", "refs/tags/v1", false, false, false));
    // The push only makes sense once the tag exists.
    expect(mocked.createTag.mock.invocationCallOrder[0]).toBeLessThan(mocked.push.mock.invocationCallOrder[0]);
  });

  it("leaves the tag unpushed when creating it failed", async () => {
    mocked.createTag.mockRejectedValueOnce(new Error("tag exists"));
    const { getByRole } = render(<CreateTagDialog onClose={() => {}} />);
    fireEvent.change(getByRole("textbox", { name: "Name" }), { target: { value: "v1" } });
    fireEvent.click(getByRole("checkbox", { name: "Push to remote after creating" }));
    fireEvent.click(getByRole("button", { name: "Create" }));
    await waitFor(() => expect(mocked.createTag).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(mocked.push).not.toHaveBeenCalled();
  });

  it("a rejected push leaves the created tag in place and reports the push", async () => {
    mocked.push.mockRejectedValueOnce({ kind: "cli", message: "`git push` exited with code 1: remote rejected" });
    const { getByRole } = render(<CreateTagDialog onClose={() => {}} />);
    fireEvent.change(getByRole("textbox", { name: "Name" }), { target: { value: "v1" } });
    fireEvent.click(getByRole("checkbox", { name: "Push to remote after creating" }));
    fireEvent.click(getByRole("button", { name: "Create" }));
    await waitFor(() => expect(mocked.push).toHaveBeenCalled());
    // The tag exists locally whatever the remote said: both halves report their own outcome.
    await waitFor(() =>
      expect(useToastStore.getState().toasts).toMatchObject([
        { kind: "success", title: "Created tag v1" },
        { kind: "error", title: "Pushing tag v1 failed", detail: "remote rejected" },
      ]),
    );
  });

  it("hides the push option in a repo without remotes", () => {
    useRepoStore.setState({ refs: { ...REFS, remotes: [] } });
    const { queryByRole } = render(<CreateTagDialog onClose={() => {}} />);
    expect(queryByRole("checkbox", { name: "Push to remote after creating" })).toBe(null);
  });
});

describe("AddRemoteDialog", () => {
  it("names the first remote origin, previews the fetch clause, and fetches once it is added", async () => {
    useRepoStore.setState({ refs: { ...REFS, remotes: [] } });
    const { getByRole } = render(<AddRemoteDialog onClose={() => {}} />);
    const dialog = getByRole("dialog", { name: "Add remote" });
    expect((getByRole("textbox", { name: "Name" }) as HTMLInputElement).value).toBe("origin");
    // A remote without a URL is nothing to fetch from: the name alone doesn't enable Add.
    expect(getByRole("button", { name: "Add" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(getByRole("textbox", { name: "URL" }), { target: { value: "git@x/y.git" } });
    expect(preview(dialog)).toBe("git remote add origin git@x/y.git && git fetch --progress --prune origin");
    fireEvent.click(getByRole("button", { name: "Add" }));
    await waitFor(() => expect(mocked.addRemote).toHaveBeenCalledWith("r", "origin", "git@x/y.git"));
    await waitFor(() => expect(mocked.fetch).toHaveBeenCalledWith("r", "origin", true, false));
    // Nothing to fetch until the remote exists.
    expect(mocked.addRemote.mock.invocationCallOrder[0]).toBeLessThan(mocked.fetch.mock.invocationCallOrder[0]);
  });

  it("leaves the name empty when the repo already has a remote, and skips the fetch when unticked", async () => {
    const { getByRole } = render(<AddRemoteDialog onClose={() => {}} />);
    expect((getByRole("textbox", { name: "Name" }) as HTMLInputElement).value).toBe("");
    expect(getByRole("button", { name: "Add" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(getByRole("textbox", { name: "Name" }), { target: { value: "mirror" } });
    fireEvent.change(getByRole("textbox", { name: "URL" }), { target: { value: "git@x/y.git" } });
    fireEvent.click(getByRole("checkbox", { name: "Fetch now" }));
    expect(preview(getByRole("dialog"))).toBe("git remote add mirror git@x/y.git");
    fireEvent.click(getByRole("button", { name: "Add" }));
    await waitFor(() => expect(mocked.addRemote).toHaveBeenCalledWith("r", "mirror", "git@x/y.git"));
    await new Promise((r) => setTimeout(r, 0));
    expect(mocked.fetch).not.toHaveBeenCalled();
  });

  it("refuses a name another remote already has", () => {
    const { getByRole, getByText } = render(<AddRemoteDialog onClose={() => {}} />);
    fireEvent.change(getByRole("textbox", { name: "Name" }), { target: { value: "origin" } });
    fireEvent.change(getByRole("textbox", { name: "URL" }), { target: { value: "git@x/y.git" } });
    expect(getByText("origin already exists")).toBeTruthy();
    expect(getByRole("button", { name: "Add" }).hasAttribute("disabled")).toBe(true);
  });
});

describe("RenameRemoteDialog", () => {
  it("refuses the unchanged name and another remote's, and renames otherwise", async () => {
    useRepoStore.setState({ refs: { ...REFS, remotes: [...REFS.remotes, { name: "fork", url: null, branches: [] }] } });
    const { getByRole, getByText } = render(<RenameRemoteDialog onClose={() => {}} name="fork" />);
    const dialog = getByRole("dialog", { name: "Rename remote" });
    expect(getByRole("button", { name: "Rename" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(getByRole("textbox", { name: "New name" }), { target: { value: "origin" } });
    expect(getByText("origin already exists")).toBeTruthy();
    expect(getByRole("button", { name: "Rename" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(getByRole("textbox", { name: "New name" }), { target: { value: "mirror" } });
    expect(preview(dialog)).toBe("git remote rename fork mirror");
    fireEvent.click(getByRole("button", { name: "Rename" }));
    await waitFor(() => expect(mocked.renameRemote).toHaveBeenCalledWith("r", "fork", "mirror"));
  });
});

describe("SetRemoteUrlDialog", () => {
  it("starts from the current URL and only submits a different one", async () => {
    const { getByRole } = render(<SetRemoteUrlDialog onClose={() => {}} name="origin" url="git@x/y.git" />);
    const dialog = getByRole("dialog", { name: "Change remote URL" });
    expect((getByRole("textbox", { name: "URL" }) as HTMLInputElement).value).toBe("git@x/y.git");
    expect(getByRole("button", { name: "Change" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(getByRole("textbox", { name: "URL" }), { target: { value: " git@x/y.git " } });
    expect(getByRole("button", { name: "Change" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(getByRole("textbox", { name: "URL" }), { target: { value: " git@x/z.git " } });
    expect(preview(dialog)).toBe("git remote set-url origin git@x/z.git");
    fireEvent.click(getByRole("button", { name: "Change" }));
    await waitFor(() => expect(mocked.setRemoteUrl).toHaveBeenCalledWith("r", "origin", "git@x/z.git"));
  });
});

describe("RemoveRemoteDialog", () => {
  it("removes the remote", async () => {
    const { getByRole } = render(<RemoveRemoteDialog onClose={() => {}} name="origin" />);
    expect(preview(getByRole("dialog", { name: "Remove remote" }))).toBe("git remote remove origin");
    fireEvent.click(getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(mocked.removeRemote).toHaveBeenCalledWith("r", "origin"));
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

  it("preselects the branch it was opened on", () => {
    const { getByRole } = render(<MergeDialog onClose={() => {}} branch="feature/lane-graph" />);
    expect(getByRole("combobox", { name: "Branch to merge" }).textContent).toBe("feature/lane-graph");
    expect(preview(getByRole("dialog"))).toBe("git merge --ff feature/lane-graph");
    expect(getByRole("textbox", { name: "Commit message" }).getAttribute("placeholder")).toBe("Merge branch 'feature/lane-graph' into main");
  });

  it("keeps a commit oid that is not a branch, and words the default message as git does", async () => {
    const oid = "0123456789abcdef0123456789abcdef01234567";
    const onClose = vi.fn();
    const { getByRole } = render(<MergeDialog onClose={onClose} branch={oid} />);
    expect(getByRole("combobox", { name: "Branch to merge" }).textContent).toBe("0123456");
    expect(preview(getByRole("dialog"))).toBe(`git merge --ff ${oid}`);
    // The option is abbreviated, the message git would write is not.
    expect(getByRole("textbox", { name: "Commit message" }).getAttribute("placeholder")).toBe(`Merge commit '${oid}'`);
    fireEvent.click(getByRole("button", { name: "Merge" }));
    expect(onClose).toHaveBeenCalled();
    // The full oid goes to git; only the label is abbreviated.
    await waitFor(() => expect(mocked.merge).toHaveBeenCalledWith("r", oid, "auto", false, null));
  });

  it("words a remote-tracking branch's default message the way git does", () => {
    const { getByRole } = render(<MergeDialog onClose={() => {}} branch="origin/main" />);
    expect(getByRole("textbox", { name: "Commit message" }).getAttribute("placeholder")).toBe("Merge remote-tracking branch 'origin/main' into main");
  });

  it("keeps a ref name that is not a 40-hex oid whole", () => {
    // The refs refreshed between the click and the mount and the branch is gone: cutting it to seven
    // characters would label the option `feature` and toast a merge of a branch that never existed.
    useRepoStore.setState({ refs: { ...REFS, local: [REFS.local[0]] } });
    const { getByRole } = render(<MergeDialog onClose={() => {}} branch="feature/lane-graph" />);
    expect(getByRole("combobox", { name: "Branch to merge" }).textContent).toBe("feature/lane-graph");
  });
});

describe("RebaseDialog", () => {
  it("rebases onto a commit oid from the grid, or onto a preset branch", async () => {
    const oid = "0123456789abcdef0123456789abcdef01234567";
    const { getByRole, unmount } = render(<RebaseDialog onClose={() => {}} onto={oid} />);
    const dialog = getByRole("dialog", { name: "Rebase main" });
    expect(getByRole("combobox", { name: "Onto" }).textContent).toBe("0123456");
    expect(preview(dialog)).toBe(`git rebase ${oid}`);
    fireEvent.click(getByRole("button", { name: "Rebase" }));
    await waitFor(() => expect(mocked.rebase).toHaveBeenCalledWith("r", oid));
    unmount();

    const second = render(<RebaseDialog onClose={() => {}} onto="feature/lane-graph" />);
    expect(second.getByRole("combobox", { name: "Onto" }).textContent).toBe("feature/lane-graph");
    expect(preview(second.getByRole("dialog"))).toBe("git rebase feature/lane-graph");
  });

  it("Interactive hands the branch over to the todo dialog instead of running anything", () => {
    const close = vi.fn();
    const { getByRole } = render(<RebaseDialog onClose={close} onto="feature/lane-graph" />);
    fireEvent.click(getByRole("checkbox", { name: "Interactive — reorder, reword, squash or drop the commits first" }));
    expect(preview(getByRole("dialog"))).toBe("git rebase -i --rebase-merges feature/lane-graph");
    fireEvent.click(getByRole("button", { name: "Rebase" }));
    expect(mocked.rebase).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(useDialogStore.getState().dialog).toEqual({ kind: "rebaseInteractive", base: "feature/lane-graph", ontoLabel: "feature/lane-graph" });
  });
});

const todoPick = (oid: string, summary: string, action: "pick" | "fixup" = "pick"): TodoLine => ({
  kind: "pick",
  action,
  text: `${action} ${oid} ${summary}`,
  commit: { oid, short: oid, summary, message: `${summary}\n\nbody of ${oid}` },
  amend: false,
});
const TODO: RebaseTodo = { head: "head1", baseOid: "base9", lines: [todoPick("a1", "One"), todoPick("b2", "Two")] };
const dirty = () => useStatusStore.setState({ status: { entries: [], staged: 1, unstaged: 0, untracked: 0, conflicted: 0 } });

describe("RebaseInteractiveDialog", () => {
  it("asks before stashing a dirty tree, then reads the todo with --autostash", async () => {
    dirty();
    mocked.rebaseTodo.mockImplementation(() => Promise.resolve(TODO));
    const { getByRole } = render(<RebaseInteractiveDialog onClose={() => {}} base="origin/main" ontoLabel="origin/main" />);
    const dialog = getByRole("dialog", { name: "Rebase main onto origin/main" });
    expect(dialog.textContent).toContain("Uncommitted changes will be stashed before the rebase and restored after it.");
    // Nothing runs until the user agrees: the read step is a real `git rebase -i`.
    expect(mocked.rebaseTodo).not.toHaveBeenCalled();
    expect(preview(dialog)).toBe("git rebase -i --autostash --rebase-merges origin/main");
    fireEvent.click(getByRole("button", { name: "Stash and continue" }));
    await waitFor(() => expect(mocked.rebaseTodo).toHaveBeenCalledWith("r", "origin/main", true, true, false, false));
  });

  it("reorders the rows and submits the todo git will replay", async () => {
    mocked.rebaseTodo.mockImplementation(() => Promise.resolve(TODO));
    const { getByRole, getAllByRole } = render(<RebaseInteractiveDialog onClose={() => {}} base="origin/main" />);
    const dialog = getByRole("dialog", { name: "Rebase main" });
    await waitFor(() => expect(getByRole("combobox", { name: "Action for a1" })).toBeTruthy());
    expect(preview(dialog)).toBe("git rebase -i --rebase-merges origin/main");
    // A clean tree never stashes; git ≥ 2.38 is unknown here, so no --update-refs checkbox.
    // Opened from a commit row (no `ontoLabel`): the base is a from-here one.
    expect(mocked.rebaseTodo).toHaveBeenCalledWith("r", "origin/main", false, true, false, true);
    expect(dialog.querySelectorAll('[class*="rowActive"]')).toHaveLength(0);

    // The first row has nothing above it: neither the move-up button nor squash is offered.
    expect((getAllByRole("button", { name: "Move up" })[0] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(getByRole("combobox", { name: "Action for a1" }));
    expect(getByRole("option", { name: "squash" }).getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(getByRole("option", { name: "squash" }));
    expect(getByRole("combobox", { name: "Action for a1" }).textContent).toBe("pick");

    fireEvent.click(getAllByRole("button", { name: "Move up" })[1]);
    fireEvent.click(getByRole("button", { name: "Rebase" }));
    await waitFor(() =>
      expect(mocked.rebaseInteractive).toHaveBeenCalledWith(
        "r",
        "head1",
        "base9",
        "origin/main",
        [
          { kind: "line", text: "pick b2 Two" },
          { kind: "line", text: "pick a1 One" },
        ],
        false,
        true,
        false,
      ),
    );
  });

  it("a reword gets a message box prefilled with the commit's message, and the edit becomes an amend", async () => {
    mocked.rebaseTodo.mockImplementation(() => Promise.resolve(TODO));
    const { getByRole } = render(<RebaseInteractiveDialog onClose={() => {}} base="origin/main" />);
    await waitFor(() => expect(getByRole("combobox", { name: "Action for a1" })).toBeTruthy());
    fireEvent.click(getByRole("combobox", { name: "Action for a1" }));
    fireEvent.click(getByRole("option", { name: "reword" }));
    const box = getByRole("textbox", { name: "Message for a1" }) as HTMLTextAreaElement;
    expect(box.value).toBe("One\n\nbody of a1");
    fireEvent.change(box, { target: { value: "Reworded" } });
    fireEvent.click(getByRole("button", { name: "Rebase" }));
    await waitFor(() => expect(mocked.rebaseInteractive).toHaveBeenCalled());
    expect(mocked.rebaseInteractive.mock.calls[0][4]).toEqual([
      { kind: "line", text: "pick a1 One" },
      { kind: "amend", message: "Reworded" },
      { kind: "line", text: "pick b2 Two" },
    ]);
  });

  it("Flatten re-reads the todo without --rebase-merges; the notice stays so Keep merges can come back", async () => {
    const merges: RebaseTodo = { ...TODO, lines: [todoPick("a1", "One"), { kind: "merge", text: "merge -C m1 side", commit: null }] };
    mocked.rebaseTodo.mockImplementationOnce(() => Promise.resolve(merges)).mockImplementation(() => Promise.resolve(TODO));
    const { getByRole } = render(<RebaseInteractiveDialog onClose={() => {}} base="origin/main" />);
    const dialog = getByRole("dialog", { name: "Rebase main" });
    await waitFor(() => expect(dialog.textContent).toContain("1 merge commit in this range"));
    // A merge row is read-only: no action Select and no move buttons.
    expect(dialog.textContent).toContain("merge");
    fireEvent.click(getByRole("radio", { name: "Flatten" }));
    await waitFor(() => expect(mocked.rebaseTodo).toHaveBeenCalledWith("r", "origin/main", false, false, false, true));
    expect(preview(dialog)).toBe("git rebase -i origin/main");
    expect(getByRole("radio", { name: "Keep merges" })).toBeTruthy();
  });

  it("offers --update-refs on git 2.38 and up only, and shows a read failure with Rebase disabled", async () => {
    useRepoStore.setState({ gitVersion: "git version 2.55.0.windows.1" });
    mocked.rebaseTodo.mockImplementation(() => Promise.resolve(TODO));
    const { getByRole, unmount } = render(<RebaseInteractiveDialog onClose={() => {}} base="origin/main" />);
    const dialog = getByRole("dialog", { name: "Rebase main" });
    await waitFor(() => expect(getByRole("checkbox", { name: /Update branches/ })).toBeTruthy());
    // The read always asks for the update-ref lines; the box only decides whether they go back.
    expect(mocked.rebaseTodo).toHaveBeenCalledWith("r", "origin/main", false, true, true, true);
    fireEvent.click(getByRole("checkbox", { name: /Update branches/ }));
    expect(preview(dialog)).toBe("git rebase -i --rebase-merges --update-refs origin/main");
    unmount();

    vi.clearAllMocks();
    mocked.rebaseTodo.mockImplementation(() => Promise.reject({ kind: "cli", message: "cannot rebase: You have unstaged changes." }));
    const failed = render(<RebaseInteractiveDialog onClose={() => {}} base="origin/main" />);
    await waitFor(() => expect(failed.getByRole("dialog").textContent).toContain("cannot rebase: You have unstaged changes."));
    expect((failed.getByRole("button", { name: "Rebase" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("nothing to rebase: the button says why", async () => {
    mocked.rebaseTodo.mockImplementation(() => Promise.resolve({ head: "head1", baseOid: "base9", lines: [{ kind: "other", text: "noop" }] } as RebaseTodo));
    const { getByRole } = render(<RebaseInteractiveDialog onClose={() => {}} base="origin/main" />);
    await waitFor(() => expect(getByRole("dialog").textContent).toContain("Nothing to rebase"));
    expect((getByRole("button", { name: "Rebase" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("PickDialog", () => {
  const OID = "0123456789abcdef0123456789abcdef01234567";
  const props = { oid: OID, short: "0123456", summary: "Add the parser", parents: ["p1p1p1p1p1p1p1p1p1p1p1p1p1p1p1p1p1p1p1p1"] };

  it("previews each cherry-pick option and prefills the editor when the commit is left staged", async () => {
    const onClose = vi.fn();
    const { getByRole, queryByRole } = render(<PickDialog onClose={onClose} mode="cherryPick" {...props} />);
    const dialog = getByRole("dialog", { name: "Cherry-pick 0123456" });
    expect(preview(dialog)).toBe(`git cherry-pick ${OID}`);
    // One parent: no mainline to choose.
    expect(queryByRole("combobox", { name: "Mainline parent" })).toBeNull();
    fireEvent.click(getByRole("checkbox", { name: "Record the source commit (-x)" }));
    expect(preview(dialog)).toBe(`git cherry-pick -x ${OID}`);
    fireEvent.click(getByRole("checkbox", { name: "Commit right away" }));
    expect(preview(dialog)).toBe(`git cherry-pick -n -x ${OID}`);

    fireEvent.click(getByRole("button", { name: "Cherry-pick" }));
    expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(mocked.cherryPick).toHaveBeenCalledWith("r", OID, true, true, null));
    // `--no-commit` left the message in MERGE_MSG with the state clean: the panel takes it from there.
    await waitFor(() => expect(mocked.getMergeMessage).toHaveBeenCalled());
    expect(useToastStore.getState().toasts[0].title).toBe("Cherry-picked 0123456 — staged, commit to finish");
  });

  it("reverts with --no-edit and never offers -x", async () => {
    const { getByRole, queryByRole } = render(<PickDialog onClose={() => {}} mode="revert" {...props} />);
    const dialog = getByRole("dialog", { name: "Revert 0123456" });
    expect(preview(dialog)).toBe(`git revert --no-edit ${OID}`);
    expect(queryByRole("checkbox", { name: "Record the source commit (-x)" })).toBeNull();
    fireEvent.click(getByRole("button", { name: "Revert" }));
    await waitFor(() => expect(mocked.revert).toHaveBeenCalledWith("r", OID, false, null));
    expect(useToastStore.getState().toasts[0].title).toBe("Reverted 0123456");
  });

  it("asks for a mainline parent on a merge commit only", async () => {
    const parents = ["aaaaaaa000000000000000000000000000000000", "bbbbbbb000000000000000000000000000000000"];
    const { getByRole } = render(<PickDialog onClose={() => {}} mode="revert" {...props} parents={parents} />);
    const dialog = getByRole("dialog", { name: "Revert 0123456" });
    expect(preview(dialog)).toBe(`git revert --no-edit -m 1 ${OID}`);
    fireEvent.click(getByRole("combobox", { name: "Mainline parent" }));
    fireEvent.click(getByRole("option", { name: "2 — bbbbbbb" }));
    expect(preview(dialog)).toBe(`git revert --no-edit -m 2 ${OID}`);
    fireEvent.click(getByRole("button", { name: "Revert" }));
    await waitFor(() => expect(mocked.revert).toHaveBeenCalledWith("r", OID, false, 2));
  });
});

describe("RunCommandDialog", () => {
  it("previews the parsed line re-quoted, runs it, and records it in the history", async () => {
    const { getByRole } = render(<RunCommandDialog onClose={() => {}} />);
    const dialog = getByRole("dialog", { name: "Run git command" });
    expect(getByRole("button", { name: "Run" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(getByRole("combobox", { name: "Git command" }), { target: { value: 'commit -m "two words"' } });
    expect(preview(dialog)).toBe("git commit -m 'two words'");
    fireEvent.click(getByRole("button", { name: "Run" }));
    await waitFor(() => expect(mocked.runGit).toHaveBeenCalledWith("r", ["commit", "-m", "two words"]));
    expect(useCmdHistoryStore.getState().history).toEqual(['commit -m "two words"']);
    expect(useOpsStore.getState().open).toBe(true);
  });

  it("refuses a flag that needs a terminal before running", () => {
    const { getByRole, getByText } = render(<RunCommandDialog onClose={() => {}} />);
    fireEvent.change(getByRole("combobox", { name: "Git command" }), { target: { value: "add -i" } });
    expect(getByText(/-i needs a terminal/)).toBeTruthy();
    expect(getByRole("button", { name: "Run" }).hasAttribute("disabled")).toBe(true);
    fireEvent.keyDown(getByRole("combobox", { name: "Git command" }), { key: "Enter" });
    expect(mocked.runGit).not.toHaveBeenCalled();
  });
});
