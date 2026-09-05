// "Run git command…": one `git …` line with completions, run like any other op.
import { useState } from "react";
import { Button } from "../../../components/ui/Button/Button";
import { CommandInput } from "../../../components/ui/CommandInput/CommandInput";
import { Dialog, Field } from "../../../components/ui/Dialog/Dialog";
import { interactiveFlag, splitArgs } from "../../../lib/argv";
import { useCmdHistoryStore } from "../../../store/cmdHistoryStore";
import { useRepoStore } from "../../../store/repoStore";
import { runGit } from "../actions";
import { gitCmd } from "./gitArgs";

export function RunCommandDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const history = useCmdHistoryStore((st) => st.history);
  const refs = useRepoStore((st) => st.refs);
  const parsed = splitArgs(text);
  const args = parsed.ok ? parsed.args : [];
  const flag = interactiveFlag(args);
  const error = !parsed.ok ? parsed.error : flag ? `${flag} needs a terminal; interactive mode is not supported here` : null;
  const ready = args.length > 0 && error === null;

  function submit() {
    if (!ready) return;
    onClose();
    void runGit(text);
  }

  return (
    <Dialog
      title="Run git command"
      wide
      onClose={onClose}
      onSubmit={submit}
      preview={ready ? gitCmd(args) : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!ready}>
            Run
          </Button>
        </>
      }
    >
      <Field label="Command" help={error ?? "Tab completes · ↑ / ↓ recall earlier commands"} invalid={error !== null}>
        {/* Upward, like the dock prompt: below the field the list covers the dialog's own Cancel / Run. */}
        <CommandInput aria-label="Git command" placement="up" autoFocus value={text} onChange={setText} onSubmit={submit} history={history} refs={refs} invalid={error !== null} />
      </Field>
    </Dialog>
  );
}
