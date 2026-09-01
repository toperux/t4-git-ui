// Branch / tag dialogs: create, rename, delete (local + remote), create / delete tag.
import { Cloud, GitBranch, Search, Tag } from "lucide-react";
import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import * as ipc from "../../../api/ipc";
import { Button } from "../../../components/ui/Button/Button";
import { Checkbox } from "../../../components/ui/Checkbox/Checkbox";
import { Dialog, DialogText, Field, Mono, Options } from "../../../components/ui/Dialog/Dialog";
import { Input, Select } from "../../../components/ui/Input/Input";
import { cx } from "../../../lib/cx";
import { validateRefName } from "../../../lib/branchName";
import { runOp } from "../../../store/opsStore";
import { useRepoStore } from "../../../store/repoStore";
import { checkoutBranch, checkoutDetached, checkoutRemoteBranch, stripRemote } from "../actions";
import { checkoutArgs, gitCmd } from "./gitArgs";
import { RemoteField, useDefaultRemote, useRemotes } from "./OpsDialogs";
import s from "./RefDialogs.module.css";

/** Start points a branch / tag can be created at: HEAD, local branches, remote branches, tags. */
function useStartPoints() {
  const refs = useRepoStore((st) => st.refs);
  return useMemo(() => {
    const remotes = (refs?.remotes ?? []).flatMap((r) => r.branches.map((b) => b.name));
    return {
      remotes,
      options: [
        { value: "HEAD", label: refs?.head.branch ? `HEAD (${refs.head.branch})` : "HEAD" },
        ...(refs?.local ?? []).map((b) => ({ value: b.name, label: b.name })),
        ...remotes.map((n) => ({ value: n, label: n })),
        ...(refs?.tags ?? []).map((t) => ({ value: t.name, label: t.name })),
      ],
    };
  }, [refs]);
}

export function CreateBranchDialog({ onClose, startPoint: initial }: { onClose: () => void; startPoint?: string }) {
  const { options, remotes } = useStartPoints();
  const local = useRepoStore((st) => st.refs?.local);
  const existing = useMemo(() => (local ?? []).map((b) => b.name), [local]);
  const known = !!initial && options.some((o) => o.value === initial);
  const [name, setName] = useState("");
  const [start, setStart] = useState(initial ?? "HEAD");
  const [checkout, setCheckout] = useState(true);
  const [track, setTrack] = useState(true);
  const isRemote = remotes.includes(start);
  const error = name ? validateRefName(name, existing) : null;
  const valid = !!name && !error;
  // An oid from the grid ("Create branch here…") is not in the list: keep it as an extra option,
  // otherwise the Select falls back to its first entry and the branch lands on HEAD.
  const starts = known || !initial ? options : [{ value: initial, label: initial.slice(0, 7) }, ...options];
  const preview = checkout ? gitCmd(checkoutArgs(start, name || "<name>", isRemote && track)) : `git branch ${name || "<name>"} ${start}`;

  function submit() {
    if (!valid) return;
    onClose();
    // `create_branch --checkout` runs `git checkout -b`; --track needs the CLI path too.
    if (checkout) {
      void runOp(`Creating ${name}…`, (id) => ipc.checkout(id, start, name, isRemote && track), { success: `Created and checked out ${name}` });
    } else {
      void runOp(`Creating ${name}…`, (id) => ipc.createBranch(id, name, start, false), { success: `Created ${name}` });
    }
  }

  return (
    <Dialog
      title="Create branch"
      onClose={onClose}
      onSubmit={submit}
      preview={preview}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!valid}>
            Create
          </Button>
        </>
      }
    >
      <Field label="Name" help={error ?? "Letters, digits, - _ / . — no spaces"} invalid={!!error}>
        <Input aria-label="Name" autoFocus invalid={!!error} value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} placeholder="feature/my-change" />
      </Field>
      <Field label="Start point">
        <Select aria-label="Start point" value={start} onChange={(e) => setStart(e.target.value)}>
          {starts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Options>
        <Checkbox checked={checkout} onChange={setCheckout}>
          Check out after create
        </Checkbox>
        {isRemote && (
          <Checkbox checked={track} onChange={setTrack} disabled={!checkout} title={checkout ? undefined : "Tracking is set by the checkout"}>
            Track {start}
          </Checkbox>
        )}
      </Options>
    </Dialog>
  );
}

