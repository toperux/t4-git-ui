import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "../../components/ui/Button/Button";
import { EmptyState } from "../../components/ui/EmptyState/EmptyState";
import s from "./GitMissingScreen.module.css";

/** `probe_git` failed. There is no `set_git_path` command, so the only fix is PATH + Retry. */
export function GitMissingScreen({ message, onRetry, busy }: { message: string; onRetry: () => void; busy?: boolean }) {
  return (
    <div className={s.screen}>
      <div className={s.card}>
        <EmptyState
          icon={<TriangleAlert size={24} aria-hidden />}
          title="Git not found"
          hint="t4 git ui needs git 2.20 or newer on PATH. Install it from git-scm.com or add it to PATH, then retry."
          action={
            <Button variant="secondary" icon={<RefreshCw size={14} aria-hidden />} onClick={onRetry} disabled={busy}>
              Retry
            </Button>
          }
        />
        <div className={`${s.message} selectable`}>{message}</div>
      </div>
    </div>
  );
}
