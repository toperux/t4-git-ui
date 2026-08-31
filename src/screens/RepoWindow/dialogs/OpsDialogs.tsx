// Push / Pull / Fetch / Merge / Rebase — the dialogs that drive a streaming remote or history op.
import { useEffect, useMemo, useState } from "react";
import * as ipc from "../../../api/ipc";
import type { FfMode, PullMode } from "../../../api/types";
import { Button } from "../../../components/ui/Button/Button";
import { Checkbox } from "../../../components/ui/Checkbox/Checkbox";
import { Dialog, Field, FieldRow, Options } from "../../../components/ui/Dialog/Dialog";
import { Input, Select } from "../../../components/ui/Input/Input";
import { runOp } from "../../../store/opsStore";
import { useRepoStore } from "../../../store/repoStore";
import { currentBranch, defaultRemote } from "../actions";
import { fetchArgs, gitCmd, mergeArgs, pullArgs, pushArgs, rebaseArgs } from "./gitArgs";

/** Remote names of the open repo. */
function useRemotes() {
  const remotes = useRepoStore((st) => st.refs?.remotes);
  return useMemo(() => (remotes ?? []).map((r) => r.name), [remotes]);
}

/** `get_default_remote`, falling back to the first remote. */
function useDefaultRemote(remotes: string[]) {
  const [remote, setRemote] = useState<string>(() => remotes[0] ?? "");
  useEffect(() => {
    let live = true;
    void defaultRemote().then((r) => {
      if (live && r) setRemote(r);
    });
    return () => {
      live = false;
    };
  }, []);
  return [remote, setRemote] as const;
}

const RemoteField = ({ remotes, value, onChange, all }: { remotes: string[]; value: string; onChange: (v: string) => void; all?: boolean }) => (
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
    void runOp(`Pushing to ${remote}…`, (id) => ipc.push(id, remote, branch, setUpstream, force, tags), { success: `Pushed ${branch} → ${target}` });
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
    void runOp(`Fetching ${what}…`, (id) => ipc.fetch(id, remote || null, prune, tags), { success: `Fetched ${what}` });
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
    const locals = (refs?.local ?? []).filter((b) => !b.isHead).map((b) => b.name);
    const remotes = (refs?.remotes ?? []).flatMap((r) => r.branches.map((b) => b.name));
    return [...locals, ...remotes];
  }, [refs]);
  const [branch, setBranch] = useState(initial ?? candidates[0] ?? "");
  const [ff, setFf] = useState<FfMode>("auto");
  const [squash, setSquash] = useState(false);
  const [message, setMessage] = useState("");

  const defaultMessage = branch ? `Merge branch '${branch}' into ${current}` : "";
  const effective = message.trim() && message !== defaultMessage ? message : null;
  const preview = branch ? gitCmd(mergeArgs(branch, ff, squash, effective)) : "";

  function submit() {
    if (!branch) return;
    onClose();
    // `--squash` records nothing: the changes land in the index and the user still has to commit.
    const success = squash ? `Squashed ${branch} into the index — commit to finish` : `Merged ${branch} into ${current}`;
    void runOp(`Merging ${branch}…`, (id) => ipc.merge(id, branch, ff, squash, effective), { success });
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
          <Button variant="primary" type="submit" disabled={!branch}>
            Merge
          </Button>
        </>
      }
    >
      <Field label="Branch to merge" help={candidates.length === 0 ? "No other branches" : undefined}>
        <Select aria-label="Branch to merge" value={branch} onChange={(e) => setBranch(e.target.value)} autoFocus>
          {candidates.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
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

export function RebaseDialog({ onClose, onto: initial }: { onClose: () => void; onto?: string }) {
  const refs = useRepoStore((st) => st.refs);
  const head = refs?.local.find((b) => b.isHead);
  const current = head?.name ?? "HEAD";
  const candidates = useMemo(() => {
    const locals = (refs?.local ?? []).filter((b) => !b.isHead).map((b) => b.name);
    const remotes = (refs?.remotes ?? []).flatMap((r) => r.branches.map((b) => b.name));
    return [...locals, ...remotes];
  }, [refs]);
  const [onto, setOnto] = useState(initial ?? candidates[0] ?? "");
  const pushed = !!head?.upstream && (head?.ahead ?? 0) === 0 && !head?.gone;
  const preview = onto ? gitCmd(rebaseArgs(onto)) : "";

  function submit() {
    if (!onto) return;
    onClose();
    void runOp(`Rebasing onto ${onto}…`, (id) => ipc.rebase(id, onto), { success: `Rebased ${current} onto ${onto}` });
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
          <Button variant="primary" type="submit" disabled={!onto}>
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
          {candidates.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </Select>
      </Field>
    </Dialog>
  );
}
