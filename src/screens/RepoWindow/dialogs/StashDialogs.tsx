// Stash changes + the Apply / Pop / Drop choice for one stash entry.
import { useState } from "react";
import * as ipc from "../../../api/ipc";
import { Button } from "../../../components/ui/Button/Button";
import { Checkbox } from "../../../components/ui/Checkbox/Checkbox";
import { Dialog, DialogText, Field, Mono, Options } from "../../../components/ui/Dialog/Dialog";
import { Input } from "../../../components/ui/Input/Input";
import { runOp } from "../../../store/opsStore";
import { stashApply, stashDrop, stashPop } from "../actions";
import { gitCmd, stashPushArgs } from "./gitArgs";

export function StashPushDialog({ onClose }: { onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [untracked, setUntracked] = useState(true);
  const [keepIndex, setKeepIndex] = useState(false);
  const preview = gitCmd(stashPushArgs(message.trim() || null, untracked, keepIndex));

  function submit() {
    onClose();
    void runOp("Stashing changes…", (id) => ipc.stashPush(id, message.trim() || null, untracked, keepIndex), { success: "Stashed changes" });
  }

  return (
    <Dialog
      title="Stash changes"
      onClose={onClose}
      onSubmit={submit}
      preview={preview}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit">
            Stash
          </Button>
        </>
      }
    >
      <Field label="Message" help="Shown in the Stashes list; git writes a default one when empty">
        <Input aria-label="Message" autoFocus value={message} onChange={(e) => setMessage(e.target.value)} placeholder="WIP on…" />
      </Field>
      <Options>
        <Checkbox checked={untracked} onChange={setUntracked}>
          Include untracked files
        </Checkbox>
        <Checkbox checked={keepIndex} onChange={setKeepIndex} title="Staged changes stay staged in the working tree">
          Keep the index
        </Checkbox>
      </Options>
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
          <Button variant="danger" onClick={() => act(stashDrop)}>
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
