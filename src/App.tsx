import { open as openFile } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { onLogProgress, onOpEvent, onRepoChanged } from "./api/events";
import { probeGit, setGitPath, toAppError } from "./api/ipc";
import { BusyOverlay } from "./components/ui/BusyOverlay/BusyOverlay";
import { Spinner } from "./components/ui/Spinner/Spinner";
import { kvGet, kvSet } from "./lib/kv";
import { keepsNativeMenu } from "./lib/nativeMenu";
import { GitMissingScreen } from "./screens/GitMissingScreen/GitMissingScreen";
import { closeRepo } from "./screens/RepoWindow/actions";
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
  const opening = useRepoStore((st) => st.opening);

  const probe = useCallback(async () => {
    setPhase({ kind: "probing" });
    try {
      // A git executable chosen with "Locate git…" earlier; one that no longer answers falls back to PATH.
      const saved = await kvGet<string>("gitPath");
      if (saved) await setGitPath(saved).catch(() => undefined);
      useRepoStore.getState().setGitVersion(await probeGit());
    } catch (e) {
      setPhase({ kind: "gitMissing", message: toAppError(e).message });
      return;
    }
    // Reopen the repository that was open at last exit; any failure just lands on the start screen.
    const recents = useRecentsStore.getState();
    try {
      await recents.load();
      const last = useRecentsStore.getState().lastOpen;
      if (last) await useRepoStore.getState().openRepo(last);
    } catch {
      recents.setLastOpen(null);
    }
    setPhase({ kind: "ready" });
  }, []);

  // "Locate git…": a picked executable is tried before it is kept.
  const locate = useCallback(async () => {
    const file = await openFile({ multiple: false, directory: false, title: "Locate the git executable" }).catch(() => null);
    if (!file) return;
    setPhase({ kind: "probing" });
    try {
      await setGitPath(file);
    } catch (e) {
      setPhase({ kind: "gitMissing", message: toAppError(e).message });
      return;
    }
    await kvSet("gitPath", file).catch((e: unknown) => console.warn("kv: could not persist \"gitPath\"", e));
    await probe();
  }, [probe]);

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
      if (!(e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === "w") || !useRepoStore.getState().repo) return;
      e.preventDefault();
      closeRepo();
    }
    // Runs after the app's own context menus (they preventDefault on the way up); see keepsNativeMenu.
    function onContextMenu(e: MouseEvent) {
      const sel = window.getSelection();
      if (!keepsNativeMenu(e.target, !!sel && !sel.isCollapsed)) e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("contextmenu", onContextMenu);
    return () => {
      unlisten.forEach((fn) => fn());
      unsubscribe();
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, []);

  if (phase.kind === "gitMissing") return <GitMissingScreen message={phase.message} onRetry={() => void probe()} onLocate={() => void locate()} />;
  return (
    <>
      {phase.kind === "probing" ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
          <Spinner label="Starting" />
        </div>
      ) : hasRepo ? (
        <RepoWindow />
      ) : (
        <StartScreen />
      )}
      {/* One overlay covers every path into `openRepo`: the start screen (recents, Open, a finished
          clone, init) and switching repositories from the toolbar menu. */}
      {opening && <BusyOverlay label={`Opening ${opening}…`} />}
    </>
  );
}
