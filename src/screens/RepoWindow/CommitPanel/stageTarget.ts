import type { StatusEntry } from "../../../api/types";
import type { ListId } from "../../../store/commitStore";

export interface StageTarget {
  /** The paths the action runs on. */
  target: string[];
  /** How many of the asked-for paths it left behind. */
  skipped: number;
  /** What the control's `title` says about them — `undefined` when it left nothing behind. */
  note?: string;
}

/**
 * What a stage / unstage action acts on, and what its tooltip says about whatever it leaves behind.
 * The header buttons, a folder row's action, the context menu and the keyboard all word it the same
 * because they all come through here.
 *
 * Staging a conflicted file whole is "mark resolved" (`index.add_path` drops the stages), which is
 * how a resolved file leaves the list — one at a time, on purpose. So a `bulk` action (a whole list,
 * a whole folder) skips conflicts: one click would otherwise resolve every conflict with the markers
 * still in the files. Anywhere else a lone path is the row's own action and stages, while two or more
 * are a group and skip. Unstaging never filters: it has always taken whatever it was given.
 *
 * `paths` is intersected with `entries` because the two stores are a render apart: `useCommitSync`
 * prunes the selection in an effect, so a header runs once with fresh entries and a stale selection.
 * The one / many count is of what was *asked* for, not of what survived that intersection: a stale
 * two-path selection is still a group, and must not degrade into the lone row's "mark resolved".
 *
 * `conflicted` is the caller's own set where it has one — a folder row asks per row per render.
 *
 * `where` names what was refused when nothing at all survives, for the message that replaces the skip
 * count — a selection or a folder can be conflicted through and through while the list around it is
 * full of stageable files.
 */
export function stageTarget(list: ListId, entries: StatusEntry[], paths: string[], opts: { bulk?: boolean; where?: string; conflicted?: Set<string> } = {}): StageTarget {
  const inList = new Set(entries.map((e) => e.path));
  const chosen = paths.filter((p) => inList.has(p));
  const conflicted = opts.conflicted ?? new Set(entries.filter((e) => e.conflicted).map((e) => e.path));
  const filter = list === "unstaged" && (opts.bulk || paths.length > 1);
  const target = filter ? chosen.filter((p) => !conflicted.has(p)) : chosen;
  const skipped = chosen.length - target.length;
  const note =
    skipped === 0 || opts.where === undefined
      ? undefined
      : target.length === 0
        ? `Every file ${opts.where} is conflicted — a conflict is staged on its own, once resolved`
        : `Conflicted files are staged one by one, once resolved (${skipped} skipped)`;
  return { target, skipped, note };
}
