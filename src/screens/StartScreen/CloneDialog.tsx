import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { useState } from "react";
import { cloneRepo } from "../../api/ipc";
import { onOpEventReady } from "../../api/events";
import { cancelOp, toAppError } from "../../api/ipc";
import type { RepoSummary } from "../../api/types";
import { Banner } from "../../components/ui/Banner/Banner";
import { Button } from "../../components/ui/Button/Button";
import { Checkbox } from "../../components/ui/Checkbox/Checkbox";
import { Dialog, Field, Options } from "../../components/ui/Dialog/Dialog";
import { IconButton } from "../../components/ui/IconButton/IconButton";
import { Input } from "../../components/ui/Input/Input";
import { Progress } from "../../components/ui/Progress/Progress";
import { Spinner } from "../../components/ui/Spinner/Spinner";
import { isAbsolutePath, joinPath, repoNameFromUrl } from "../../lib/paths";
import { cliDetail } from "../../store/toastStore";
import s from "./CloneDialog.module.css";

export interface CloneDialogProps {
  /** Initial destination parent folder. */
  defaultParent: string;
  onClose: () => void;
  /** The clone finished and the backend opened it. */
  onCloned: (repo: RepoSummary, parent: string) => void;
}

type Phase =
  | { kind: "idle"; error: string | null }
  /** `opId` is known once the `started` event arrives (enables Cancel). */
  | { kind: "running"; opId: string | null; line: string };

export function CloneDialog({ defaultParent, onClose, onCloned }: CloneDialogProps) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [parent, setParent] = useState(defaultParent);
  const [recurse, setRecurse] = useState(false);
  const [shallow, setShallow] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle", error: null });

  const running = phase.kind === "running";
  const dest = joinPath(parent.trim(), name.trim());
  // A relative parent would clone into the app's own working directory, wherever that is.
  const parentRelative = parent.trim() !== "" && !isAbsolutePath(parent.trim());
  const valid = url.trim() !== "" && name.trim() !== "" && parent.trim() !== "" && !parentRelative;
  // `--end-of-options` as the real argv has it: a url that starts with a dash is data, not a flag.
  const cmd = ["git clone --progress", recurse && "--recurse-submodules", shallow && "--depth 1", "--end-of-options", url.trim() || "<url>", dest || "<dest>"]
    .filter(Boolean)
    .join(" ");

  function onUrlChange(v: string) {
    setUrl(v);
    if (!nameEdited) setName(repoNameFromUrl(v));
  }

  async function pickParent() {
    const dir = await open({ directory: true, multiple: false, title: "Clone into folder", defaultPath: parent || undefined }).catch(() => null);
    if (dir) setParent(dir);
  }

  async function submit() {
    if (!valid || running) return;
    setPhase({ kind: "running", opId: null, line: "" });
    // Clone events carry `repoId: null`; `started` is always first, so its opId tags the rest.
    // The subscription must be attached *before* `clone_repo` runs or `started` (and with it the
    // opId that Cancel needs) can arrive while `listen` is still resolving.
    const unlisten = await onOpEventReady(({ repoId, opId, event }) => {
      if (repoId !== null) return;
      setPhase((p) => {
        if (p.kind !== "running") return p;
        if (event.kind === "started") return { ...p, opId };
        // One event carries a batch of lines; the newest is the one to show.
        if (p.opId === opId && (event.kind === "progress" || event.kind === "stderr")) return { ...p, line: event.lines[event.lines.length - 1] ?? p.line };
        return p;
      });
    });
    try {
      const repo = await cloneRepo({ url: url.trim(), dest, recurseSubmodules: recurse, depth: shallow ? 1 : undefined });
      onCloned(repo, parent.trim());
    } catch (e) {
      const err = toAppError(e);
      setPhase({ kind: "idle", error: err.kind === "cancelled" ? null : cliDetail(err.message) });
    } finally {
      unlisten();
    }
  }

  /** Cancel means "abort the clone" while it runs and "close" otherwise. */
  function cancel() {
    if (phase.kind === "running") {
      if (phase.opId) void cancelOp(phase.opId).catch(() => {});
    } else onClose();
  }

  return (
    <Dialog
      title="Clone repository"
      wide
      busy={running}
      onClose={onClose}
      onSubmit={() => void submit()}
      preview={running ? undefined : cmd}
      footer={
        <>
          {running && <Spinner label="Cloning" />}
          <Button variant="secondary" onClick={cancel} disabled={running && !phase.opId}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!valid || running}>
            Clone
          </Button>
        </>
      }
    >
      {phase.kind === "idle" && phase.error && (
        <Banner kind="danger">
          <span title={phase.error}>{phase.error}</span>
        </Banner>
      )}
      <Field label="URL">
        <Input
          aria-label="URL"
          autoFocus
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://github.com/user/repo.git"
          disabled={running}
          spellCheck={false}
        />
      </Field>
      <Field label="Parent folder" help={parentRelative ? "Use a full path — a relative one would clone next to the app" : undefined}>
        <div className={s.pathRow}>
          <Input
            aria-label="Parent folder"
            invalid={parentRelative}
            value={parent}
            onChange={(e) => setParent(e.target.value)}
            placeholder="Folder to clone into"
            disabled={running}
            spellCheck={false}
          />
          <IconButton label="Choose folder…" disabled={running} onClick={() => void pickParent()}>
            <FolderOpen size={16} aria-hidden />
          </IconButton>
        </div>
      </Field>
      <Field label="Folder name" help={<span title={dest}>{dest ? `Clones into ${dest}` : "Destination path appears here"}</span>}>
        <Input
          aria-label="Folder name"
          value={name}
          onChange={(e) => {
            setNameEdited(true);
            setName(e.target.value);
          }}
          placeholder="repo"
          disabled={running}
          spellCheck={false}
        />
      </Field>
      <Options inline>
        <Checkbox checked={recurse} onChange={setRecurse} disabled={running}>
          Recurse submodules
        </Checkbox>
        <Checkbox checked={shallow} onChange={setShallow} disabled={running}>
          Shallow (depth 1)
        </Checkbox>
      </Options>
      {running && (
        <>
          <div className={`${s.output} selectable`} aria-live="polite">
            <div className={s.cmd}>$ {cmd}</div>
            <div>{phase.line || "Starting…"}</div>
          </div>
          <Progress thin label="Cloning" />
        </>
      )}
    </Dialog>
  );
}
