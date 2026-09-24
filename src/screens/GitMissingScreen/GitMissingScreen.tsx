import { FolderSearch, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "../../components/ui/Button/Button";
import { EmptyState } from "../../components/ui/EmptyState/EmptyState";
import { APP_NAME } from "../../lib/app";
import s from "./GitMissingScreen.module.css";

/** `probe_git` failed: fix PATH and retry, or point the app at a git executable (`set_git_path`). */
export function GitMissingScreen({
  message,
  onRetry,
  onLocate,
  busy,
}: {
  message: string;
  onRetry: () => void;
  onLocate: () => void;
  busy?: boolean;
}) {
  return (
    <div className={s.screen}>
      <div className={s.card}>
        <EmptyState
          icon={<TriangleAlert size={24} aria-hidden />}
          title="Git not found"
          // "Restart", not "retry": git runs from the PATH the app started with, so a git installed since is
          // only found after a restart (smoke BF 5). Retry still helps when git lands in a folder already on it.
          hint={`${APP_NAME} needs git 2.24 or newer. Install it from git-scm.com, then restart ${APP_NAME} — or point the app at the git executable.`}
          action={
            <>
              <Button variant="secondary" icon={<RefreshCw size={14} aria-hidden />} onClick={onRetry} disabled={busy}>
                Retry
              </Button>
              <Button variant="secondary" icon={<FolderSearch size={14} aria-hidden />} onClick={onLocate} disabled={busy}>
                Locate git…
              </Button>
            </>
          }
        />
        <div className={`${s.message} selectable`}>{message}</div>
      </div>
    </div>
  );
}
