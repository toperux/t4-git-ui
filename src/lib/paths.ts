// Pure path / clone-URL helpers. Paths keep whichever separator they already use.

/** Last path segment (`C:\src\repo\` → `repo`). */
export function baseName(path: string): string {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path;
}

/** Parent directory (`C:\a\b` → `C:\a`); a root-level path returns itself. */
export function parentDir(path: string): string {
  const t = path.replace(/[\\/]+$/, "");
  const i = Math.max(t.lastIndexOf("/"), t.lastIndexOf("\\"));
  return i > 0 ? t.slice(0, i) : t;
}

/** `\` when `path` already uses backslashes, else `/`. */
export const pathSep = (path: string) => (path.includes("\\") ? "\\" : "/");

/** `<parent><sep><name>`; a trailing separator on `parent` is not doubled. */
export function joinPath(parent: string, name: string): string {
  if (!parent) return name;
  return parent.replace(/[\\/]+$/, "") + pathSep(parent) + name;
}

/** Last path segment of a clone URL minus `.git`: `https://x/y/repo.git/` → `repo`, `git@x:y/repo` → `repo`. */
export function repoNameFromUrl(url: string): string {
  const trimmed = url.trim().replace(/[\\/]+$/, "");
  const last = trimmed.split(/[\\/:]/).pop() ?? "";
  return last.replace(/\.git$/i, "");
}

/** `https://github.com/x/y.git` → `github.com/x/y`, `file:///C:/tmp/bare.git` → `C:/tmp/bare` */
export function prettyUrl(url: string): string {
  return url
    // `file:///…`'s third slash goes only before a drive letter (it would leave a leading `/C:/…`);
    // a POSIX path keeps it — `file:///home/u/bare` is not `home/u/bare`.
    .replace(/^[a-z+]+:\/\/(\/(?=[a-z]:))?/i, "")
    .replace(/^git@/, "")
    .replace(/\.git$/, "");
}
