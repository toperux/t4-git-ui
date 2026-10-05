# Plan: promote the Phase 2b session's helpers, 2026-10-01

_Written 2026-10-01. Status: plan review pass 1: 12 findings (fixed below), decisions D1–D4 taken by the owner
2026-10-01 (every recommendation); pass 2: 7 findings in row 3, fixed (one word pattern for D4 and the guard, the
indent and refusal specified, the checks matched to the guard); pass 3: clean (the plan passes its own guard).
Executed 2026-10-01 on the owner's go. Change review pass 1: two bugs fixed in `reflow.mjs` (D4 chains such as
`- -` are decided on the original words; a fractional `from` is refused), plus any whitespace splits words, the line
count in the past-the-end refusal, and the `cdp.mjs` header's shot path; D5 taken (below). Pass 2: clean. Triage
with the owner (see *Triage*), then the five fixes it ruled. Pass 3: a stray CR at EOF and row 3's stale pattern
fixed; R1–R4 ruled FIX. Pass 4: the status line fixed; S1–S4 ruled FIX. Pass 5: an S4 gap fixed (a CRLF file's
last line wrapped alone took LF); U1 and U3 ruled FIX. Pass 6: clean; V1 and V2 ruled FIX._

**Goal:** keep three things the close-out Phase 2b session built or learned, which today live only in its scratch
folder or its transcript, so the next session (Phase 3) starts with them. Docs and tooling only; no app code. Every
file lands under `docs/`, so CI skips the commit (`ci.yml:14-21`).

## Rows

1. **`cdp.mjs`: two more steps** (`docs/smoke/cdp.mjs`), as the scratch copy that drove the 2026-10-01 BK re-walk
   has them (`docs/archive/walks/2026-10-01-group-bk-walk.md`, *Re-walk*); the code is copied unchanged:
   - `--shot <file.png>`: `Page.captureScreenshot` of the page viewport (no title bar, no native `ask()` box,
     nothing outside the webview), written to the file. `cdp.mjs` has no other way to take one.
   - `--tag "<css>" "<regex>"`: clears every `[data-w]`, then marks with `data-w` the first element, in document
     order, that matches the selector and whose `textContent` matches the regex (`new RegExp(re)`: no flags, so
     case-sensitive and unanchored). It prints the first 80 characters of that text, or `{"tag":null}` when
     nothing matches, in which case the next `--click "[data-w]"` throws `no element [data-w]`.
   - The header comment's usage lines (`cdp.mjs:2-3`) name both steps.
   - **Check:** `node --check docs/smoke/cdp.mjs`. Not run against the app again; it drove the whole BK re-walk.
