import { open as openFile } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { onLogProgress, onOpEvent, onRepoChanged, onSettingsChanged, onTabSpawnFailed, onUpdateChecked } from "./api/events";
import { lastUpdateCheck, probeGit, setCommitDrafts, setGitPath, setLayout, spawnWindow, takeLayout, takePending, toAppError, type TakenLayout } from "./api/ipc";
import { BusyOverlay } from "./components/ui/BusyOverlay/BusyOverlay";
import { Spinner } from "./components/ui/Spinner/Spinner";
import { isMainWindow } from "./lib/appWindow";
import { kvGet, kvSet } from "./lib/kv";
import { keepsNativeMenu } from "./lib/nativeMenu";
import { useWindowTitle } from "./lib/windowTitle";
import { GitMissingScreen } from "./screens/GitMissingScreen/GitMissingScreen";
import { RepoWindow } from "./screens/RepoWindow/RepoWindow";
import { listenTabDrags } from "./screens/RepoWindow/TabStrip";
import { StartScreen } from "./screens/StartScreen/StartScreen";
import { useCmdHistoryStore } from "./store/cmdHistoryStore";
import { useCommitStore } from "./store/commitStore";
import { useOpsStore } from "./store/opsStore";
import { useRecentsStore } from "./store/recentsStore";
import { useRepoStore } from "./store/repoStore";
import { useSettingsStore } from "./store/settingsStore";
import { useStatusStore } from "./store/statusStore";
import { draftRepos, useTabsStore } from "./store/tabsStore";
import { toastError, useToastStore } from "./store/toastStore";
import { useUpdateStore } from "./store/updateStore";

type Phase = { kind: "probing" } | { kind: "gitMissing"; message: string } | { kind: "ready" };

/**
 * Set while `restoreTabs` runs: the tab subscription holds its `set_layout` reports, so the entry the
 * backend already has for this window (seeded at `take_layout` in `main`, made by `spawn` in any
 * other) is not shrunk to the tabs opened so far. The one-shot report after `restoreTabs` sends the
 * end state. A tab dropped on a window still restoring is in no entry until that report; rare, and
 * accepted.
 */
let restoring = false;

/**
 * What this window opens at launch: the tabs it was created with (a torn-off tab, or one of the
 * windows a layout is being restored into), else — in the main window — the layout the last exit
 * left, which also spawns the other windows. With neither, the repository `lastOpen` names, which is
 * what a first launch after the upgrade to tabs has.
 *
 * If the last launch died while it restored (`crashed`, the backend's crash-loop breaker), nothing
 * opens: not the layout, which the backend has set aside, and not `lastOpen`, which would reopen the
 * crasher on the launch after this one.
 */
async function restoreTabs() {
  restoring = true;
  try {
    const tabs = useTabsStore.getState();
    const none: TakenLayout = { layouts: [], crashed: false, kept: false };
    const pending = await takePending().catch(() => null);
    const taken = pending ? { ...none, layouts: [pending] } : isMainWindow() ? await takeLayout().catch(() => none) : none;
    if (taken.crashed) {
      useRecentsStore.getState().setLastOpen(null);
      useToastStore.getState().push({
        kind: "error",
        title: "Your last session wasn't reopened",
        detail:
          "The app closed while reopening it, so it started empty this time. Your repositories are still in Recents." +
          (taken.kept ? " The saved windows are in layout.crashed.json." : ""),
      });
      return;
    }
    const layout = taken.layouts;
    if (layout.length === 0) {
      const last = useRecentsStore.getState().lastOpen;
      // Caught here, so a repository that no longer opens still gets the one-shot report after this.
      if (last) await tabs.openTab(last).catch(() => useRecentsStore.getState().setLastOpen(null));
      return;
    }
    // The first entry is this window's; every other one gets a window of its own.
    for (const other of layout.slice(1)) void spawnWindow(other).catch(() => undefined);
    // Per path: one repository that no longer opens must not cost every tab after it.
    for (const path of layout[0].tabs) {
      try {
        await tabs.openTab(path);
      } catch (e) {
        toastError(toAppError(e), "Couldn't open repository");
      }
    }
    const active = useTabsStore.getState().tabs.find((t) => t.path === layout[0].active);
    if (active) tabs.activate(active.id);
  } finally {
    restoring = false;
  }
}

