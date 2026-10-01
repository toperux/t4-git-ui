// Rewraps one markdown paragraph at 120 characters — see docs/README.md.
//   node docs/reflow.mjs <file> <from> <to>
// Rewrites lines from..to (1-based, inclusive) in place and prints them. The first line keeps its indent (a quote,
// its `>` prefix as written). A quote's later lines take `> ` (`> > ` when nested) plus any list marker's width; others
// take the second line's indent, or for a one-line range the width of the first line's indent and list marker.
// A code span is never split (a run of n backticks closes only on a run of exactly n; no backslash escapes), and a
// word that would open a markdown block at a line start is joined to the word before it. A CRLF range keeps CRLF.
// It refuses, writing nothing, a range that is not one paragraph (a blank line, a rule, a heading / table / fence /
// list item / quote / HTML tag inside it, a code span left open), a range mixing CRLF and LF, or a joined pair that
// can't fit in 120.
import { readFileSync, writeFileSync } from "node:fs";

const WIDTH = 120;
// A word that opens a block when it starts a line. Whole words only, so `**bold**`, `-p` or `+3` pass.
// `<` covers an HTML block start (`<div>`, `<!--`); a `<placeholder>` is caught too, which only joins or refuses.
const BLOCK = /^(?:#{1,6}|[-+*]|\d{1,9}[.)]|>.*|\|.*|`{3,}.*|~{3,}.*|<.*)$/;
// A word that, alone or with others like it on a line, makes the line above a heading or draws a rule.
const LONE = /^(?:=+|-{2,}|\*{2,}|_+)$/;
// Whole lines that do that: a thematic break, spaced or not (`- - -`, `***`, `_ _ _`), or a setext underline.
const RULE = /^(?:([-*_])(?:\s*\1){2,}|=+|-{2,})\s*$/;
const MARKER = /^\s*(?:[-+*]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s+)?/;
const len = (s) => [...s].length;

const [file, a, b] = process.argv.slice(2);
const from = Number(a), to = Number(b);
if (!file || !Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from)
  refuse(0, "usage: node docs/reflow.mjs <file> <from> <to>");
const lines = readFileSync(file, "utf8").split("\n");
const count = lines.length - (lines.at(-1) === "" ? 1 : 0);
if (to > count) refuse(to, `the file has ${count} lines`);
const block = lines.slice(from - 1, to);

function refuse(n, why) {
  console.error(n ? `${file}:${n}: ${why}; nothing written` : why);
  process.exit(1);
}
const firstWord = (s) => s.trim().split(/\s+/)[0];

// A quote's first line keeps its own `>` prefix, as written; the words, and the guard, start after it.
const quote = block[0].match(/^\s*(?:>[ \t]*)+/)?.[0];

// Guard: one paragraph only.
block.forEach((l, i) => {
  const body = i === 0 && quote ? l.slice(quote.length) : l;
  if (!body.trim()) refuse(from + i, i === 0 && quote ? "an empty quote line" : "blank line");
  if (RULE.test(body.trim())) refuse(from + i, "a rule or a heading underline");
  const w = firstWord(body);
  const opensParagraph = i === 0 && /^(?:[-+*]|\d{1,9}[.)])$/.test(w);
  if (BLOCK.test(w) && !opensParagraph) refuse(from + i, `starts a block (${w})`);
});

// Line endings: a range that mixes CRLF and LF is refused rather than normalized. The file's last line, with no
// newline after it, has no ending of its own and doesn't count.
const atEof = to === lines.length;
const endings = new Set(block.filter((l, i) => !(atEof && i === block.length - 1)).map((l) => l.endsWith("\r")));
if (endings.size > 1) refuse(from, "mixed line endings (CRLF and LF)");
// With no counted line (the range is only the file's last line), the line before it says which the file uses.
const cr = (endings.size ? endings.has(true) : lines[from - 2]?.endsWith("\r")) ? "\r" : "";

// Words, with each code span kept whole.
const text = block.map((l, i) => (i === 0 && quote ? l.slice(quote.length) : l).trim()).join(" ");
const words = [];
let w = "", open = 0;
for (let i = 0; i < text.length; ) {
  if (text[i] === "`") {
    let n = 0;
    while (text[i + n] === "`") n++;
    w += text.slice(i, i + n);
    i += n;
    if (!open) open = n;
    else if (n === open) open = 0;
    continue;
  }
  if (/\s/.test(text[i]) && !open) {
    if (w) words.push(w);
    w = "";
  } else w += text[i];
  i++;
}
if (w) words.push(w);
if (open) refuse(to, "a code span is still open at the end");

// A word that would open a block at a line start, or stand alone as a rule, rides with the word before it (the
// first word is the marker). Decided on the original words, so a chain (`- -`, `- 1.`) rides along whole.
const opens = words.map((x) => BLOCK.test(x) || LONE.test(x));
const joined = new Map(); // joined pair -> its first word, as it was before the join
for (let i = words.length - 1; i > 0; i--) {
  if (!opens[i]) continue;
  const head = words[i - 1];
  words.splice(i - 1, 2, `${head} ${words[i]}`);
  joined.set(words[i - 1], head);
}

// The first line keeps its indent (or its quote prefix). A quote always continues with `> ` (`> > ` when nested),
// plus the width of a list marker after it. Otherwise later lines take the second line's indent, or for a one-line
// range the width of the list marker.
const indent = block[0].match(/^\s*/)[0];
const markerWidth = (s) => len(s.match(MARKER)?.[0] ?? "");
const hang = quote
  ? quote.replace(/>(?=\S|$)/g, "> ").trimEnd() + " " + " ".repeat(markerWidth(block[0].slice(quote.length)))
  : block.length > 1
    ? block[1].match(/^\s*/)[0]
    : " ".repeat(markerWidth(block[0]) || len(indent));
const out = [];
let cur = quote ?? indent;
let fresh = true; // nothing but the line's prefix yet
// A joined pair can't break. Alone on its line and still too long, though its first word alone would fit, the range
// is refused rather than overflowing; a first word already too long (a long code span) runs past 120 as it would.
const fits = (word) => {
  const head = joined.get(word);
  if (head === undefined || len(cur) <= WIDTH || len(cur) - len(word) + len(head) > WIDTH) return;
  refuse(from + out.length, `"${word}" can't be split and doesn't fit in ${WIDTH} (it would be this line)`);
};
for (const word of words) {
  if (fresh) {
    cur += word;
    fresh = false;
    fits(word);
  } else if (len(cur) + 1 + len(word) > WIDTH) {
    out.push(cur);
    cur = hang + word;
    fits(word);
  } else cur += " " + word;
}
out.push(cur);

// A CRLF range keeps CRLF on its lines; the file's last line, with no newline after it, gets none.
lines.splice(from - 1, to - from + 1, ...out.map((l, i) => l + (atEof && i === out.length - 1 ? "" : cr)));
writeFileSync(file, lines.join("\n"));
console.log(out.join("\n"));
