// A typed `git …` line → argv, the way a shell would split it minus globbing and expansion:
// `"…"` groups with `\"` / `\\` escapes, `'…'` groups literally, and outside quotes a backslash
// only escapes a quote (`'it'\''s'`) — before anything else it is literal (Windows paths).
// `gitCmd` (dialogs/gitArgs.ts) and `display_cmd` (crates/git-core/src/cli/runner.rs) quote the
// other way; both round-trip through here.

export type SplitResult = { ok: true; args: string[] } | { ok: false; error: string };

export function splitArgs(text: string): SplitResult {
  const args: string[] = [];
  let cur = "";
  let inWord = false;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      else cur += c;
    } else if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === "\\" && (text[i + 1] === '"' || text[i + 1] === "\\")) cur += text[++i];
      else cur += c;
    } else if (c === "\\" && (text[i + 1] === '"' || text[i + 1] === "'")) {
      cur += text[++i];
      inWord = true;
    } else if (c === '"' || c === "'") {
      quote = c;
      inWord = true;
    } else if (/[ \t\r\n]/.test(c)) {
      // ASCII whitespace only, like a shell: an NBSP pasted from a web page stays in the word.
      if (inWord) args.push(cur);
      cur = "";
      inWord = false;
    } else {
      cur += c;
      inWord = true;
    }
  }
  if (quote) return { ok: false, error: "Unterminated quote" };
  if (inWord) args.push(cur);
  return { ok: true, args };
}

const FLAG_I = ["add", "rebase", "clean", "stash"];
const FLAG_P = ["add", "reset", "checkout", "restore", "stash", "commit"];
/** Options whose next token is a value, never a flag (`commit -m -p` commits with the message `-p`). */
const TAKES_VALUE = ["-m", "-F", "--message", "--file"];

/**
 * The flag that would need a terminal, or `null`: `--interactive` anywhere, `-i` / `-p` / `--patch`
 * for the commands where they mean that — scanned up to the first `--`, with a bundle like `-ip`
 * read letter by letter and the value after `-m` / `-F` skipped. Mirror of `check_custom_args` in
 * crates/git-core/src/cli/ops.rs, which is what actually enforces it.
 */
export function interactiveFlag(args: string[]): string | null {
  const cmd = args[0] ?? "";
  const flagI = FLAG_I.includes(cmd);
  const flagP = FLAG_P.includes(cmd);
  const needsTerminal = (a: string) => a === "--interactive" || (a === "-i" && flagI) || ((a === "-p" || a === "--patch") && flagP);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") break;
    if (TAKES_VALUE.includes(a)) {
      i++;
      continue;
    }
    const flags = /^-[A-Za-z]{2,}$/.test(a) ? [...a.slice(1)].map((c) => `-${c}`) : [a];
    const hit = flags.find(needsTerminal);
    if (hit) return hit;
  }
  return null;
}