export default function App() {
  useWindowTitle();
  const [phase, setPhase] = useState<Phase>({ kind: "probing" });
  const hasRepo = useRepoStore((st) => st.repo !== null);
  const opening = useRepoStore((st) => st.opening);

  const probe = useCallback(async () => {
    setPhase({ kind: "probing" });
    try {
      // A git executable chosen with "Locate git…" earlier; one that no longer answers falls back to PATH.
      const saved = await kvGet<string>("gitPath");
      if (saved) await setGitPath(saved).catch(() => undefined);
      const probed = await probeGit();
      // Below the floor every op dies on `--end-of-options`: the same screen, saying which git it found.
      if (probed.tooOld) {
        setPhase({ kind: "gitMissing", message: `Found ${probed.version}, which is older than the required git 2.24.` });
        return;
      }
      useRepoStore.getState().setGitVersion(probed.version);
    } catch (e) {
      setPhase({ kind: "gitMissing", message: toAppError(e).message });
      return;
    }
    void useCmdHistoryStore.getState().load();
    // Preferences seed the diff store: awaited, so a reopened repository cannot fetch its first diff
    // (panel or details pane) at the default context and leave the stored one to land afterwards.
    await useSettingsStore.getState().load();
    // Never awaited: an offline or slow GitHub must cost nothing at launch, and the store keeps its
    // own failures — a launch check that fails says so in Settings › Updates or nowhere at all.
    // One window only, or every open window prompts for the same release.
    if (useSettingsStore.getState().autoUpdateCheck && isMainWindow()) void useUpdateStore.getState().check();
    const recents = useRecentsStore.getState();
    try {
      await recents.load();
      await restoreTabs();
      // Reported once even if no tab opened: the entry `spawn` made for this window, or the one `main`
      // was seeded with at its read, has to be replaced, or a window whose repositories are gone comes
      // back every launch. Only here, once `restoreTabs` ran: the subscription waits while restoring.
      // The backend holds every write until `main` has read `layout.json`, so a report that comes
      // before that read cannot erase the saved session. `restored`: this window is back, so the
      // crash-loop breaker stops waiting for it.
      const st = useTabsStore.getState();
      const active = st.tabs.find((t) => t.id === st.active) ?? null;
      void setLayout({ tabs: st.tabs.map((t) => t.path), active: active?.path ?? "" }, true).catch(() => undefined);
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
      // An event for a tab that is not the active one only flags it: activating it refreshes.
      onLogProgress((p) => {
        useTabsStore.getState().markStale(p.repoId);
        useRepoStore.getState().onProgress(p);
      }),
      onRepoChanged((p) => {
        useTabsStore.getState().markStale(p.repoId);
        useStatusStore.getState().onChanged(p);
      }),
      onOpEvent((e) => useOpsStore.getState().onEvent(e)),
      // Another window wrote a preference: re-read it, or this one keeps a stale theme / diff default.
      onSettingsChanged(() => void useSettingsStore.getState().load()),
      // A check in any window answers for all of them: only the main window checks at launch.
      onUpdateChecked((info) => useUpdateStore.getState().learn(info)),
      // The window a tab was moved to never opened (the build fails after `spawn_window` returns):
      // take the tab back rather than lose it.
      onTabSpawnFailed((paths) => {
        useToastStore.getState().push({ kind: "error", title: "Couldn't open a new window", detail: paths.join(", ") });
        // One at a time, like `restoreTabs`: they all land in this window's one `repoStore`.
        void (async () => {
          for (const path of paths) {
            try {
              await useTabsStore.getState().openTab(path);
            } catch (e) {
              toastError(toAppError(e), "Couldn't open repository");
            }
          }
        })();
      }),
      // A tab dragged in another window hovering this one, and dropped on it. Here rather than in the
      // strip, which is not rendered with one tab or none.
      listenTabDrags(),
    ];
    // A window restored at launch, or opened later, may have missed the event: ask for the last answer.
    // ponytail: an answer landing between this reply and the listener attaching is missed; Check now covers it.
    void lastUpdateCheck()
      .then((c) => {
        if (c.checked) useUpdateStore.getState().learn(c.info);
      })
      .catch(() => undefined);
    // Every open lands in recents, and the backend keeps what this window has open so the next
    // launch can put every window back (`layout.json`).
    const unsubscribe = useTabsStore.subscribe((st, prev) => {
      if (st.tabs === prev.tabs && st.active === prev.active) return;
      const recents = useRecentsStore.getState();
      for (const t of st.tabs) if (!prev.tabs.some((p) => p.id === t.id)) recents.touch(t.path, t.name);
      const active = st.tabs.find((t) => t.id === st.active) ?? null;
      recents.setLastOpen(active?.path ?? null);
      if (!restoring) void setLayout({ tabs: st.tabs.map((t) => t.path), active: active?.path ?? "" }).catch(() => undefined);
    });
    // The backend keeps each window's drafts for Install's confirmation. Sent only when the list
    // changes: the editor's store changes on every keystroke and every diff load. The first list is
    // always sent, empty or not: a reloaded window keeps its label, and its old entry must not linger.
    let reported: string | null = null;
    const reportDrafts = () => {
      const repos = draftRepos();
      const key = repos.join("\n");
      if (key === reported) return;
      reported = key;
      void setCommitDrafts(repos).catch(() => undefined);
    };
    const unsubscribeDrafts = [useCommitStore.subscribe(reportDrafts), useTabsStore.subscribe(reportDrafts)];
    reportDrafts();
    // Runs after the app's own context menus (they preventDefault on the way up); see keepsNativeMenu.
    function onContextMenu(e: MouseEvent) {
      const sel = window.getSelection();
      if (!keepsNativeMenu(e.target, !!sel && !sel.isCollapsed)) e.preventDefault();
    }
    document.addEventListener("contextmenu", onContextMenu);
    return () => {
      unlisten.forEach((fn) => fn());
      unsubscribe();
      for (const u of unsubscribeDrafts) u();
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
