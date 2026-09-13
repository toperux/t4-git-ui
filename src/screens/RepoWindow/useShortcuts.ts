// Window-level shortcuts of the repo window (style guide §Keyboard hints). Ignored while the focus
// is in a text field or a dialog is open — those own their own keys. Ctrl+` is the exception: it has
// no meaning in a field, and the dock prompt (the field most likely to have focus) lives in the dock
// it collapses; the tab and window keys (Ctrl+Tab, Ctrl+W, Ctrl+T, Ctrl+Shift+N, Ctrl+Q, Ctrl+1..9)
// are the same case.
import { useEffect } from "react";
import { useDialogStore } from "../../store/dialogStore";
import { selectRunning, useOpsStore } from "../../store/opsStore";
import { useTabsStore } from "../../store/tabsStore";
import { closeTab, detachTab, fetchDefault, pickAndOpenRepo, quitApp, refreshAll } from "./actions";

/** Ctrl+Tab / Ctrl+Shift+Tab: the next (or previous) tab, wrapping. */
function cycleTab(back: boolean) {
  const { tabs, active } = useTabsStore.getState();
  if (tabs.length < 2) return;
  const i = tabs.findIndex((t) => t.id === active);
  const next = tabs[(i + (back ? -1 : 1) + tabs.length) % tabs.length];
  useTabsStore.getState().activate(next.id);
}

function inTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function useShortcuts() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || useDialogStore.getState().dialog) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && !e.shiftKey && e.key === "`") {
        e.preventDefault();
        useOpsStore.getState().setOpen(!useOpsStore.getState().open);
        return;
      }
      // The tab keys work in a text field too: none of them means anything to one, and a commit
      // message under the cursor is exactly when Ctrl+W is reached for.
      if (ctrl && e.key === "Tab") {
        e.preventDefault();
        cycleTab(e.shiftKey);
        return;
      }
      if (ctrl && e.key.toLowerCase() === "w") {
        e.preventDefault();
        closeTab();
        return;
      }
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        void pickAndOpenRepo();
        return;
      }
      if (ctrl && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        detachTab();
        return;
      }
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === "q") {
        e.preventDefault();
        quitApp();
        return;
      }
      if (ctrl && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const tab = useTabsStore.getState().tabs[Number(e.key) - 1];
        if (tab) useTabsStore.getState().activate(tab.id);
        return;
      }
      if (inTextField(e.target)) return;
      const open = useDialogStore.getState().open;
      const busy = selectRunning(useOpsStore.getState());
      const key = e.key.toLowerCase();

      if (e.key === "F5" && !ctrl) {
        e.preventDefault();
        refreshAll();
      } else if (ctrl && e.key === "F5") {
        e.preventDefault();
        if (!busy) void fetchDefault();
      } else if (ctrl && e.shiftKey && key === "u") {
        e.preventDefault();
        if (!busy) open({ kind: "push" });
      } else if (ctrl && e.shiftKey && key === "l") {
        e.preventDefault();
        if (!busy) open({ kind: "pull" });
      } else if (ctrl && e.shiftKey && key === "s") {
        e.preventDefault();
        open({ kind: "stashes" });
      } else if (ctrl && e.shiftKey && key === "r") {
        e.preventDefault();
        if (!busy) open({ kind: "runCommand" });
      } else if (ctrl && !e.shiftKey && key === "b") {
        e.preventDefault();
        if (!busy) open({ kind: "createBranch" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
