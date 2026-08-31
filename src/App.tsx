import { useCallback, useEffect, useState } from "react";
import { onLogProgress, onOpEvent, onRepoChanged } from "./api/events";
import { probeGit, toAppError } from "./api/ipc";
import { Spinner } from "./components/ui/Spinner/Spinner";
import { GitMissingScreen } from "./screens/GitMissingScreen/GitMissingScreen";
import { RepoWindow } from "./screens/RepoWindow/RepoWindow";
import { StartScreen } from "./screens/StartScreen/StartScreen";
import { useOpsStore } from "./store/opsStore";
import { useRecentsStore } from "./store/recentsStore";
import { useRepoStore } from "./store/repoStore";
import { useStatusStore } from "./store/statusStore";

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
    // Reopen the repository that was open at last exit; any failure just lands on the start screen.
    const recents = useRecentsStore.getState();
    await recents.load();
    const last = useRecentsStore.getState().lastOpen;
    if (last) {
      try {
        await useRepoStore.getState().openRepo(last);
      } catch {
        recents.setLastOpen(null);
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
    // Every successful open lands in recents; `lastOpen` tracks what to reopen next start.
    const unsubscribe = useRepoStore.subscribe((st, prev) => {
      if (st.repo === prev.repo) return;
      const recents = useRecentsStore.getState();
      if (st.repo) {
        recents.touch(st.repo.path, st.repo.name);
        recents.setLastOpen(st.repo.path);
      } else {
        recents.setLastOpen(null);
      }
    });
    // Ctrl+Shift+W closes the repository and returns to the start screen.
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === "w" && useRepoStore.getState().repo) {
        e.preventDefault();
        void useRepoStore.getState().closeRepo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      unlisten.forEach((fn) => fn());
      unsubscribe();
      window.removeEventListener("keydown", onKey);
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
