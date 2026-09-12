// Push / Pull / Fetch / Merge / Rebase — the dialogs that drive a streaming remote or history op.
import { useEffect, useMemo, useState } from "react";
import * as ipc from "../../../api/ipc";
import type { FfMode, PullMode, ResetMode } from "../../../api/types";
import { Button } from "../../../components/ui/Button/Button";
import { Checkbox } from "../../../components/ui/Checkbox/Checkbox";
import { Dialog, DialogText, Field, FieldRow, Mono, Options } from "../../../components/ui/Dialog/Dialog";
import { Input, Select } from "../../../components/ui/Input/Input";
import { useCommitStore } from "../../../store/commitStore";
import { useDialogStore } from "../../../store/dialogStore";
import { runOp } from "../../../store/opsStore";
import { useRepoStore } from "../../../store/repoStore";
import { currentBranch, defaultRemote } from "../actions";
import { cherryPickArgs, fetchArgs, gitCmd, mergeArgs, pullArgs, pushArgs, rebaseArgs, rebaseInteractiveArgs, resetArgs, resetBranchArgs, revertArgs } from "./gitArgs";

/** Remote names of the open repo. */
export function useRemotes() {
  const remotes = useRepoStore((st) => st.refs?.remotes);
  return useMemo(() => (remotes ?? []).map((r) => r.name), [remotes]);
}

/** `get_default_remote`, falling back to the first remote; `initial` (the row's own remote) wins outright. */
export function useDefaultRemote(remotes: string[], initial?: string) {
  const [remote, setRemote] = useState<string>(() => initial ?? remotes[0] ?? "");
  useEffect(() => {
    if (initial) return;
    let live = true;
    void defaultRemote().then((r) => {
      if (live && r) setRemote(r);
    });
    return () => {
      live = false;
    };
  }, [initial]);
  return [remote, setRemote] as const;
}

export const RemoteField = ({ remotes, value, onChange, all }: { remotes: string[]; value: string; onChange: (v: string) => void; all?: boolean }) => (
  <Field label="Remote">
    <Select aria-label="Remote" value={value} onChange={(e) => onChange(e.target.value)} autoFocus>
      {all && <option value="">All remotes</option>}
      {remotes.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </Select>
  </Field>
);

/**
 * Pushes one tag — a release, usually. The refspec is spelled `refs/tags/<name>`
 * so a branch of the same name can't be what gets pushed.
 */
export function PushTagDialog({ onClose, name }: { onClose: () => void; name: string }) {
  const remotes = useRemotes();
  const [remote, setRemote] = useDefaultRemote(remotes);
  const refspec = `refs/tags/${name}`;
  const preview = gitCmd(pushArgs(remote || "origin", refspec, false, false, false));

  function submit() {
    if (!remote) return;
    onClose();
    void runOp(`Pushing tag ${name}…`, (id) => ipc.push(id, remote, refspec, false, false, false), { success: `Pushed tag ${name} → ${remote}`, remote });
  }

  return (
    <Dialog
      title="Push tag"
      onClose={onClose}
      onSubmit={submit}
      preview={preview}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!remote}>
            Push
          </Button>
        </>
      }
    >
      <RemoteField remotes={remotes} value={remote} onChange={setRemote} />
      <DialogText>
        Push <Mono>{name}</Mono> to the remote. A tag already there at a different commit is rejected — git never moves a published tag
        on its own.
      </DialogText>
    </Dialog>
  );
}

