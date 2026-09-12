// The interactive-rebase todo as the dialog edits it: git generates the list, this file only
// reorders it, rewrites the command words and puts it back together in the original order.
import type { TodoCommit, TodoLine, TodoStep } from "../../../api/types";

export type Action = "pick" | "reword" | "edit" | "squash" | "fixup" | "drop";

export const ACTIONS: Action[] = ["pick", "reword", "edit", "squash", "fixup", "drop"];

/** A shown line: one pick (with the `update-ref` lines that travel with it) or one read-only merge. */
export interface Row {
  kind: "row";
  line: TodoLine;
  action: Action;
  /** The `update-ref` lines that followed the pick — "branch X points at this commit", so they move with it. */
  refs: TodoLine[];
}

/** A line the user never sees (`label` / `reset` / `noop` / comments), kept so the order is reproducible. */
export interface Hidden {
  kind: "hidden";
  line: TodoLine;
}

export type Item = Row | Hidden;

/** The word git's todo takes: a reword is a plain pick the amend follows, a squash is a fixup + amend. */
const WORD: Record<Action, string> = { pick: "pick", reword: "pick", edit: "edit", drop: "drop", squash: "fixup", fixup: "fixup" };

const isMember = (a: Action) => a === "squash" || a === "fixup";

export const isPickRow = (it: Item | undefined): it is Row => it?.kind === "row" && it.line.kind === "pick";

const isMemberAt = (items: Item[], i: number) => isPickRow(items[i]) && isMember((items[i] as Row).action);

const isDroppedAt = (items: Item[], i: number) => isPickRow(items[i]) && (items[i] as Row).action === "drop";

/**
 * The nearest pick at / above `i` that isn't dropped, `-1` when the drops reach the top of the list.
 * A `drop` is no barrier to a squash: git removes that commit and folds the member into the pick above it.
 */
function pickAbove(items: Item[], i: number): number {
  let j = i;
  while (isDroppedAt(items, j)) j--;
  return isPickRow(items[j]) ? j : -1;
}

/** The commit a pick row names (a merge row's may be missing — it is read-only either way). */
export const rowCommit = (r: Row): TodoCommit | null => (r.line.kind === "other" || r.line.kind === "updateRef" ? null : r.line.commit);