export function RenameBranchDialog({ onClose, name: old }: { onClose: () => void; name: string }) {
  const local = useRepoStore((st) => st.refs?.local);
  const existing = useMemo(() => (local ?? []).map((b) => b.name).filter((n) => n !== old), [local, old]);
  const [name, setName] = useState(old);
  const error = name === old ? "Enter a new name" : validateRefName(name, existing);
  const valid = !error;

  function submit() {
    if (!valid) return;
    onClose();
    void runOp(`Renaming ${old}…`, (id) => ipc.renameBranch(id, old, name, false), { success: `Renamed ${old} → ${name}` });
  }

  return (
    <Dialog
      title="Rename branch"
      onClose={onClose}
      onSubmit={submit}
      preview={`git branch -m ${old} ${name || "<name>"}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!valid}>
            Rename
          </Button>
        </>
      }
    >
      <Field label="New name" help={error ?? `Renames ${old}`} invalid={!!error && name !== old}>
        <Input aria-label="New name" autoFocus invalid={!!error && name !== old} value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} />
      </Field>
    </Dialog>
  );
}

export function DeleteBranchDialog({ onClose, name }: { onClose: () => void; name: string }) {
  // A `refused` rejection (unmerged branch) re-shows the dialog with a force button.
  const [refused, setRefused] = useState<string | null>(null);

  function run(force: boolean) {
    void runOp(`Deleting ${name}…`, (id) => ipc.deleteBranch(id, name, force), {
      success: `Deleted ${name}`,
      onRefused: (message) => setRefused(message),
    }).then((out) => {
      if (out.ok) onClose();
    });
  }

  return (
    <Dialog
      title="Delete branch"
      onClose={onClose}
      onSubmit={() => run(!!refused)}
      preview={`git branch ${refused ? "-D" : "-d"} ${name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" type="submit">
            {refused ? "Force delete" : "Delete"}
          </Button>
        </>
      }
    >
      <DialogText>
        {refused ? (
          <>
            {refused} — force deleting <Mono>{name}</Mono> discards its unmerged commits.
          </>
        ) : (
          <>
            Delete <Mono>{name}</Mono>? Its commits stay in the history until git garbage-collects them.
          </>
        )}
      </DialogText>
    </Dialog>
  );
}

export function DeleteRemoteBranchDialog({ onClose, remote, name }: { onClose: () => void; remote: string; name: string }) {
  function submit() {
    onClose();
    void runOp(`Deleting ${remote}/${name}…`, (id) => ipc.deleteRemoteBranch(id, remote, name), { success: `Deleted ${remote}/${name}` });
  }
  return (
    <Dialog
      title="Delete remote branch"
      onClose={onClose}
      onSubmit={submit}
      preview={`git push ${remote} --delete ${name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" type="submit">
            Delete on remote
          </Button>
        </>
      }
    >
      <DialogText>
        Delete <Mono>{`${remote}/${name}`}</Mono> on the remote? Other clones keep their copy until they fetch with prune.
      </DialogText>
    </Dialog>
  );
}

export function CreateTagDialog({ onClose, target: initial }: { onClose: () => void; target?: string }) {
  const { options } = useStartPoints();
  const tags = useRepoStore((st) => st.refs?.tags);
  const existing = useMemo(() => (tags ?? []).map((t) => t.name), [tags]);
  const known = initial && options.some((o) => o.value === initial);
  const [name, setName] = useState("");
  const [target, setTarget] = useState(initial ?? "HEAD");
  const [message, setMessage] = useState("");
  const error = name ? validateRefName(name, existing) : null;
  const valid = !!name && !error;
  // An oid from the grid is not in the list: keep it as an extra option.
  const targets = known || !initial ? options : [{ value: initial, label: initial.slice(0, 7) }, ...options];

  function submit() {
    if (!valid) return;
    onClose();
    void runOp(`Creating tag ${name}…`, (id) => ipc.createTag(id, name, target, message.trim() || null), { success: `Created tag ${name}` });
  }

  return (
    <Dialog
      title="Create tag"
      onClose={onClose}
      onSubmit={submit}
      preview={`git tag ${message.trim() ? `-a -m '…' ` : ""}${name || "<name>"} ${target}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!valid}>
            Create
          </Button>
        </>
      }
    >
      <Field label="Name" help={error ?? "v1.2.0"} invalid={!!error}>
        <Input aria-label="Name" autoFocus invalid={!!error} value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} />
      </Field>
      <Field label="Target">
        <Select aria-label="Target" value={target} onChange={(e) => setTarget(e.target.value)}>
          {targets.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Message" help="With a message the tag is annotated (and signed by user.name / user.email)">
        <Input aria-label="Message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional" />
      </Field>
    </Dialog>
  );
}

/**
 * Local delete, optionally the remote's copy too. Tags aren't tracked per remote the way
 * branches are: once the local one is gone the sidebar has nothing left to offer "Delete on
 * remote…" on, so the choice has to be made here — and the remote goes first, so a failed
 * push leaves the tag in place to try again.
 */
export function DeleteTagDialog({ onClose, name }: { onClose: () => void; name: string }) {
  const remotes = useRemotes();
  const [remote, setRemote] = useDefaultRemote(remotes);
  const [onRemote, setOnRemote] = useState(false);
  const refspec = `refs/tags/${name}`;
  const preview = onRemote ? `git push ${remote || "origin"} --delete ${refspec} && git tag -d ${name}` : `git tag -d ${name}`;

  async function submit() {
    onClose();
    if (onRemote) {
      const r = await runOp(`Deleting tag ${name} on ${remote}…`, (id) => ipc.deleteRemoteBranch(id, remote, refspec), { success: `Deleted tag ${name} on ${remote}` });
      if (!r.ok) return;
    }
    await runOp(`Deleting tag ${name}…`, (id) => ipc.deleteTag(id, name), { success: `Deleted tag ${name}` });
  }
  return (
    <Dialog
      title="Delete tag"
      onClose={onClose}
      onSubmit={() => void submit()}
      preview={preview}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" type="submit" disabled={onRemote && !remote}>
            Delete
          </Button>
        </>
      }
    >
      <DialogText>
        Delete tag <Mono>{name}</Mono>? A tag already pushed stays on the remote unless it is deleted there too — and the next fetch brings
        it back.
      </DialogText>
      <Options>
        <Checkbox checked={onRemote} onChange={setOnRemote} disabled={remotes.length === 0}>
          Also delete on the remote
        </Checkbox>
      </Options>
      {onRemote && <RemoteField remotes={remotes} value={remote} onChange={setRemote} />}
    </Dialog>
  );
}