2. **`smoke-cdp.md`:**
   - *Driving it without Playwright* (`:29-54`): the usage block (`:35-36`) and a short paragraph for `--shot` and
     `--tag`, with the points above. For `--tag`: anchor the regex with `^` and use a specific selector, since a
     broad one matches an ancestor first and `textContent` runs child text together (as `:153` notes for tree
     items). For `--shot`: write shots to the session's scratch folder, not the repo (a relative path lands in the
     working directory, and `.gitignore` doesn't cover `*.png`); the same viewport-only limit as `wd.mjs shot`
     (`smoke-linux.md:147-148`).
   - Move the `data-w` bullet (`:137-138`, now under *Inside Windows Sandbox*) next to `--tag`, reworded: `--tag`
     clears old marks itself; when tagging by hand, clear them first.
   - *Several windows, and what else group AZ needed* › *N windows at launch* (`:82-86`), two sentences:
     - Write `layout.json` with a file tool, not through shell-quoted JSON: a seed escaped through bash and
       `node -e` came out with mangled paths on 2026-10-01 (three *Couldn't open repository* toasts).
     - An empty `[]` layout is not a clean start: a launch can open the most recent repository from `lastOpen`
       instead of the start screen (open-items §V, F2), so a walk seeds the tabs it needs.
3. **`docs/reflow.mjs`: rewrap one markdown paragraph at 120 characters** (new file; D1).
   - `node docs/reflow.mjs <file> <from> <to>`: rewrites lines `from..to` (1-based, inclusive) in the file and
     prints the new lines. Width is counted in characters (`[...s].length`), fixed at 120 (D2).
   - **Patterns** (as built, after triage): BLOCK, a word that opens a markdown block at a line start,
     ``/^(?:#{1,6}|[-+*]|\d{1,9}[.)]|>.*|\|.*|`{3,}.*|~{3,}.*|<.*)$/`` (`<` for an HTML block start, S2); LONE, a word
     that alone (or with others like it) on a line makes the line above a heading or draws a rule,
     `/^(?:=+|-{2,}|\*{2,}|_+)$/` (D5, R4, S1); RULE, such a whole line, spaced or not,
     `` /^(?:([-*_])(?:\s*\1){2,}|=+|-{2,})\s*$/ `` (T6, R4). They match whole words or lines, so `**bold**`, `-p`,
     `+3`, `_italic_` or `-- a note` at a line start pass.
   - **Indent:** the first line keeps its own. Later lines take the second line's indent; for a one-line range, the
     length of the first line's indent, list marker and the spaces after it
     (`^\s*(?:[-+*]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s+)?`: 2 for a `-` bullet, 4 for a nested one, 6 for `- [x]`); a quote's
     `> `, or `> > ` when nested (T1, R2), always, whatever the second line (V2), plus the width of a list marker after
     it (V1); else its indent. A quote's first line keeps its `>` prefix as written (S3). A CRLF range keeps CRLF, the
     file's last line with no newline after it gets none, and a range mixing CRLF and LF is refused (T2, S4).
   - **Code spans are never split:** a run of n backticks opens a span and only a run of exactly n closes it, so a
     double-backtick span holding a lone backtick stays whole. No backslash escapes: a backslash is literal inside a
     span (`smoke-cdp.md:83` has a span ending in one). A span that doesn't fit runs past 120.
   - **D4:** a word matching BLOCK or LONE is joined to the word before it, so the two wrap together and no line
     starts with it; lines stay within 120, bar a lone long span. The range's first word is exempt: it is the list
     marker itself. A joined pair too long for any line is refused, naming the output line it would be, unless its
     first word alone is already over 120 (a long span), which runs past 120 as it would alone (T5, R1, R3).
   - **Guard:** before writing anything, it refuses the range when the first line is blank or its first word matches
     BLOCK (a list marker or `>` excepted: both start a paragraph), when any later line is blank or its first word
     matches BLOCK, when any line matches RULE, or when a code span is still open at the end. A refusal prints the line
     number and the reason, exits 1 and writes nothing. On 2026-10-01 a range that reached the plan's title merged the
     heading into the paragraph below.
   - **Check** (a self-check script run once, on scratch copies, not committed):
     - a long bullet with a code span rewraps without splitting it, every line ≤120 or a lone long span;
     - one-line `-`, nested `-` and `- [x]` items get a 2-, 4- and 6-space hang;
     - `smoke-test-post-v1.md:93-95` (a double-backtick span, and a `+` between two spans) rewraps with the spans
       intact, no runaway line and no line starting with `+`; `:96-98` rewraps on its own;
     - `smoke-cdp.md:83-88` (a span ending in a backslash) rewraps;
     - a range starting at a heading, one reaching a heading, and one holding a second list item are refused, with
       the file byte-identical afterwards;
     - the triage cases: T1, T2, T5, T6, R1–R4, S1–S4, and a CRLF file with no final newline.
4. **`docs/README.md`:**
   - The `smoke/` block gains the files it doesn't list: `smoke-linux.md`, `cdp.mjs` (CDP driver, Windows),
     `wd.mjs` (WebDriver driver, Linux).
   - A line for `reflow.mjs` and the convention it serves (D2): new and edited prose wraps at 120 characters; a
     code span that doesn't fit runs past 120 rather than being split; tables are exempt; older files wrap at
     about 100 and aren't rewrapped just for width.

## Decisions (taken 2026-10-01)

- **D1. Where `reflow.mjs` lives:** `docs/reflow.mjs`, next to the docs it serves, as `cdp.mjs` sits next to
  `smoke-cdp.md`. (Not `docs/tools/`, a folder for one file; not a `.claude` skill, which a person editing by hand
  wouldn't look in and which would make the commit run CI.)
- **D2. Width:** fixed at 120, no width argument; older ~100-column files keep their width.
- **D3. `wd.mjs`:** no `tag` verb; add one when a Linux walk needs it.
- **D4. Markdown-start guard:** in.
- **D5. A lone `--` / `==` / `***` line** (change review pass 1): the tool never leaves one alone on a line (it would
  turn the line above into a heading or draw a rule) and refuses a range holding such a line (narrowed by R4).

## Not in scope

- The scratch store backups (`store-backup-rewalk`, `store-backup-gate-0.10.15`): nothing depends on them.
- Hard-break handling in `reflow.mjs`: no doc uses a two-space hard break.
- Memory: a pointer to these tools is added after they land.

## Triage (2026-10-01, the owner, one item at a time)

Change review passes 1–2 left eight items. The owner ruled:

- **T1 FIX:** a one-line `>` range's continuation lines get `> ` (they rendered inside the quote anyway).
- **T2 FIX:** a CRLF file keeps CRLF on the rewrapped lines (the repo is LF; it can't happen here today).
- **T3 ACCEPT, closed:** the guard's conservative refusals (a multi-line quote, a bare backtick run in prose).
  Refusing writes nothing, and the refusal names the line. (A line merely starting with `--` / `==` was in this
  list; R4 below fixed it.)
- **T4 ACCEPT, closed:** any whitespace splits words, so a non-breaking space outside a span becomes a plain one;
  no doc has one. The status line says so.
- **T5 FIX:** a joined pair (D4) too long for any line is refused instead of overflowing 120.
- **T6 FIX:** a spaced rule (`- - -`, `* * *`, `_ _ _`) as a line is refused, and a trailing `_` joins like `-`.
- **T7 FIX:** row 3's `smoke-cdp.md` cites updated to `:83` / `:83-88` (the commit moved the paragraph).
- **T8:** the self-check gained a case for T1, T2, T5 and T6 each.

Change review pass 3 found a stray CR at the end of a CRLF file with no final newline, and row 3's stale pattern
(both fixed), and left four items. The owner ruled all four FIX:

- **R1:** T5 refused a code span already over 120 followed by a block word; now it refuses only when the join is
  what overflows (the pair's first word alone fits).
- **R2:** a nested quote's continuation lines hang `> > `, not `> `.
- **R3:** a T5 refusal names the output line the pair would be on, not the range's first line.
- **R4:** a line merely starting with `_`, `__`, `==` or `--` is no longer refused: LONE words only join, and the
  guard refuses whole rule or underline lines (RULE).

Change review pass 4 found the status line stale (fixed) and left four items. The owner ruled all four FIX:

- **S1:** a bare `**` joins like `***` (`\*{2,}` in LONE), so a trailing `** *` never stands alone as a rule.
- **S2:** a word starting with `<` (an HTML block start) joins like `-`, and a line starting with one is refused; a
  `<placeholder>` at a line start is refused too (conservative, as T3).
- **S3:** a quote's first line keeps its `>` prefix as written (a tab after `>` stays a tab).
- **S4:** a range mixing CRLF and LF is refused instead of normalized: lines change count when rewrapped, so no
  line can keep "its own" ending. The file's last line, with no newline after it, doesn't count as LF.

Change review pass 5 found an S4 gap: a CRLF file's last line, with no newline after it, rewrapped alone took LF
inside (fixed: the line before says which ending the file uses). It left three items; the owner ruled:

- **U1 FIX:** the guard also checks what follows a quote's `>` prefix on the first line, so a quoted heading, rule
  or empty quote line is refused like an unquoted one.
- **U2 → U3:** S2 refused one existing paragraph, `smoke-test-post-v1.md` around `:1582`, whose line starts with a
  bare `<oid7>`; the owner chose to change the doc.
- **U3 FIX:** that `<oid7>` was raw text a renderer reads as an HTML tag and hides; it is now a code span, which also
  ends U2's refusal.

Change review pass 6 was clean and left two items; the owner ruled both FIX:

- **V1:** a quoted list item (`> - …`, `> 1. …`), one line or more, continues under the item: `> ` plus the marker's
  width.
- **V2:** a quote always continues with `> `, even when the range's second line is lazy (no `>`).

Change review pass 7 was clean but for two wording nits, and pass 8 for one; the owner ruled all three FIX (the
`reflow.mjs` header comment's quote rule, nested quotes included, and the V1 line above). Pass 9: clean; its one
note, Y1 (the hand-wrapped header comment's uneven right edge), the owner accepted, closed.

## Steps

1. Rows 1–4 in one commit, `docs: …`, with the plan.
2. Review loop on the commit until a pass is clean; triage anything skipped with the owner.
3. Push on the owner's word (docs-only: CI skips it).