/** `git push <remote> --delete refs/tags/<name>` — the branch command, given a full tag ref. */
export function DeleteRemoteTagDialog({ onClose, name, remote: initial }: { onClose: () => void; name: string; remote?: string }) {
  const remotes = useRemotes();
  const [remote, setRemote] = useDefaultRemote(remotes, initial);
  const refspec = `refs/tags/${name}`;

  function submit() {
    if (!remote) return;
    onClose();
    void runOp(`Deleting tag ${name} on ${remote}…`, (id) => ipc.deleteRemoteBranch(id, remote, refspec), { success: `Deleted tag ${name} on ${remote}`, remote });
  }

  return (
    <Dialog
      title="Delete remote tag"
      onClose={onClose}
      onSubmit={submit}
      preview={`git push ${remote || "origin"} --delete --end-of-options ${refspec}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" type="submit" disabled={!remote}>
            Delete on remote
          </Button>
        </>
      }
    >
      <RemoteField remotes={remotes} value={remote} onChange={setRemote} />
      <DialogText>
        Delete <Mono>{name}</Mono> on the remote? The local tag stays. Other clones keep theirs until they fetch with prune.
      </DialogText>
    </Dialog>
  );
}

export function PushDialog({ onClose, branch: branchProp }: { onClose: () => void; branch?: string }) {
  const remotes = useRemotes();
  const [remote, setRemote] = useDefaultRemote(remotes);
  const local = useRepoStore((st) => st.refs?.local);
  const branch = branchProp ?? currentBranch()?.name ?? "";
  const info = local?.find((b) => b.name === branch);
  const [setUpstream, setSetUpstream] = useState(!info?.upstream);
  const [force, setForce] = useState(false);
  const [tags, setTags] = useState(false);

  const preview = gitCmd(pushArgs(remote || "origin", branch || null, setUpstream, force, tags));
  const target = info?.upstream ?? `${remote}/${branch}`;

  function submit() {
    if (!remote || !branch) return;
    onClose();
    void runOp(`Pushing to ${remote}…`, (id) => ipc.push(id, remote, branch, setUpstream, force, tags), { success: `Pushed ${branch} → ${target}`, remote });
  }

  return (
    <Dialog
      title="Push"
      wide
      onClose={onClose}
      onSubmit={submit}
      preview={preview}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!remote || !branch}>
            Push
          </Button>
        </>
      }
    >
      <FieldRow>
        <RemoteField remotes={remotes} value={remote} onChange={setRemote} />
        <Field label="Branch" help={info?.upstream ? `Tracks ${info.upstream}` : "No upstream yet"}>
          <Input aria-label="Branch" value={branch} readOnly />
        </Field>
      </FieldRow>
      <Options inline>
        <Checkbox checked={force} onChange={setForce} title="Overwrites the remote branch unless it moved since the last fetch">
          Force (with lease)
        </Checkbox>
        <Checkbox checked={tags} onChange={setTags}>
          Push tags
        </Checkbox>
        <Checkbox checked={setUpstream} onChange={setSetUpstream}>
          Set upstream
        </Checkbox>
      </Options>
    </Dialog>
  );
}

const PULL_LABEL: Record<PullMode, string> = { merge: "Merge", rebase: "Rebase", ffOnly: "Fast-forward only" };

export function PullDialog({ onClose }: { onClose: () => void }) {
  const remotes = useRemotes();
  const [remote, setRemote] = useDefaultRemote(remotes);
  const [mode, setMode] = useState<PullMode>("merge");
  const local = useRepoStore((st) => st.refs?.local);
  const upstream = local?.find((b) => b.isHead)?.upstream ?? null;
  // The refspec is the *remote* branch: local `dev` may track `origin/develop`. Without a matching
  // upstream we name no branch at all and let git use the tracking configuration.
  const branch = upstream && remote && upstream.startsWith(`${remote}/`) ? upstream.slice(remote.length + 1) : null;

  // Default follows `pull.rebase`.
  useEffect(() => {
    const id = useRepoStore.getState().repo?.id;
    if (!id) return;
    let live = true;
    void ipc.getConfig(id, "pull.rebase").then((v) => {
      if (live && (v === "true" || v === "1")) setMode("rebase");
    });
    return () => {
      live = false;
    };
  }, []);

  const preview = gitCmd(pullArgs(remote || null, branch, mode));

  function submit() {
    onClose();
    void runOp(`Pulling from ${remote || "the default remote"}…`, (id) => ipc.pull(id, remote || null, branch, mode), {
      success: `Pulled ${branch && remote ? `${remote}/${branch}` : remote || "changes"}`,
      // No remote picked: git followed the tracking configuration, so ask them all.
      remote: remote || true,
    });
  }

  return (
    <Dialog
      title="Pull"
      onClose={onClose}
      onSubmit={submit}
      preview={preview}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit">
            Pull
          </Button>
        </>
      }
    >
      <RemoteField remotes={remotes} value={remote} onChange={setRemote} />
      <Field label="Integrate with" help={mode === "ffOnly" ? "Aborts when the branches have diverged" : mode === "rebase" ? "Replays your commits on top of the remote" : "Creates a merge commit when the branches diverged"}>
        <Select aria-label="Integrate with" value={mode} onChange={(e) => setMode(e.target.value as PullMode)}>
          {(Object.keys(PULL_LABEL) as PullMode[]).map((m) => (
            <option key={m} value={m}>
              {PULL_LABEL[m]}
            </option>
          ))}
        </Select>
      </Field>
    </Dialog>
  );
}

export function FetchDialog({ onClose }: { onClose: () => void }) {
  const remotes = useRemotes();
  const [remote, setRemote] = useDefaultRemote(remotes);
  const [prune, setPrune] = useState(true);
  const [tags, setTags] = useState(false);
  const preview = gitCmd(fetchArgs(remote || null, prune, tags));

  function submit() {
    onClose();
    const what = remote || "all remotes";
    void runOp(`Fetching ${what}…`, (id) => ipc.fetch(id, remote || null, prune, tags), { success: `Fetched ${what}`, remote: remote || true });
  }

  return (
    <Dialog
      title="Fetch"
      onClose={onClose}
      onSubmit={submit}
      preview={preview}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit">
            Fetch
          </Button>
        </>
      }
    >
      <RemoteField remotes={remotes} value={remote} onChange={setRemote} all />
      <Options inline>
        <Checkbox checked={prune} onChange={setPrune} title="Deletes remote-tracking branches that no longer exist">
          Prune
        </Checkbox>
        <Checkbox checked={tags} onChange={setTags}>
          Fetch tags
        </Checkbox>
      </Options>
    </Dialog>
  );
}

const FF_LABEL: Record<FfMode, string> = { auto: "Fast-forward when possible", no: "Always create a merge commit", only: "Fast-forward only" };

export function MergeDialog({ onClose, branch: initial }: { onClose: () => void; branch?: string }) {
  const refs = useRepoStore((st) => st.refs);
  const current = refs?.local.find((b) => b.isHead)?.name ?? "HEAD";
  const candidates = useMemo(() => {
    const locals = (refs?.local ?? []).filter((b) => !b.isHead).map((b) => ({ value: b.name, label: b.name }));
    const remotes = (refs?.remotes ?? []).flatMap((r) => r.branches.map((b) => ({ value: b.name, label: b.name })));
    return [...locals, ...remotes];
  }, [refs]);
  const remoteNames = useMemo(() => new Set((refs?.remotes ?? []).flatMap((r) => r.branches.map((b) => b.name))), [refs]);
  const known = !!initial && candidates.some((c) => c.value === initial);
  // An oid from the grid is not in the list: keep it as an extra option, shown abbreviated.
  const options = known || !initial ? candidates : [{ value: initial, label: shortRef(initial) }, ...candidates];
  const [branch, setBranch] = useState(initial ?? candidates[0]?.value ?? "");
  const [ff, setFf] = useState<FfMode>("auto");
  const [squash, setSquash] = useState(false);
  const [message, setMessage] = useState("");

  const label = options.find((o) => o.value === branch)?.label ?? branch;
  // A refs refresh can take the selection away under us; merging the name anyway would hit a ref that
  // no longer exists, so it stops being a selection.
  const valid = options.some((o) => o.value === branch);
  // git's own wording, so an unchanged message still means "let git decide": the full oid for a commit,
  // and `remote-tracking branch` for a remote one.
  const commit = !!branch && !candidates.some((c) => c.value === branch);
  const kind = remoteNames.has(branch) ? "remote-tracking branch" : "branch";
  const defaultMessage = branch ? (commit ? `Merge commit '${branch}'` : `Merge ${kind} '${branch}' into ${current}`) : "";
  const effective = message.trim() && message !== defaultMessage ? message : null;
  const preview = branch ? gitCmd(mergeArgs(branch, ff, squash, effective)) : "";

  function submit() {
    if (!valid) return;
    onClose();
    // `--squash` records nothing: the changes land in the index and the user still has to commit.
    const success = squash ? `Squashed ${label} into the index — commit to finish` : `Merged ${label} into ${current}`;
    void runOp(`Merging ${label}…`, (id) => ipc.merge(id, branch, ff, squash, effective), { success });
  }

  return (
    <Dialog
      title={`Merge into ${current}`}
      onClose={onClose}
      onSubmit={submit}
      preview={preview}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!valid}>
            Merge
          </Button>
        </>
      }
    >
      <Field label="Branch to merge" help={candidates.length === 0 ? "No other branches" : undefined}>
        <Select aria-label="Branch to merge" value={branch} onChange={(e) => setBranch(e.target.value)} autoFocus>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          {!valid && branch && (
            <option value={branch} disabled>
              {branch} (no longer exists)
            </option>
          )}
        </Select>
      </Field>
      <Field label="Strategy">
        <Select aria-label="Strategy" value={ff} onChange={(e) => setFf(e.target.value as FfMode)}>
          {(Object.keys(FF_LABEL) as FfMode[]).map((m) => (
            <option key={m} value={m}>
              {FF_LABEL[m]}
            </option>
          ))}
        </Select>
      </Field>
      <Options>
        <Checkbox checked={squash} onChange={setSquash} title="Applies the changes without recording a merge; commit them yourself">
          Squash into one commit
        </Checkbox>
      </Options>
      <Field label="Commit message" help="Left empty git writes the default merge message">
        <Input aria-label="Commit message" placeholder={defaultMessage} value={message} onChange={(e) => setMessage(e.target.value)} spellCheck={false} />
      </Field>
    </Dialog>
  );
}

/**
 * Cherry-pick / revert one commit picked in the grid. With "Commit right away" off git leaves the
 * change staged and its message in `MERGE_MSG`, so the commit panel is prefilled from there; a merge
 * commit has to name the parent the change is measured against.
 */
export function PickDialog({ onClose, mode, oid, short, summary, parents }: { onClose: () => void; mode: "cherryPick" | "revert"; oid: string; short: string; summary: string; parents: string[] }) {
  const pick = mode === "cherryPick";
  const [commitNow, setCommitNow] = useState(true);
  const [recordOrigin, setRecordOrigin] = useState(false);
  const [mainline, setMainline] = useState(1);
  const noCommit = !commitNow;
  // Only a merge commit takes `-m`; on a single-parent one git refuses the flag outright.
  const m = parents.length > 1 ? mainline : null;
  const preview = gitCmd(pick ? cherryPickArgs(oid, noCommit, recordOrigin, m) : revertArgs(oid, noCommit, m));

  function submit() {
    onClose();
    const done = pick ? `Cherry-picked ${short}` : `Reverted ${short}`;
    void runOp(pick ? `Cherry-picking ${short}…` : `Reverting ${short}…`, (id) => (pick ? ipc.cherryPick(id, oid, noCommit, recordOrigin, m) : ipc.revert(id, oid, noCommit, m)), {
      success: noCommit ? `${done} — staged, commit to finish` : done,
    }).then((r) => {
      // git wrote `MERGE_MSG` and left the state clean — also when a pick stopped on conflicts, which
      // with `-n` leaves no CHERRY_PICK_HEAD behind: nothing else would bring the message in. (A
      // `-n` revert that stops does keep REVERT_HEAD; the state change prefills that one as well.)
      if (noCommit && (r.ok || r.failure?.kind === "conflicts")) void useCommitStore.getState().prefillPending(true, { staged: true });
    });
  }

  return (
    <Dialog
      title={`${pick ? "Cherry-pick" : "Revert"} ${short}`}
      onClose={onClose}
      onSubmit={submit}
      preview={preview}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit">
            {pick ? "Cherry-pick" : "Revert"}
          </Button>
        </>
      }
    >
      <DialogText>{summary}</DialogText>
      {parents.length > 1 && (
        <Field label="Mainline parent" help="A merge commit has no single diff: the change is measured against this parent">
          <Select aria-label="Mainline parent" value={String(mainline)} onChange={(e) => setMainline(Number(e.target.value))} autoFocus>
            {parents.map((p, i) => (
              <option key={p} value={i + 1}>
                {i + 1} — {p.slice(0, 7)}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Options>
        <Checkbox checked={commitNow} onChange={setCommitNow} title="Off, the change lands staged and you write the commit yourself">
          Commit right away
        </Checkbox>
        {pick && (
          <Checkbox checked={recordOrigin} onChange={setRecordOrigin} title="Appends a “(cherry picked from commit …)” line to the message">
            Record the source commit (-x)
          </Checkbox>
        )}
      </Options>
    </Dialog>
  );
}

const RESET_LABEL: Record<ResetMode, string> = {
  soft: "Soft — keep the index and working tree",
  mixed: "Mixed — keep the working tree, unstage everything",
  hard: "Hard — discard all uncommitted changes",
};

/** A target is an oid (shown abbreviated) or a ref name such as `origin/main` (shown as is). */
export const shortRef = (target: string) => (/^[0-9a-f]{40}$/.test(target) ? target.slice(0, 7) : target);

/** Reset the current branch (or a detached HEAD) to a commit picked in the grid, or to a ref sitting there. */
export function ResetDialog({ onClose, target }: { onClose: () => void; target: string }) {
  const refs = useRepoStore((st) => st.refs);
  const current = refs?.local.find((b) => b.isHead)?.name ?? "HEAD";
  const [mode, setMode] = useState<ResetMode>("mixed");
  const short = shortRef(target);
  const preview = gitCmd(resetArgs(mode, target));

  function submit() {
    onClose();
    void runOp(`Resetting ${current} to ${short}…`, (id) => ipc.reset(id, mode, target), { success: `Reset ${current} to ${short}` });
  }

  return (
    <Dialog
      title={`Reset ${current}`}
      onClose={onClose}
      onSubmit={submit}
      preview={preview}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={mode === "hard" ? "danger" : "primary"} type="submit">
            Reset
          </Button>
        </>
      }
    >
      <Field label="Mode">
        <Select aria-label="Mode" value={mode} onChange={(e) => setMode(e.target.value as ResetMode)} autoFocus>
          {(Object.keys(RESET_LABEL) as ResetMode[]).map((m) => (
            <option key={m} value={m}>
              {RESET_LABEL[m]}
            </option>
          ))}
        </Select>
      </Field>
      <DialogText>
        {mode === "hard" ? (
          <>
            Moves <Mono>{current}</Mono> to <Mono>{short}</Mono> and <strong>throws away every uncommitted change</strong>, staged and
            unstaged. Commits after <Mono>{short}</Mono> stay reachable only through the reflog.
          </>
        ) : (
          <>
            Moves <Mono>{current}</Mono> to <Mono>{short}</Mono>; your files don&apos;t change. Commits after <Mono>{short}</Mono> stay
            reachable only through the reflog.
          </>
        )}
      </DialogText>
    </Dialog>
  );
}

/** `git branch -f`: moves a branch that is not checked out (the current branch goes through `ResetDialog`). */
export function ResetBranchDialog({ onClose, branch, target }: { onClose: () => void; branch: string; target: string }) {
  const short = shortRef(target);
  const preview = gitCmd(resetBranchArgs(branch, target));

  function submit() {
    onClose();
    void runOp(`Resetting ${branch} to ${short}…`, (id) => ipc.resetBranch(id, branch, target), { success: `Reset ${branch} to ${short}` });
  }

  return (
    <Dialog
      title={`Reset ${branch}`}
      onClose={onClose}
      onSubmit={submit}
      preview={preview}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit">
            Reset
          </Button>
        </>
      }
    >
      <DialogText>
        Moves <Mono>{branch}</Mono> to <Mono>{short}</Mono>. It isn&apos;t checked out, so your files don&apos;t change. Commits after{" "}
        <Mono>{short}</Mono> stay reachable only through the reflog.
      </DialogText>
    </Dialog>
  );
}

export function RebaseDialog({ onClose, onto: initial }: { onClose: () => void; onto?: string }) {
  const refs = useRepoStore((st) => st.refs);
  const head = refs?.local.find((b) => b.isHead);
  const current = head?.name ?? "HEAD";
  const candidates = useMemo(() => {
    const locals = (refs?.local ?? []).filter((b) => !b.isHead).map((b) => ({ value: b.name, label: b.name }));
    const remotes = (refs?.remotes ?? []).flatMap((r) => r.branches.map((b) => ({ value: b.name, label: b.name })));
    return [...locals, ...remotes];
  }, [refs]);
  const known = !!initial && candidates.some((c) => c.value === initial);
  // An oid from the grid is not in the list: keep it as an extra option, shown abbreviated.
  const options = known || !initial ? candidates : [{ value: initial, label: shortRef(initial) }, ...candidates];
  const [onto, setOnto] = useState(initial ?? candidates[0]?.value ?? "");
  const [interactive, setInteractive] = useState(false);
  const open = useDialogStore((st) => st.open);
  const label = options.find((o) => o.value === onto)?.label ?? onto;
  // A refs refresh can take the selection away under us; rebasing onto the name anyway would hit a ref
  // that no longer exists, so it stops being a selection.
  const valid = options.some((o) => o.value === onto);
  const pushed = !!head?.upstream && (head?.ahead ?? 0) === 0 && !head?.gone;
  const preview = onto ? gitCmd(interactive ? rebaseInteractiveArgs(onto, false, true, false) : rebaseArgs(onto)) : "";

  function submit() {
    if (!valid) return;
    onClose();
    // The todo dialog takes it from here: the flags and the run are its own.
    if (interactive) return open({ kind: "rebaseInteractive", base: onto, ontoLabel: label });
    void runOp(`Rebasing onto ${label}…`, (id) => ipc.rebase(id, onto), { success: `Rebased ${current} onto ${label}` });
  }

  return (
    <Dialog
      title={`Rebase ${current}`}
      onClose={onClose}
      onSubmit={submit}
      preview={preview}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!valid}>
            Rebase
          </Button>
        </>
      }
    >
      <Field
        label="Onto"
        help={
          pushed
            ? `${current} is already pushed to ${head?.upstream} — rewriting it will need a force push`
            : candidates.length === 0
              ? "No other branches"
              : `Replays the commits of ${current} on top of the selected ref`
        }
      >
        <Select aria-label="Onto" value={onto} onChange={(e) => setOnto(e.target.value)} autoFocus>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          {!valid && onto && (
            <option value={onto} disabled>
              {onto} (no longer exists)
            </option>
          )}
        </Select>
      </Field>
      <Options>
        <Checkbox checked={interactive} onChange={setInteractive}>
          Interactive — reorder, reword, squash or drop the commits first
        </Checkbox>
      </Options>
    </Dialog>
  );
}