/** Searchable branch / tag picker: type to filter, ↑/↓ to move, Enter checks out. */
/** Several branches sit at the commit the context menu was opened on: pick the one to check out. */
export function CheckoutBranchDialog({ onClose, branches }: { onClose: () => void; branches: { name: string; remote: string | null }[] }) {
  const [name, setName] = useState(branches[0]?.name ?? "");
  const pick = branches.find((b) => b.name === name) ?? branches[0];
  // A remote branch is checked out the way the sidebar does it: a new tracking local of the same short name.
  const local = pick?.remote ? stripRemote({ name: pick.name, oid: "" }, pick.remote) : null;

  function submit() {
    if (!pick) return;
    onClose();
    if (pick.remote) void checkoutRemoteBranch({ name: pick.name, oid: "" }, pick.remote);
    else void checkoutBranch(pick.name);
  }

  return (
    <Dialog
      title="Checkout"
      onClose={onClose}
      onSubmit={submit}
      preview={pick ? gitCmd(local ? checkoutArgs(pick.name, local, true) : checkoutArgs(pick.name, null, false)) : ""}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!pick}>
            Checkout
          </Button>
        </>
      }
    >
      <Field label="Branch" help={local ? `Creates a local ${local} tracking ${pick.name}` : undefined}>
        <Select aria-label="Branch" autoFocus value={pick?.name ?? ""} onChange={(e) => setName(e.target.value)}>
          {branches.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}
            </option>
          ))}
        </Select>
      </Field>
    </Dialog>
  );
}

export function CheckoutDialog({ onClose }: { onClose: () => void }) {
  const refs = useRepoStore((st) => st.refs);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  const all = useMemo(() => {
    const locals = (refs?.local ?? []).map((b) => ({ name: b.name, kind: "local" as const, current: b.isHead }));
    const remotes = (refs?.remotes ?? []).flatMap((r) => r.branches.map((b) => ({ name: b.name, kind: "remote" as const, remote: r.name, current: false })));
    const tags = (refs?.tags ?? []).map((t) => ({ name: t.name, kind: "tag" as const, current: false }));
    return [...locals, ...remotes, ...tags];
  }, [refs]);
  const q = query.trim().toLowerCase();
  const items = q ? all.filter((r) => r.name.toLowerCase().includes(q)) : all;
  const pick = items[Math.min(index, items.length - 1)];

  function submit() {
    if (!pick || pick.current) return;
    onClose();
    if (pick.kind === "local") void checkoutBranch(pick.name);
    else if (pick.kind === "remote") void checkoutRemoteBranch({ name: pick.name, oid: "" }, pick.remote);
    else void checkoutDetached(pick.name);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    setIndex((i) => {
      const n = items.length;
      if (n === 0) return 0;
      const cur = Math.min(i, n - 1);
      return e.key === "ArrowDown" ? (cur + 1) % n : (cur - 1 + n) % n;
    });
  }

  return (
    <Dialog
      title="Checkout"
      onClose={onClose}
      onSubmit={submit}
      preview={pick ? gitCmd(checkoutArgs(pick.name, null, false)) : ""}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!pick || pick.current}>
            Checkout
          </Button>
        </>
      }
    >
      <Field label="Branch or tag" help={items.length === 0 ? "Nothing matches" : pick?.current ? `${pick.name} is already checked out` : "↑ ↓ to choose, Enter to check out"}>
        <Input
          aria-label="Branch or tag"
          autoFocus
          icon={<Search size={14} aria-hidden />}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={onKeyDown}
          spellCheck={false}
          placeholder="Filter"
        />
      </Field>
      <div className={s.list} role="listbox" aria-label="Branches and tags">
        {items.map((r, i) => (
          <div
            key={`${r.kind}:${r.name}`}
            role="option"
            aria-selected={r === pick}
            className={cx(s.option, r === pick && s.optionActive)}
            onMouseDown={(e) => {
              e.preventDefault();
              setIndex(i);
            }}
            onDoubleClick={submit}
          >
            {r.kind === "tag" ? <Tag size={14} aria-hidden /> : r.kind === "remote" ? <Cloud size={14} aria-hidden /> : <GitBranch size={14} aria-hidden />}
            <span className={s.optionLabel}>{r.name}</span>
            {r.current && <span className={s.optionMeta}>current</span>}
          </div>
        ))}
      </div>
    </Dialog>
  );
}
