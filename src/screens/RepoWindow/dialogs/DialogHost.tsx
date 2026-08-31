// Renders the one open dialog from `dialogStore`.
import { useDialogStore } from "../../../store/dialogStore";
import { FetchDialog, MergeDialog, PullDialog, PushDialog, RebaseDialog } from "./OpsDialogs";
import { CheckoutDialog, CreateBranchDialog, CreateTagDialog, DeleteBranchDialog, DeleteRemoteBranchDialog, DeleteTagDialog, RenameBranchDialog } from "./RefDialogs";
import { StashDialog, StashPushDialog } from "./StashDialogs";

export function DialogHost() {
  const dialog = useDialogStore((st) => st.dialog);
  const close = useDialogStore((st) => st.close);
  if (!dialog) return null;
  // Remount on kind change so every dialog starts from fresh state.
  switch (dialog.kind) {
    case "push":
      return <PushDialog onClose={close} branch={dialog.branch} />;
    case "pull":
      return <PullDialog onClose={close} />;
    case "fetch":
      return <FetchDialog onClose={close} />;
    case "merge":
      return <MergeDialog onClose={close} branch={dialog.branch} />;
    case "rebase":
      return <RebaseDialog onClose={close} onto={dialog.onto} />;
    case "createBranch":
      return <CreateBranchDialog onClose={close} startPoint={dialog.startPoint} />;
    case "renameBranch":
      return <RenameBranchDialog onClose={close} name={dialog.name} />;
    case "deleteBranch":
      return <DeleteBranchDialog onClose={close} name={dialog.name} />;
    case "deleteRemoteBranch":
      return <DeleteRemoteBranchDialog onClose={close} remote={dialog.remote} name={dialog.name} />;
    case "createTag":
      return <CreateTagDialog onClose={close} target={dialog.target} />;
    case "deleteTag":
      return <DeleteTagDialog onClose={close} name={dialog.name} />;
    case "stashPush":
      return <StashPushDialog onClose={close} />;
    case "stash":
      return <StashDialog onClose={close} index={dialog.index} message={dialog.message} />;
    case "checkout":
      return <CheckoutDialog onClose={close} />;
  }
}
