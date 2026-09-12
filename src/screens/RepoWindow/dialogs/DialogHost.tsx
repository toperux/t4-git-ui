// Renders the one open dialog from `dialogStore`.
import type { ReactNode } from "react";
import { DialogReturnFocus } from "../../../components/ui/Dialog/Dialog";
import { useDialogStore, type DialogSpec } from "../../../store/dialogStore";
import { SettingsDialog } from "../../SettingsDialog/SettingsDialog";
import { CommitDialog } from "./CommitDialog";
import { DiffDialog } from "./DiffDialog";
import { DeleteRemoteTagDialog, FetchDialog, MergeDialog, PickDialog, PullDialog, PushDialog, PushTagDialog, RebaseDialog, ResetBranchDialog, ResetDialog } from "./OpsDialogs";
import { RebaseInteractiveDialog } from "./RebaseInteractiveDialog";
import {
  CheckoutBranchDialog,
  CheckoutDialog,
  CreateBranchDialog,
  CreateTagDialog,
  DeleteBranchDialog,
  DeleteRemoteBranchDialog,
  DeleteTagDialog,
  RenameBranchDialog,
} from "./RefDialogs";
import { AddRemoteDialog, RemoveRemoteDialog, RenameRemoteDialog, SetRemoteUrlDialog } from "./RemoteDialogs";
import { RunCommandDialog } from "./RunCommandDialog";
import { StashDialog, StashPushDialog } from "./StashDialogs";

export function DialogHost() {
  const dialog = useDialogStore((st) => st.dialog);
  const returnFocus = useDialogStore((st) => st.returnFocus);
  const close = useDialogStore((st) => st.close);
  if (!dialog) return null;
  // The opener is kept in the store: a dialog opened from a menu item can't read it off the document.
  // Keyed by kind so every dialog starts from fresh state: `cherryPick` and `revert` share one
  // component, and without this the switch would keep whatever the other one was left holding.
  return (
    <DialogReturnFocus.Provider key={dialog.kind} value={returnFocus}>
      {renderDialog(dialog, close)}
    </DialogReturnFocus.Provider>
  );
}

function renderDialog(dialog: DialogSpec, close: () => void): ReactNode {
  switch (dialog.kind) {
    case "push":
      return <PushDialog onClose={close} branch={dialog.branch} />;
    case "pull":
      return <PullDialog onClose={close} />;
    case "fetch":
      return <FetchDialog onClose={close} />;
    case "runCommand":
      return <RunCommandDialog onClose={close} />;
    case "settings":
      return <SettingsDialog onClose={close} />;
    case "commit":
      return <CommitDialog onClose={close} />;
    case "diff":
      return <DiffDialog onClose={close} />;
    case "merge":
      return <MergeDialog onClose={close} branch={dialog.branch} />;
    case "rebase":
      return <RebaseDialog onClose={close} onto={dialog.onto} />;
    case "rebaseInteractive":
      return <RebaseInteractiveDialog onClose={close} base={dialog.base} ontoLabel={dialog.ontoLabel} />;
    case "cherryPick":
    case "revert":
      return <PickDialog onClose={close} mode={dialog.kind} oid={dialog.oid} short={dialog.short} summary={dialog.summary} parents={dialog.parents} />;
    case "reset":
      return <ResetDialog onClose={close} target={dialog.target} />;
    case "resetBranch":
      return <ResetBranchDialog onClose={close} branch={dialog.branch} target={dialog.target} />;
    case "checkoutBranch":
      return <CheckoutBranchDialog onClose={close} branches={dialog.branches} />;
    case "createBranch":
      return <CreateBranchDialog onClose={close} startPoint={dialog.startPoint} />;
    case "renameBranch":
      return <RenameBranchDialog onClose={close} name={dialog.name} />;
    case "deleteBranch":
      return <DeleteBranchDialog onClose={close} name={dialog.name} />;
    case "deleteRemoteBranch":
      return <DeleteRemoteBranchDialog onClose={close} remote={dialog.remote} name={dialog.name} />;
    case "addRemote":
      return <AddRemoteDialog onClose={close} />;
    case "renameRemote":
      return <RenameRemoteDialog onClose={close} name={dialog.name} />;
    case "setRemoteUrl":
      return <SetRemoteUrlDialog onClose={close} name={dialog.name} url={dialog.url} />;
    case "removeRemote":
      return <RemoveRemoteDialog onClose={close} name={dialog.name} />;
    case "createTag":
      return <CreateTagDialog onClose={close} target={dialog.target} />;
    case "deleteTag":
      return <DeleteTagDialog onClose={close} name={dialog.name} />;
    case "pushTag":
      return <PushTagDialog onClose={close} name={dialog.name} />;
    case "deleteRemoteTag":
      return <DeleteRemoteTagDialog onClose={close} name={dialog.name} remote={dialog.remote} />;
    case "stashPush":
      return <StashPushDialog onClose={close} />;
    case "stash":
      return <StashDialog onClose={close} index={dialog.index} message={dialog.message} />;
    case "checkout":
      return <CheckoutDialog onClose={close} />;
  }
}
