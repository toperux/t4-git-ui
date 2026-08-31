import { useCallback, useEffect, useState } from "react";
import { onLogProgress, onOpEvent, onRepoChanged } from "./api/events";
import { probeGit, toAppError } from "./api/ipc";
import { Spinner } from "./components/ui/Spinner/Spinner";
import { GitMissingScreen } from "./screens/GitMissingScreen/GitMissingScreen";
import { RepoWindow } from "./screens/RepoWindow/RepoWindow";
import { StartScreen } from "./screens/StartScreen/StartScreen";
import { useOpsStore } from "./store/opsStore";
import { useRepoStore } from "./store/repoStore";
import { useStatusStore } from "./store/statusStore";

/** localStorage key for the last opened repository path (the store plugin replaces this in M5). */
const LAST_REPO_KEY = "lastRepo";

type Phase = { kind: "probing" } | { kind: "gitMissing"; message: string } | { kind: "ready" };

export default function App() {
  const [phase, setPhase] = useState<Phase>({ kind: "probing" });
  const hasRepo = useRepoStore((st) => st.repo !== null);

  const probe = useCallback(async () => {
    setPhase({ kind: "probing" });
    try {
      useRepoStore.getState().setGitVersion(await probeGit());
    } catch (e) {
      setPhase({ kind: "gitMissing", message: toAppError(e).message });
      return;
    }
    // Reopen the last repository; any failure just lands on the start screen.
    const last = localStorage.getItem(LAST_REPO_KEY);
    if (last) {
      try {
        await useRepoStore.getState().openRepo(last);
      } catch {
        localStorage.removeItem(LAST_REPO_KEY);
      }
    }
    setPhase({ kind: "ready" });
  }, []);

  useEffect(() => {
    void probe();
  }, [probe]);

  useEffect(() => {
    const unlisten = [
      onLogProgress((p) => useRepoStore.getState().onProgress(p)),
      onRepoChanged((p) => useStatusStore.getState().onChanged(p)),
      onOpEvent((e) => useOpsStore.getState().onEvent(e)),
    ];
    const unsubscribe = useRepoStore.subscribe((st, prev) => {
      if (st.repo === prev.repo) return;
      if (st.repo) localStorage.setItem(LAST_REPO_KEY, st.repo.path);
      else localStorage.removeItem(LAST_REPO_KEY);
    });
    return () => {
      unlisten.forEach((fn) => fn());
      unsubscribe();
    };
  }, []);

  if (phase.kind === "gitMissing") return <GitMissingScreen message={phase.message} onRetry={() => void probe()} />;
  if (phase.kind === "probing") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <Spinner label="Starting" />
      </div>
    );
  }
  return hasRepo ? <RepoWindow /> : <StartScreen />;
}
