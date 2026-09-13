// Stash changes + the Apply / Pop / Drop choice for one stash entry, and the pieces the stash
// browser (`StashesDialog`) renders too, so the two cannot drift.
import { useState } from "react";
import { Trash2 } from "lucide-react";
import * as ipc from "../../../api/ipc";
import type { Stash } from "../../../api/types";
import { Button } from "../../../components/ui/Button/Button";
import { Checkbox } from "../../../components/ui/Checkbox/Checkbox";
import { Dialog, DialogText, Field, Mono, Options } from "../../../components/ui/Dialog/Dialog";
import { Input } from "../../../components/ui/Input/Input";
import { MenuItem, MenuSeparator } from "../../../components/ui/Menu/Menu";
import { runOp, selectRunning, useOpsStore } from "../../../store/opsStore";
import { useRepoStore } from "../../../store/repoStore";
import { stashApply, stashDrop, stashPop } from "../actions";
import { gitCmd, stashPushArgs } from "./gitArgs";

/** What `git stash push` is about to be run with. */
export interface StashPushValues {
  message: string;
  untracked: boolean;
  keepIndex: boolean;
}

export const EMPTY_PUSH: StashPushValues = { message: "", untracked: true, keepIndex: false };

export const stashPushPreview = (v: StashPushValues) => gitCmd(stashPushArgs(v.message.trim() || null, v.untracked, v.keepIndex));

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

  function submit() {
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
          <Button variant="primary" type="submit">
            Stash
          </Button>
        </>
      }
    >
      <StashPushFields value={values} onChange={setValues} autoFocus />
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
