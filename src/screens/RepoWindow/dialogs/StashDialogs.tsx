// Stash changes + the Apply / Pop / Drop choice for one stash entry, and the pieces the stash
// browser (`StashesDialog`) renders too, so the two cannot drift.
import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import * as ipc from "../../../api/ipc";
import type { Stash, StatusEntry, WorkdirStatus } from "../../../api/types";
import { Button } from "../../../components/ui/Button/Button";
import { Checkbox } from "../../../components/ui/Checkbox/Checkbox";
import { Dialog, DialogText, Field, Mono, Options } from "../../../components/ui/Dialog/Dialog";
import { Input } from "../../../components/ui/Input/Input";
import { MenuItem, MenuSeparator } from "../../../components/ui/Menu/Menu";
import { StatusGlyph } from "../../../components/ui/StatusGlyph/StatusGlyph";
import { runOp, selectRunning, useOpsStore } from "../../../store/opsStore";
import { useRepoStore } from "../../../store/repoStore";
import { useStatusStore } from "../../../store/statusStore";
import { stashApply, stashDrop, stashPop } from "../actions";
import { gitCmd, stashPushArgs } from "./gitArgs";
import s from "./StashDialogs.module.css";

/** What `git stash push` is about to be run with. */
export interface StashPushValues {
  message: string;
  untracked: boolean;
  keepIndex: boolean;
}

export const EMPTY_PUSH: StashPushValues = {
  message: "",
  untracked: true,
  keepIndex: false,
};

export const stashPushPreview = (v: StashPushValues) => gitCmd(stashPushArgs(v.message.trim() || null, v.untracked, v.keepIndex));

/**
 * What `git stash push` will take: every tracked entry with an index or workdir change (one list —
 * `--keep-index` only leaves the index copy behind) and untracked files only with `-u`; nothing at
 * all while a conflict is unresolved (`stashBlocker`).
 * ponytail: a dirty-only submodule is listed though git stashes nothing of its own tree; the count
 * this replaced had the same blind spot.
 */
export const stashFiles = (status: WorkdirStatus | null, untracked: boolean): StatusEntry[] =>
  stashBlocker(status) ? [] : (status?.entries ?? []).filter((e) => (e.index !== null || e.workdir !== null) && (untracked || e.workdir !== "untracked"));

/** Why a push cannot run whatever the tree holds, or `null`: git will not write the index over an unmerged entry. */
export const stashBlocker = (status: WorkdirStatus | null): string | null => ((status?.conflicted ?? 0) > 0 ? "Resolve conflicts first" : null);

/** The same, reactive — what both stash surfaces list and count. */
export function useStashFiles(untracked: boolean): StatusEntry[] {
  const status = useStatusStore((st) => st.status);
  return useMemo(() => stashFiles(status, untracked), [status, untracked]);
}

/** Stash button label; plain `Stash` at zero, where the button is disabled anyway. */
export const stashLabel = (n: number) => (n === 0 ? "Stash" : n === 1 ? "Stash 1 file" : `Stash ${n} files`);

export const stashPushOp = (v: StashPushValues) =>
  runOp("Stashing changes…", (id) => ipc.stashPush(id, v.message.trim() || null, v.untracked, v.keepIndex), { success: "Stashed changes" });

/** The three fields of a stash push, shared by the dialog and the browser's inline form. */
export function StashPushFields({ value, onChange, autoFocus }: { value: StashPushValues; onChange: (v: StashPushValues) => void; autoFocus?: boolean }) {
  return (
    <>
      <Field label="Message" help="Shown in the Stashes list; git writes a default one when empty">
        <Input aria-label="Message" autoFocus={autoFocus} value={value.message} onChange={(e) => onChange({ ...value, message: e.target.value })} placeholder="WIP on…" />
      </Field>
      <Options>
        <Checkbox checked={value.untracked} onChange={(untracked) => onChange({ ...value, untracked })}>
          Include untracked files
        </Checkbox>
        <Checkbox checked={value.keepIndex} onChange={(keepIndex) => onChange({ ...value, keepIndex })} title="Staged changes stay staged in the working tree">
          Keep the index
        </Checkbox>
      </Options>
    </>
  );
}

/** One stash row's menu — the sidebar's and the browser's are the same items. */
export function StashMenuItems({ stash, onPick }: { stash: Stash; onPick: () => void }) {
  const previewStash = useRepoStore((st) => st.previewStash);
  const op = useOpsStore(selectRunning) ? { disabled: true, title: "Operation in progress" } : {};
  const run = (fn: () => void) => () => {
    onPick();
    fn();
  };
  return (
    <>
      <MenuItem onClick={run(() => previewStash(stash))}>Preview</MenuItem>
      <MenuSeparator />
      <MenuItem {...op} onClick={run(() => void stashApply(stash.index))}>
        Apply
      </MenuItem>
      <MenuItem {...op} onClick={run(() => void stashPop(stash.index))}>
        Pop
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<Trash2 size={16} aria-hidden />} danger {...op} onClick={run(() => void stashDrop(stash.index, stash.message))}>
        Drop
      </MenuItem>
    </>
  );
}

export function StashPushDialog({ onClose }: { onClose: () => void }) {
  const [values, setValues] = useState(EMPTY_PUSH);
  const files = useStashFiles(values.untracked);
  const empty = useStatusStore((st) => stashBlocker(st.status) ?? "Nothing to stash");

  function submit() {
    if (files.length === 0) return;
    onClose();
    void stashPushOp(values);
  }

  return (
    <Dialog
      title="Stash changes"
      onClose={onClose}
      onSubmit={submit}
      preview={stashPushPreview(values)}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={files.length === 0} title={files.length === 0 ? empty : undefined}>
            {stashLabel(files.length)}
          </Button>
        </>
      }
    >
      <StashPushFields value={values} onChange={setValues} autoFocus />
      {files.length === 0 ? (
        <div className={s.empty}>{empty}</div>
      ) : (
        <div className={s.files} role="list" aria-label="Files to stash">
          {files.map((e) => (
            <div key={e.path} className={s.file} role="listitem">
              <StatusGlyph status={e.conflicted ? "conflicted" : (e.workdir ?? e.index ?? "modified")} />
              <span className={s.path}>
                <bdi dir="ltr">{e.path}</bdi>
              </span>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

/** Apply keeps the entry, Pop applies and removes it, Drop discards it. */
export function StashDialog({ onClose, index, message }: { onClose: () => void; index: number; message: string }) {
  const act = (fn: (i: number) => Promise<unknown>) => {
    onClose();
    void fn(index);
  };
  return (
    <Dialog
      title={`stash@{${index}}`}
      onClose={onClose}
      onSubmit={() => act(stashPop)}
      preview={`git stash pop stash@{${index}}`}
      footer={
        <>
          <Button variant="danger" onClick={() => act((i) => stashDrop(i, message))}>
            Drop
          </Button>
          <Button onClick={() => act(stashApply)}>Apply</Button>
          <Button variant="primary" type="submit">
            Pop
          </Button>
        </>
      }
    >
      <DialogText>
        <Mono>{message}</Mono>
      </DialogText>
      <DialogText>Apply restores the changes and keeps the stash; Pop restores and removes it; Drop discards it without restoring.</DialogText>
    </Dialog>
  );
}
