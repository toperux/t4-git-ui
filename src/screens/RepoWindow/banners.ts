// Which banners sit above the grid (States artboard): detached HEAD, merge / rebase in progress, conflicts.
import type { Branch, RefsSnapshot, WorkdirStatus } from "../../api/types";

export type BannerAction = "checkoutDefault" | "createBranch" | "mergeAbort" | "commitMerge" | "rebaseAbort" | "rebaseContinue" | "openCommitPanel";

export interface BannerButton {
  label: string;
  action: BannerAction;
  primary?: boolean;
}

export interface BannerSpec {
  id: "detached" | "merge" | "rebase" | "conflicts";
  kind: "warning" | "danger";
  text: string;
  buttons: BannerButton[];
}

/** `main`, else `master`, else the first local branch. */
export function defaultBranch(local: Branch[]): string | null {
  return local.find((b) => b.name === "main")?.name ?? local.find((b) => b.name === "master")?.name ?? local[0]?.name ?? null;
}

export function computeBanners(refs: RefsSnapshot | null, status: WorkdirStatus | null): BannerSpec[] {
  const out: BannerSpec[] = [];
  if (!refs) return out;
  const { head, state } = refs;
  if (head.detached && head.oid && state === "clean") {
    const def = defaultBranch(refs.local.filter((b) => !b.isHead));
    out.push({
      id: "detached",
      kind: "warning",
      text: `Detached HEAD at ${head.oid.slice(0, 7)} — new commits won’t belong to any branch`,
      buttons: [...(def ? [{ label: `Checkout ${def}`, action: "checkoutDefault" as const }] : []), { label: "Create branch…", action: "createBranch", primary: true }],
    });
  }
  if (state === "merge") {
    out.push({
      id: "merge",
      kind: "warning",
      text: "Merge in progress — resolve conflicts, then commit to finish",
      buttons: [
        { label: "Abort", action: "mergeAbort" },
        { label: "Commit merge", action: "commitMerge", primary: true },
      ],
    });
  }
  if (state === "rebase") {
    out.push({
      id: "rebase",
      kind: "warning",
      text: "Rebase in progress — resolve conflicts and stage them, then continue",
      buttons: [
        { label: "Abort", action: "rebaseAbort" },
        { label: "Continue", action: "rebaseContinue", primary: true },
      ],
    });
  }
  const n = status?.conflicted ?? 0;
  if (n > 0) {
    out.push({
      id: "conflicts",
      kind: "danger",
      text: `${n} file${n === 1 ? " has" : "s have"} conflicts — resolve, then stage ${n === 1 ? "it" : "them"}`,
      buttons: [{ label: "Open commit panel", action: "openCommitPanel" }],
    });
  }
  return out;
}
