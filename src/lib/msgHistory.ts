// Last committed messages per repository, in `localStorage` (`msgHistory:<repoId>`), newest first.

export const HISTORY_MAX = 20;

const key = (repoId: string) => `msgHistory:${repoId}`;

export function loadHistory(repoId: string): string[] {
  try {
    const raw = localStorage.getItem(key(repoId));
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((m): m is string => typeof m === "string") : [];
  } catch {
    return [];
  }
}

/** Prepends `message` (moving an identical earlier entry to the front) and keeps `HISTORY_MAX`. */
export function pushHistory(repoId: string, message: string): string[] {
  const next = [message, ...loadHistory(repoId).filter((m) => m !== message)].slice(0, HISTORY_MAX);
  try {
    localStorage.setItem(key(repoId), JSON.stringify(next));
  } catch {
    // Storage unavailable: history simply doesn't persist.
  }
  return next;
}

/** `summary` = first line, `body` = the rest without the separating blank line. */
export function splitMessage(message: string): { summary: string; body: string } {
  const nl = message.indexOf("\n");
  if (nl < 0) return { summary: message.trim(), body: "" };
  return { summary: message.slice(0, nl).trim(), body: message.slice(nl + 1).replace(/^\n+/, "").trimEnd() };
}

export function joinMessage(summary: string, body: string): string {
  const s = summary.trim();
  const b = body.trim();
  return b ? `${s}\n\n${b}\n` : `${s}\n`;
}
