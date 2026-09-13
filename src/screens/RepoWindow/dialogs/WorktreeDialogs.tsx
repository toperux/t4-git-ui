// Worktree dialogs: add (where + which branch), remove (force re-offer), lock.
import { open as openFolder } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { useState } from "react";
import * as ipc from "../../../api/ipc";
import { Button } from "../../../components/ui/Button/Button";
import { Checkbox } from "../../../components/ui/Checkbox/Checkbox";
import { Dialog, DialogText, Field, Mono, Options } from "../../../components/ui/Dialog/Dialog";
import { IconButton } from "../../../components/ui/IconButton/IconButton";
import { Input, Select } from "../../../components/ui/Input/Input";
import { validateRefName } from "../../../lib/branchName";
import { isAbsolutePath, joinPath, parentDir } from "../../../lib/paths";
import { takenBranches } from "../../../lib/takenBranches";
import { runOp } from "../../../store/opsStore";
import { useRepoStore } from "../../../store/repoStore";
import { gitCmd, worktreeAddArgs, worktreeLockArgs, worktreeRemoveArgs } from "./gitArgs";
import { useStartPoints } from "./RefDialogs";
import s from "./WorktreeDialogs.module.css";

/**
 * A worktree checks out a branch no other one has: git refuses a branch that is already out
 * somewhere (the current one included), so those are not offered — "New branch" is the way in.
 */
