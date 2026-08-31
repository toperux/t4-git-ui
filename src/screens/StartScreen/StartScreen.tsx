import { open } from "@tauri-apps/plugin-dialog";
import { CircleCheck, Folder, GitBranch } from "lucide-react";
import { useState } from "react";
import { toAppError } from "../../api/ipc";
import type { AppError } from "../../api/types";
import { Banner } from "../../components/ui/Banner/Banner";
import { Spinner } from "../../components/ui/Spinner/Spinner";
import { StatusBar, StatusItem } from "../../components/ui/StatusBar/StatusBar";
import { useRepoStore } from "../../store/repoStore";
import pkg from "../../../package.json";
import s from "./StartScreen.module.css";

const ERROR_TITLE: Record<string, string> = {
  notARepo: "Not a git repository",
  gitNotFound: "Git executable not found",
  io: "Couldn't read the folder",
};

/** Minimal M1 start screen. TODO(M5): recent repositories, Clone…, Initialize…, settings. */
export function StartScreen() {
  const openRepo = useRepoStore((st) => st.openRepo);
  const gitVersion = useRepoStore((st) => st.gitVersion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  async function pick() {
    setError(null);
    const dir = await open({ directory: true, multiple: false, title: "Open repository" });
    if (!dir) return;
    setBusy(true);
    try {
      await openRepo(dir);
    } catch (e) {
      setError(toAppError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.screen}>
      <div className={s.header}>
        <span className={s.headerIcon}>
          <GitBranch size={16} aria-hidden />
        </span>
        <span className={s.title}>t4 git ui</span>
        <span className={s.version}>{pkg.version}</span>
      </div>
      {error && (
        <Banner kind="danger">
          {ERROR_TITLE[error.kind] ?? "Couldn't open repository"} — {error.message}
        </Banner>
      )}
      <div className={s.center}>
        <div className={s.card}>
          <span className={s.label}>Start</span>
          <button type="button" className={s.action} onClick={() => void pick()} disabled={busy}>
            <span className={s.actionIcon}>{busy ? <Spinner label="Opening repository" /> : <Folder size={18} aria-hidden />}</span>
            <span className={s.actionText}>
              <span className={s.actionTitle}>Open repository…</span>
              <span className={s.actionHint}>Pick a folder containing a .git</span>
            </span>
          </button>
          <span className={s.hint}>Recent repositories, Clone and Initialize arrive in M5</span>
        </div>
      </div>
      <StatusBar
        left={
          gitVersion && (
            <StatusItem>
              <CircleCheck size={12} aria-hidden />
              git {gitVersion.replace(/^git version\s*/i, "")}
            </StatusItem>
          )
        }
      />
    </div>
  );
}
