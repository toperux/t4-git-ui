import { save } from "@tauri-apps/plugin-dialog";
import { Copy, Download, ExternalLink, FolderOpen, ListTree } from "lucide-react";
import * as ipc from "../../../api/ipc";
import { toAppError } from "../../../api/ipc";
import { ContextMenu, MenuItem, MenuSeparator } from "../../../components/ui/Menu/Menu";
import { baseName } from "../../../lib/paths";
import { treeTargetOf, useDiffStore } from "../../../store/diffStore";
import { toastError, useToastStore } from "../../../store/toastStore";
import { copyText } from "../actions";

/** Where to put the menu and the path it was opened over — a snapshot: the list can move under it. */
export interface RowMenuState {
  at: { x: number; y: number };
  path: string;
}

/**
 * Row actions shared by both tabs of the file list: the path, the file itself, and the way over to
 * the other tab. Everything here reads — nothing touches the repository — so none of it is gated on
 * a running operation.
 */
export function FileRowMenu({ menu, onClose }: { menu: RowMenuState | null; onClose: () => void }) {
  const repoId = useDiffStore((st) => st.repoId);
  const target = useDiffStore((st) => st.target);
  const tab = useDiffStore((st) => st.tab);
  const setTab = useDiffStore((st) => st.setTab);
  const selectPath = useDiffStore((st) => st.selectPath);
  const changed = useDiffStore((st) => st.files.some((f) => f.path === menu?.path));
  const deleted = useDiffStore((st) => st.files.find((f) => f.path === menu?.path)?.status === "deleted");
  if (!menu) return null;

  const path = menu.path;
  const tree = treeTargetOf(target);
  const workingTree = tree?.kind === "workingTree";
  // A commit's file has no working-tree path: Open writes a temp copy of the blob instead, and
  // Reveal has nothing to point the file manager at. A file this commit deleted has no blob either.
  const commit = tree?.kind === "commit" ? tree : undefined;
  const gone = tab === "changes" && deleted;

  /** Every item closes the menu first. */
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  const open = (reveal: boolean) => {
    if (!repoId) return;
    void ipc
      .openPath(repoId, path, reveal, reveal ? undefined : commit)
      .catch((e: unknown) => toastError(toAppError(e), reveal ? "Couldn't reveal the file" : "Couldn't open the file"));
  };

  const saveAs = async () => {
    if (!repoId || !tree) return;
    try {
      const dest = await save({ defaultPath: baseName(path), title: `Save ${baseName(path)}` });
      if (!dest) return; // cancelled
      await ipc.saveFileAs(repoId, tree, path, dest);
      useToastStore.getState().push({ kind: "success", title: `Saved ${baseName(path)}`, detail: dest });
    } catch (e) {
      toastError(toAppError(e), "Couldn't save the file");
    }
  };

  const gonePath = "The file is not in the working tree";
  return (
    <ContextMenu at={menu.at} onClose={onClose} label="File actions">
      <MenuItem icon={<Copy size={16} aria-hidden />} onClick={run(() => copyText(path, "path"))}>
        Copy path
      </MenuItem>
      <MenuItem icon={<ExternalLink size={16} aria-hidden />} disabled={gone} title={gone ? gonePath : undefined} onClick={run(() => open(false))}>
        Open
      </MenuItem>
      {workingTree && (
        <MenuItem icon={<FolderOpen size={16} aria-hidden />} disabled={gone} title={gone ? gonePath : undefined} onClick={run(() => open(true))}>
          Reveal in folder
        </MenuItem>
      )}
      <MenuItem icon={<Download size={16} aria-hidden />} disabled={gone} title={gone ? gonePath : undefined} onClick={run(() => void saveAs())}>
        Save as…
      </MenuItem>
      {/* Only worth an item from the Files tab, and only for a file this commit actually changed. */}
      {tab === "files" && changed && (
        <>
          <MenuSeparator />
          <MenuItem
            icon={<ListTree size={16} aria-hidden />}
            onClick={run(() => {
              setTab("changes");
              selectPath(path);
            })}
          >
            Show in Changes
          </MenuItem>
        </>
      )}
    </ContextMenu>
  );
}
