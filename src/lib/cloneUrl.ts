// Pure path helpers for the clone dialog. Paths keep whichever separator they already use.

/** Last path segment of a clone URL minus `.git`: `https://x/y/repo.git/` → `repo`, `git@x:y/repo` → `repo`. */
export function repoNameFromUrl(url: string): string {
  const trimmed = url.trim().replace(/[\\/]+$/, "");
  const last = trimmed.split(/[\\/:]/).pop() ?? "";
  return last.replace(/\.git$/i, "");
}

/** `\` when `path` already uses backslashes, else `/`. */
export const pathSep = (path: string) => (path.includes("\\") ? "\\" : "/");

/** `<parent><sep><name>`; a trailing separator on `parent` is not doubled. */
export function joinPath(parent: string, name: string): string {
  if (!parent) return name;
  return parent.replace(/[\\/]+$/, "") + pathSep(parent) + name;
}

/** Parent directory (`C:\a\b` → `C:\a`); a root-level path returns itself. */
export function parentDir(path: string): string {
  const t = path.replace(/[\\/]+$/, "");
  const i = Math.max(t.lastIndexOf("/"), t.lastIndexOf("\\"));
  return i > 0 ? t.slice(0, i) : t;
}
