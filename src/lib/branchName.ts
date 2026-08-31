// Client-side subset of `git check-ref-format --branch` — the backend still has the final say.

/** Reason `name` is not a usable branch / tag name, or `null` when it is. `existing` = names already taken. */
export function validateRefName(name: string, existing: string[] = []): string | null {
  if (!name) return "Enter a name";
  if (/\s/.test(name)) return "No spaces";
  if (name.startsWith("-")) return "Must not start with -";
  if (name === "@") return "@ is reserved";
  if (name.startsWith("/") || name.endsWith("/")) return "Must not start or end with /";
  if (name.endsWith(".")) return "Must not end with .";
  if (name.includes("..")) return "Must not contain ..";
  if (name.includes("//")) return "Must not contain //";
  if (name.includes("@{")) return "Must not contain @{";
  // eslint-disable-next-line no-control-regex
  if (/[~^:?*[\\\x00-\x1f\x7f]/.test(name)) return "Must not contain ~ ^ : ? * [ \\ or control characters";
  for (const part of name.split("/")) {
    if (part.startsWith(".")) return "No part may start with .";
    if (part.endsWith(".lock")) return "No part may end with .lock";
  }
  if (name === "HEAD") return "HEAD is reserved";
  if (existing.includes(name)) return `${name} already exists`;
  return null;
}