export function AddWorktreeDialog({ onClose, branch: initial }: { onClose: () => void; branch?: string }) {
  const repo = useRepoStore((st) => st.repo);
  const refs = useRepoStore((st) => st.refs);
  const linked = useRepoStore((st) => st.linked);
  const { options } = useStartPoints();
  const taken = takenBranches(linked, refs);
  const existing = (refs?.local ?? []).map((b) => b.name);
  const free = existing.filter((n) => !taken.has(n));

  const [parent, setParent] = useState(repo ? parentDir(repo.path) : "");
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  // Nothing free to check out and no row to start from: the only way on is a new branch.
  const [isNew, setIsNew] = useState(!initial && free.length === 0);
  const [branch, setBranch] = useState(initial ?? free[0] ?? "");
  const [newName, setNewName] = useState("");
  const [start, setStart] = useState("HEAD");
  const [checkout, setCheckout] = useState(true);

  const newBranch = newName.trim();
  const newError = newBranch ? validateRefName(newBranch, existing) : null;
  // The folder is named after the branch until the user types over it: `work-feature-x`.
  const forBranch = isNew ? newBranch : branch;
  const suggested = forBranch ? `${repo?.name ?? "worktree"}-${forBranch.replace(/\//g, "-")}` : "";
  const folder = (nameEdited ? name : suggested).trim();
  const dest = folder ? joinPath(parent.trim(), folder) : "";
  // A relative parent would put the worktree next to the app, wherever that is — and an empty one
  // is as relative as they come.
  const parentRelative = !isAbsolutePath(parent.trim());
  const valid = !!dest && !parentRelative && (isNew ? !!newBranch && !newError : !!branch);
  const preview = gitCmd(worktreeAddArgs(dest || "<path>", isNew ? null : branch || "<branch>", isNew ? newBranch || "<name>" : null, isNew ? start : null, checkout));

  async function pickParent() {
    const dir = await openFolder({ directory: true, multiple: false, title: "Add the worktree in", defaultPath: parent || undefined }).catch(() => null);
    if (dir) setParent(dir);
  }

  function submit() {
    if (!valid) return;
    onClose();
    void runOp("Adding worktree…", (id) => ipc.worktreeAdd(id, dest, isNew ? null : branch, isNew ? newBranch : null, isNew ? start : null, checkout), { success: "Worktree added" });
  }

  return (
    <Dialog
      title="Add worktree"
      onClose={onClose}
      onSubmit={submit}
      preview={preview}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!valid}>
            Add
          </Button>
        </>
      }
    >
      <Field label="Parent folder" help={parentRelative ? "Use a full path — a relative one would land next to the app" : undefined}>
        <div className={s.pathRow}>
          <Input aria-label="Parent folder" invalid={parentRelative} value={parent} onChange={(e) => setParent(e.target.value)} placeholder="Folder to add it in" spellCheck={false} />
          <IconButton label="Choose folder…" onClick={() => void pickParent()}>
            <FolderOpen size={16} aria-hidden />
          </IconButton>
        </div>
      </Field>
      <Field label="Folder name" help={<span title={dest}>{dest ? `Adds ${dest}` : "Destination path appears here"}</span>}>
        <Input
          aria-label="Folder name"
          value={nameEdited ? name : suggested}
          onChange={(e) => {
            setNameEdited(true);
            setName(e.target.value);
          }}
          placeholder="repo-branch"
          spellCheck={false}
        />
      </Field>
      {isNew ? (
        <>
          <Field label="New branch" help={newError ?? "Letters, digits, - _ / . — no spaces"} invalid={!!newError}>
            <Input aria-label="New branch" autoFocus invalid={!!newError} value={newName} onChange={(e) => setNewName(e.target.value)} spellCheck={false} placeholder="feature/my-change" />
          </Field>
          <Field label="Start point">
            <Select aria-label="Start point" value={start} onChange={(e) => setStart(e.target.value)}>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </>
      ) : (
        <Field label="Branch" help={free.length === 0 ? "Every branch is already checked out somewhere — create a new one" : "Branches checked out in another worktree are not listed"}>
          <Select aria-label="Branch" autoFocus value={branch} onChange={(e) => setBranch(e.target.value)}>
            {free.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Options>
        <Checkbox checked={isNew} onChange={setIsNew}>
          Create a new branch
        </Checkbox>
        <Checkbox checked={checkout} onChange={setCheckout}>
          Check out the files
        </Checkbox>
      </Options>
    </Dialog>
  );
}

export function RemoveWorktreeDialog({ onClose, path }: { onClose: () => void; path: string }) {
  // A `refused` rejection (a dirty worktree) re-shows the dialog with a force button.
  const [refused, setRefused] = useState<string | null>(null);

  function run(force: boolean) {
    void runOp("Removing the worktree…", (id) => ipc.worktreeRemove(id, path, force), {
      success: "Worktree removed",
      onRefused: (message) => setRefused(message),
    }).then((out) => {
      // Anything but `refused` (a locked worktree, a broken link) is a toast with nothing to re-offer:
      // the dialog has no second question to ask, so it goes. `busy` is not one of those — `runOp`
      // turns the click away before it runs anything, so the question still stands.
      if (out.ok || (out.error?.kind !== "refused" && out.error?.kind !== "busy")) onClose();
    });
  }

  return (
    <Dialog
      title="Remove worktree"
      onClose={onClose}
      onSubmit={() => run(!!refused)}
      preview={gitCmd(worktreeRemoveArgs(path, !!refused))}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" type="submit">
            {refused ? "Force remove" : "Remove"}
          </Button>
        </>
      }
    >
      <DialogText>
        {refused ? (
          <>
            {refused} — force removing <Mono>{path}</Mono> discards whatever is in it.
          </>
        ) : (
          <>
            Remove the worktree at <Mono>{path}</Mono>? Its branch stays.
          </>
        )}
      </DialogText>
    </Dialog>
  );
}

export function LockWorktreeDialog({ onClose, path }: { onClose: () => void; path: string }) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();

  function submit() {
    onClose();
    void runOp("Locking the worktree…", (id) => ipc.worktreeLock(id, path, trimmed || null), { success: "Worktree locked" });
  }

  return (
    <Dialog
      title="Lock worktree"
      onClose={onClose}
      onSubmit={submit}
      preview={gitCmd(worktreeLockArgs(path, trimmed || null))}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit">
            Lock
          </Button>
        </>
      }
    >
      <DialogText>
        A locked worktree is not pruned while its directory is away — a removable drive, a network share.
      </DialogText>
      <Field label="Reason" help="Shown beside the worktree, and by git itself">
        <Input aria-label="Reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" />
      </Field>
    </Dialog>
  );
}
