// Remote dialogs: add, rename, change URL, remove.
import { useState } from "react";
import * as ipc from "../../../api/ipc";
import { Button } from "../../../components/ui/Button/Button";
import { Checkbox } from "../../../components/ui/Checkbox/Checkbox";
import { Dialog, DialogText, Field, Mono, Options } from "../../../components/ui/Dialog/Dialog";
import { Input } from "../../../components/ui/Input/Input";
import { validateRefName } from "../../../lib/branchName";
import { runOp } from "../../../store/opsStore";
import { fetchArgs, gitCmd } from "./gitArgs";
import { fetchRemote } from "../actions";
import { useRemotes } from "./OpsDialogs";

export function AddRemoteDialog({ onClose }: { onClose: () => void }) {
  const remotes = useRemotes();
  // The first remote of a repository is `origin` by convention; a second one has no obvious name.
  const [name, setName] = useState(remotes.length === 0 ? "origin" : "");
  const [url, setUrl] = useState("");
  const [fetchNow, setFetchNow] = useState(true);
  // The remote name follows the ref-name rules; git2 has the final say.
  const error = name ? validateRefName(name, remotes) : null;
  const trimmed = url.trim();
  const valid = !!name && !error && !!trimmed;
  const addCmd = gitCmd(["remote", "add", name || "<name>", trimmed || "<url>"]);
  const preview = fetchNow ? `${addCmd} && ${gitCmd(fetchArgs(name || "<name>", true, false))}` : addCmd;

  async function submit() {
    if (!valid) return;
    onClose();
    const r = await runOp(`Adding ${name}…`, (id) => ipc.addRemote(id, name, trimmed), { success: `Added ${name}` });
    // Nothing to fetch from a remote that was never added.
    if (!r.ok || !fetchNow) return;
    await fetchRemote(name);
  }

  return (
    <Dialog
      title="Add remote"
      onClose={onClose}
      onSubmit={() => void submit()}
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
      <Field label="Name" help={error ?? "Letters, digits, - _ / . — no spaces"} invalid={!!error}>
        <Input aria-label="Name" autoFocus invalid={!!error} value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} placeholder="origin" />
      </Field>
      <Field label="URL" help="An https:// or ssh URL, or a local path">
        <Input aria-label="URL" value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} placeholder="git@github.com:owner/repo.git" />
      </Field>
      <Options>
        <Checkbox checked={fetchNow} onChange={setFetchNow}>
          Fetch now
        </Checkbox>
      </Options>
    </Dialog>
  );
}

export function RenameRemoteDialog({ onClose, name: old }: { onClose: () => void; name: string }) {
  const remotes = useRemotes();
  const existing = remotes.filter((n) => n !== old);
  const [name, setName] = useState(old);
  const error = name === old ? "Enter a new name" : validateRefName(name, existing);
  const valid = !error;

  function submit() {
    if (!valid) return;
    onClose();
    void runOp(`Renaming ${old}…`, (id) => ipc.renameRemote(id, old, name), { success: `Renamed ${old} → ${name}` });
  }

  return (
    <Dialog
      title="Rename remote"
      onClose={onClose}
      onSubmit={submit}
      preview={gitCmd(["remote", "rename", old, name || "<name>"])}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!valid}>
            Rename
          </Button>
        </>
      }
    >
      <DialogText>Remote-tracking branches and the branches that track them follow the new name.</DialogText>
      <Field label="New name" help={error ?? `Renames ${old}`} invalid={!!error && name !== old}>
        <Input aria-label="New name" autoFocus invalid={!!error && name !== old} value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} />
      </Field>
    </Dialog>
  );
}

export function SetRemoteUrlDialog({ onClose, name, url: current }: { onClose: () => void; name: string; url: string | null }) {
  const [url, setUrl] = useState(current ?? "");
  const trimmed = url.trim();
  const error = !trimmed ? "Enter a URL" : trimmed === current ? "Enter a different URL" : null;
  const valid = !error;

  function submit() {
    if (!valid) return;
    onClose();
    void runOp(`Changing ${name}'s URL…`, (id) => ipc.setRemoteUrl(id, name, trimmed), { success: `Changed ${name}'s URL` });
  }

  return (
    <Dialog
      title="Change remote URL"
      onClose={onClose}
      onSubmit={submit}
      preview={gitCmd(["remote", "set-url", name, trimmed || "<url>"])}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!valid}>
            Change
          </Button>
        </>
      }
    >
      <Field label="URL" help={error ?? `The fetch URL of ${name}`} invalid={!!error && !!trimmed}>
        <Input aria-label="URL" autoFocus invalid={!!error && !!trimmed} value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} />
      </Field>
    </Dialog>
  );
}

export function RemoveRemoteDialog({ onClose, name }: { onClose: () => void; name: string }) {
  function submit() {
    onClose();
    void runOp(`Removing ${name}…`, (id) => ipc.removeRemote(id, name), { success: `Removed ${name}` });
  }

  return (
    <Dialog
      title="Remove remote"
      onClose={onClose}
      onSubmit={submit}
      preview={gitCmd(["remote", "remove", name])}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" type="submit">
            Remove
          </Button>
        </>
      }
    >
      <DialogText>
        Remove <Mono>{name}</Mono>? Its remote-tracking branches go with it, and local branches that tracked them lose their upstream (their
        commits stay).
      </DialogText>
    </Dialog>
  );
}