export function buildItems(lines: TodoLine[]): Item[] {
  const items: Item[] = [];
  for (const line of lines) {
    // Blanks and comments mean nothing to git (it writes one after every `update-ref`), and as
    // hidden items they would be barriers between picks that are really adjacent.
    if (line.kind === "other" && /^\s*(#|$)/.test(line.text)) continue;
    if (line.kind === "pick") items.push({ kind: "row", line, action: line.action, refs: [] });
    else if (line.kind === "merge") items.push({ kind: "row", line, action: "pick", refs: [] });
    else if (line.kind === "updateRef") {
      const last = items[items.length - 1];
      if (last?.kind === "row") last.refs.push(line);
      else items.push({ kind: "hidden", line });
    } else items.push({ kind: "hidden", line });
  }
  return items;
}

/** A pick swaps only with an adjacent pick: a merge, a `label` / `reset` or a comment is a barrier. */
export const canMoveUp = (items: Item[], i: number) => isPickRow(items[i]) && isPickRow(items[i - 1]);
export const canMoveDown = (items: Item[], i: number) => isPickRow(items[i]) && isPickRow(items[i + 1]);

/** Swaps row `i` with its neighbour in `dir`; the same array back when the move isn't allowed. */
export function moveRow(items: Item[], i: number, dir: -1 | 1): Item[] {
  if (dir === -1 ? !canMoveUp(items, i) : !canMoveDown(items, i)) return items;
  const out = items.slice();
  [out[i], out[i + dir]] = [out[i + dir], out[i]];
  return out;
}

/**
 * Indices of the head pick at / above `i` and the squash / fixup picks folded into it — head through
 * last member, contiguous, so a `drop` that falls inside the group travels with it. `toSteps` walks
 * the list by group length and emits every row of the group, so a gap would lose that `drop` line.
 * A `drop` resolves to the group it sits inside — selecting it must not take the group's message
 * box away — unless it trails past the last member, or nothing but drops sits above it, where it
 * belongs to no group at all.
 */
export function groupOf(items: Item[], i: number): number[] {
  let head = i;
  while (isMemberAt(items, head) || isDroppedAt(items, head)) {
    const above = pickAbove(items, head - 1);
    if (above < 0) break;
    head = above;
  }
  // Drops all the way up: there is no commit to fold into, so no group forms — and `canSquash`
  // refuses the member below for that same reason. Without this the two disagree, and `groupOf`
  // hands back a span headed by a row git is about to remove.
  if (isDroppedAt(items, head)) return [i];
  let last = head;
  for (let j = head + 1; isMemberAt(items, j) || isDroppedAt(items, j); j++) if (isMemberAt(items, j)) last = j;
  if (i > last) return [i];
  const out: number[] = [];
  for (let j = head; j <= last; j++) out.push(j);
  return out;
}

/** Squash / fixup need a commit above to fold into — past the drops, whose commits git removes anyway. */
export function canSquash(items: Item[], i: number): boolean {
  const above = pickAbove(items, i - 1);
  if (above < 0) return false;
  const head = items[groupOf(items, above)[0]];
  return isPickRow(head) && !isMember(head.action);
}

/** A reword, or a group with a `squash` in it, gets a message of its own (a fixup keeps the head's). */
export function needsMessage(items: Item[], group: number[]): boolean {
  const head = items[group[0]];
  // A dropped head keeps no message: the group its drop sits inside is the one that gets the textarea.
  if (!isPickRow(head) || head.action === "drop") return false;
  return head.action === "reword" || group.slice(1).some((j) => (items[j] as Row).action === "squash");
}

/** Head message, then a blank line and each `squash` member's — git's own default; fixups contribute nothing. */
export function defaultMessage(items: Item[], group: number[]): string {
  const parts: string[] = [];
  for (const [n, j] of group.entries()) {
    const row = items[j];
    if (!isPickRow(row)) continue;
    if (n > 0 && row.action !== "squash") continue;
    const msg = rowCommit(row)?.message;
    if (msg) parts.push(msg.trimEnd());
  }
  return parts.join("\n\n");
}

/** The first thing wrong with the list, `null` when it can run. `messages` are the user's edits. */
export function validate(items: Item[], messages: Record<string, string> = {}): string | null {
  if (!items.some(isPickRow)) return "Nothing to rebase";
  for (let i = 0; i < items.length; i++) {
    if (!isPickRow(items[i])) continue;
    const short = rowCommit(items[i] as Row)?.short ?? "This commit";
    if (isMemberAt(items, i)) {
      if (!canSquash(items, i)) return `${short} has no commit above it to squash into`;
      continue;
    }
    // An empty `-F` file makes git refuse the amend and the rebase stops on "execution failed".
    const group = groupOf(items, i);
    // Keyed by the group's head, which is what the dialog stores an edited message under — `i` can
    // be a `drop` sitting inside the group, whose own oid was never a key.
    if (needsMessage(items, group) && (messages[rowCommit(items[group[0]] as Row)?.oid ?? ""] ?? defaultMessage(items, group)).trim() === "") {
      return `${short} needs a message`;
    }
  }
  return null;
}

/** `<action> <oid> <subject>` — the subject is what git's "Stopped at …" line shows. */
const pickLine = (r: Row) => {
  const c = rowCommit(r);
  // `fixup -C` (an `amend!` commit) also takes that commit's message, so the flag has to go back
  // out — but only while the row is still a fixup: any other action is one the user chose instead.
  const flag = r.action === "fixup" && r.line.kind === "pick" && r.line.amend ? " -C" : "";
  return `${WORD[r.action]}${flag} ${c?.oid ?? ""} ${c?.summary ?? ""}`.trimEnd();
};

/**
 * The todo to write back. Per group: the head line, its members, the amend, **then** the group's
 * `update-ref` lines — a ref recorded before the amend would point at the commit the amend orphans.
 * `messages` holds only what the user edited; a group that needs one and has no edit gets the default.
 */
export function toSteps(items: Item[], messages: Record<string, string>, updateRefs: boolean): TodoStep[] {
  const out: TodoStep[] = [];
  const line = (text: string) => out.push({ kind: "line", text });
  for (let i = 0; i < items.length; ) {
    const it = items[i];
    if (it.kind === "hidden") {
      // A stray `update-ref` (behind no pick) still goes out while the flag is on.
      if (it.line.kind !== "updateRef" || updateRefs) line(it.line.text);
      i++;
      continue;
    }
    // A merge line is replayed as git wrote it.
    const group = it.line.kind === "merge" ? [i] : [i, ...groupOf(items, i).filter((j) => j > i)];
    const rows = group.map((j) => items[j] as Row);
    for (const r of rows) line(r.line.kind === "merge" ? r.line.text : pickLine(r));
    if (it.line.kind !== "merge" && needsMessage(items, group)) {
      const oid = rowCommit(rows[0])?.oid ?? "";
      out.push({ kind: "amend", message: messages[oid] ?? defaultMessage(items, group) });
    }
    if (updateRefs) for (const r of rows) for (const u of r.refs) line(u.text);
    i += rows.length;
  }
  return out;
}

/** `--update-refs` landed in git 2.38; an unknown version is treated as too old. */
export function updateRefsSupported(version: string | null): boolean {
  const m = /(\d+)\.(\d+)/.exec(version?.replace(/^git version\s*/i, "") ?? "");
  return !!m && (Number(m[1]) > 2 || (Number(m[1]) === 2 && Number(m[2]) >= 38));
}
