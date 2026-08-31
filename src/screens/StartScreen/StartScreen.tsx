import { homeDir } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { CircleCheck, Cloud, Folder, GitBranch, Pin, Plus, Search, Settings } from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { initRepo } from "../../api/appIpc";
import { toAppError } from "../../api/ipc";
import type { AppError } from "../../api/types";
import { EmptyState } from "../../components/ui/EmptyState/EmptyState";
import { IconButton } from "../../components/ui/IconButton/IconButton";
import { Input } from "../../components/ui/Input/Input";
import { Spinner } from "../../components/ui/Spinner/Spinner";
import { StatusBar, StatusItem } from "../../components/ui/StatusBar/StatusBar";
import { ToastStack } from "../../components/ui/Toast/Toast";
import { parentDir } from "../../lib/cloneUrl";
import { cx } from "../../lib/cx";
import { relativeDate } from "../../lib/relativeDate";
import { filterRecents, useRecentsStore } from "../../store/recentsStore";
import { useRepoStore } from "../../store/repoStore";
import { toastError, useToastStore } from "../../store/toastStore";
import pkg from "../../../package.json";
import { CloneDialog } from "./CloneDialog";
import s from "./StartScreen.module.css";

const ERROR_TITLE: Record<string, string> = {
  notARepo: "Not a git repository",
  gitNotFound: "Git executable not found",
  io: "Couldn't read the folder",
};

const openTitle = (err: AppError) => ERROR_TITLE[err.kind] ?? "Couldn't open repository";

