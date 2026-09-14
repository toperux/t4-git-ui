import type { Command, Group } from "./commands";

const GROUPS: Group[] = ["Recent", "Views", "Repository", "Branch", "Stash", "Network", "Go to branch", "Repositories", "Window"];
const byGroup = (a: Command, b: Command) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group);

/** 3 = the label starts with the query, 2 = a word in it does, 1 = the letters appear in order, 0 = no match. */
export function score(query: string, label: string): 0 | 1 | 2 | 3 {
  const q = query.toLowerCase();
  const l = label.toLowerCase();
  if (l.startsWith(q)) return 3;
  if (l.split(/[\s/_-]+/).some((w) => w.startsWith(q))) return 2;
  let i = 0;
  for (const ch of l) if (ch === q[i]) i++;
  return i === q.length ? 1 : 0;
}

/**
 * Empty query: the recent commands as a `Recent` group (newest first), then everything in group
 * order. A query: matches only, groups ordered by their best row (ties in group order), rows
 * within a group best first (`sort` is stable, so the build order holds among equals) — a group
 * stays together under one label — and no Recent group, since the match is what is being asked for.
 */
export function rankCommands(query: string, commands: Command[], recentIds: string[]): Command[] {
  const q = query.trim();
  if (!q) {
    const recent = recentIds.flatMap((id) => {
      const c = commands.find((x) => x.id === id);
      return c ? [{ ...c, group: "Recent" as const }] : [];
    });
    return [...recent, ...[...commands].sort(byGroup)];
  }
  const hits = commands.map((c) => ({ c, s: score(q, c.label) })).filter((x) => x.s > 0);
  const best = new Map<Group, number>();
  for (const { c, s } of hits) best.set(c.group, Math.max(best.get(c.group) ?? 0, s));
  return hits
    .sort((a, b) => best.get(b.c.group)! - best.get(a.c.group)! || byGroup(a.c, b.c) || b.s - a.s)
    .map((x) => x.c);
}
