import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "../../components/ui/Button/Button";
import { EmptyState } from "../../components/ui/EmptyState/EmptyState";
import s from "./GitMissingScreen.module.css";

export function GitMissingScreen({ message, onRetry, busy }: { message: string; onRetry: () => void; busy?: boolean }) {
  return (
    <div className={s.screen}>
      <div className={s.card}>
        <EmptyState
          icon={<TriangleAlert size={24} aria-hidden />}
          title="Git executable not found"
          hint="Install git (git-scm.com) or put it on PATH, then retry."
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