export function StartScreen() {
  const openRepo = useRepoStore((st) => st.openRepo);
  const gitVersion = useRepoStore((st) => st.gitVersion);
  const recents = useRecentsStore((st) => st.recents);
  const lastCloneDir = useRecentsStore((st) => st.lastCloneDir);
  const { remove, togglePin, setLastCloneDir } = useRecentsStore.getState();

  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [clone, setClone] = useState<{ parent: string } | null>(null);

  const visible = useMemo(() => filterRecents(recents, filter), [recents, filter]);
  const sel = Math.min(selected, Math.max(visible.length - 1, 0));

  async function openPath(path: string, fromRecents: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      await openRepo(path);
    } catch (e) {
      const err = toAppError(e);
      if (!fromRecents) {
        toastError(err, openTitle(err));
      } else {
        const push = useToastStore.getState().push;
        const id = push({
          kind: "error",
          title: openTitle(err),
          detail: err.message,
          action: {
            label: "Remove from list",
            onClick: () => {
              remove(path);
              useToastStore.getState().dismiss(id);
            },
          },
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function pick() {
    const dir = await open({ directory: true, multiple: false, title: "Open repository" });
    if (dir) await openPath(dir, false);
  }

  async function init() {
    const dir = await open({ directory: true, multiple: false, title: "Initialize repository in folder" });
    if (!dir || busy) return;
    setBusy(true);
    try {
      await initRepo(dir);
      await openRepo(dir);
    } catch (e) {
      const err = toAppError(e);
      if (err.kind !== "refused") {
        toastError(err, "Couldn't initialize repository");
      } else {
        // `git init` refused: the folder already holds a repository — just open it.
        try {
          await openRepo(dir);
          useToastStore.getState().push({ kind: "info", title: "Already a repository", detail: dir });
        } catch (e2) {
          const err2 = toAppError(e2);
          toastError(err2, openTitle(err2));
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function startClone() {
    if (clone) return;
    let parent = lastCloneDir ?? (recents[0] ? parentDir(recents[0].path) : null);
    if (!parent) parent = await homeDir().catch(() => "");
    setClone({ parent });
  }

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (!e.ctrlKey || e.altKey || clone) return;
      const k = e.key.toLowerCase();
      if (k === "o" && !e.shiftKey) void pick();
      else if (k === "o" && e.shiftKey) void startClone();
      else if (k === "n" && !e.shiftKey) void init();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /** Shared by the filter input and the listbox: ↑/↓ move, Enter opens, Delete removes. */
  function onListKey(e: KeyboardEvent) {
    if (visible.length === 0) return;
    const row = visible[sel];
    switch (e.key) {
      case "ArrowDown":
        setSelected(Math.min(sel + 1, visible.length - 1));
        break;
      case "ArrowUp":
        setSelected(Math.max(sel - 1, 0));
        break;
      case "Home":
        setSelected(0);
        break;
      case "End":
        setSelected(visible.length - 1);
        break;
      case "Enter":
        void openPath(row.path, true);
        break;
      case "Delete":
        remove(row.path);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  const version = gitVersion?.replace(/^git version\s*/i, "");
  const now = Date.now();

  return (
    <div className={s.screen}>
      <div className={s.header}>
        <span className={s.headerIcon}>
          <GitBranch size={16} aria-hidden />
        </span>
        <span className={s.title}>t4 git ui</span>
        <span className={s.version}>{pkg.version}</span>
        <span className={s.grow} />
        <IconButton label="Settings" title="Settings (coming in M6)" disabled>
          <Settings size={16} aria-hidden />
        </IconButton>
      </div>

      <div className={s.center}>
        <div className={s.grid}>
          <div className={s.column}>
            <div className={s.columnHead}>
              <span className={s.label}>Recent</span>
              <span className={s.grow} />
              <Input
                className={s.filter}
                icon={<Search size={14} aria-hidden />}
                placeholder="Filter repositories"
                aria-label="Filter repositories"
                aria-controls="recent-list"
                value={filter}
                autoFocus
                onChange={(e) => {
                  setFilter(e.target.value);
                  setSelected(0);
                }}
                onKeyDown={onListKey}
              />
            </div>
            <div
              id="recent-list"
              className={s.list}
              role="listbox"
              aria-label="Recent repositories"
              tabIndex={0}
              aria-activedescendant={visible.length ? `recent-${sel}` : undefined}
              onKeyDown={onListKey}
            >
              {visible.length === 0 ? (
                <EmptyState
                  icon={<Folder size={24} aria-hidden />}
                  title={recents.length === 0 ? "No recent repositories" : "No matching repositories"}
                  hint={recents.length === 0 ? "Open or clone one to get started" : "Try a different filter"}
                />
              ) : (
                visible.map((r, i) => (
                  <div
                    key={r.path}
                    id={`recent-${i}`}
                    role="option"
                    aria-selected={i === sel}
                    className={cx(s.row, i === sel && s.selected)}
                    title={r.path}
                    onMouseDown={() => setSelected(i)}
                    onClick={() => void openPath(r.path, true)}
                  >
                    <span className={s.rowIcon}>
                      <Folder size={16} aria-hidden />
                    </span>
                    <span className={s.rowText}>
                      <span className={s.rowName}>{r.name}</span>
                      <span className={s.rowPath}>{r.path}</span>
                    </span>
                    <span className={s.rowWhen}>{relativeDate(r.lastOpened / 1000, now)}</span>
                    <IconButton
                      label={r.pinned ? "Unpin" : "Pin to top"}
                      on={r.pinned}
                      className={s.pin}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePin(r.path);
                      }}
                    >
                      <Pin size={13} aria-hidden />
                    </IconButton>
                  </div>
                ))
              )}
            </div>
            <span className={s.hint}>
              Enter opens · Del removes from list · <Pin size={11} aria-hidden /> keeps at top
            </span>
          </div>

          <div className={s.column}>
            <span className={s.label}>Start</span>
            <ActionCard icon={<Folder size={18} aria-hidden />} title="Open repository…" hint="Pick a folder containing a .git" kbd="Ctrl+O" disabled={busy} onClick={() => void pick()} />
            <ActionCard icon={<Cloud size={18} aria-hidden />} title="Clone…" hint="From a URL, with progress" kbd="Ctrl+Shift+O" disabled={busy} onClick={() => void startClone()} />
            <ActionCard icon={<Plus size={18} aria-hidden />} title="Initialize…" hint="Create a new repository in a folder" kbd="Ctrl+N" disabled={busy} onClick={() => void init()} />
          </div>
        </div>
      </div>

      <StatusBar
        left={
          busy ? (
            <StatusItem>
              <Spinner size="sm" label="Opening repository" />
              Opening…
            </StatusItem>
          ) : (
            version && (
              <StatusItem>
                <CircleCheck size={12} aria-hidden />
                git {version}
              </StatusItem>
            )
          )
        }
        right={<StatusItem>{recents.length} recent</StatusItem>}
      />

      {clone && (
        <CloneDialog
          defaultParent={clone.parent}
          onClose={() => setClone(null)}
          onCloned={(repo, parent) => {
            setLastCloneDir(parent);
            setClone(null);
            void openPath(repo.path, false);
          }}
        />
      )}
      <ToastStack />
    </div>
  );
}

function ActionCard({ icon, title, hint, kbd, disabled, onClick }: { icon: ReactNode; title: string; hint: string; kbd: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" className={s.action} onClick={onClick} disabled={disabled}>
      <span className={s.actionIcon}>{icon}</span>
      <span className={s.actionText}>
        <span className={s.actionTitle}>{title}</span>
        <span className={s.actionHint}>{hint}</span>
      </span>
      <span className={s.kbd}>{kbd}</span>
    </button>
  );
}
