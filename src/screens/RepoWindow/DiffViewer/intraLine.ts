// Pure: the changed words of a paired del/add line (style guide §4 Diff), and the span splitting
// that renders them. A word diff only helps when the two lines are still recognisably the same
// line, so every cap below turns a rewrite back into no highlight at all rather than tinting the
// line whole — which is what the row tint already says.
import type { Span } from "../../../lib/highlight";

/** `[start, end)` char offsets into the line body — the text without its trailing `\r`. */
export type EmphRange = [number, number];
/** A syntax span cut at the emphasis boundaries; `on` = inside a changed word. */
export type Part = Span & { on: boolean };

/**
 * Word run, whitespace run, an emoji sequence (a flag pair, or a pictograph with its skin tone,
 * `FE0F` and ZWJ-joined parts — a span boundary inside one would break the glyph), or any other
 * single code point (`u` keeps combining marks whole).
 */
const TOKEN = /[\p{L}\p{N}\p{M}_]+|\s+|\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\p{Variation_Selector}|\p{Join_Control}\p{Extended_Pictographic})*|./gsu;
/** Cheapest cap first: a line this long is a minified blob, not something to word-diff. */
const MAX_CHARS = 1000;
/** Bounds the DP at 10k cells; a line with this many changed tokens has no readable word diff anyway. */
const MAX_TOKENS = 100;
/** More of both lines changed than this: a rewrite, and the highlight would be noise. */
const MAX_NOISE = 0.6;

interface Token {
  text: string;
  at: number;
}

function tokens(text: string): Token[] {
  const out: Token[] = [];
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(text); m; m = TOKEN.exec(text)) out.push({ text: m[0], at: m.index });
  return out;
}

/** Changed word ranges of a del/add pair, or `null` when nothing is worth tinting. */
export function emphasis(delText: string, addText: string): { del: EmphRange[]; add: EmphRange[] } | null {
  // The `\r` renders as a `␍` glyph outside the spans, so no offset may reach it — and without this
  // a CRLF→LF file would have every one of its pairs differ in their last token and tint whole.
  const del = delText.endsWith("\r") ? delText.slice(0, -1) : delText;
  const add = addText.endsWith("\r") ? addText.slice(0, -1) : addText;
  if (del === add || del.length > MAX_CHARS || add.length > MAX_CHARS) return null;

  const a = tokens(del);
  const b = tokens(add);
  // The common head and tail carry no change; trimming them is what keeps the DP small on a typical edit.
  let lo = 0;
  while (lo < a.length && lo < b.length && a[lo].text === b[lo].text) lo++;
  let hi = 0;
  while (hi < a.length - lo && hi < b.length - lo && a[a.length - 1 - hi].text === b[b.length - 1 - hi].text) hi++;
  const at = a.slice(lo, a.length - hi);
  const bt = b.slice(lo, b.length - hi);
  if (at.length > MAX_TOKENS || bt.length > MAX_TOKENS) return null;

  // Token LCS in suffix form (`dp[i][j]` = the LCS of the tails), so the walk below runs forward
  // and emits its ranges already sorted.
  const n = at.length;
  const m = bt.length;
  const w = m + 1;
  const dp = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i * w + j] = at[i].text === bt[j].text ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);

  const delR: EmphRange[] = [];
  const addR: EmphRange[] = [];
  let changed = 0;
  const mark = (out: EmphRange[], t: Token) => {
    const last = out[out.length - 1];
    // A token starting where the last range ended extends it: `[0];` is one highlight, not four.
    if (last && last[1] === t.at) last[1] = t.at + t.text.length;
    else out.push([t.at, t.at + t.text.length]);
    changed += t.text.length;
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (at[i].text === bt[j].text) {
      i++;
      j++;
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) mark(delR, at[i++]);
    else mark(addR, bt[j++]);
  }
  while (i < n) mark(delR, at[i++]);
  while (j < m) mark(addR, bt[j++]);

  if (changed > MAX_NOISE * (del.length + add.length)) return null;
  return { del: delR, add: addR };
}

/**
 * Splits syntax spans at the emphasis boundaries so each piece is wholly in or out of a range.
 * The spans come straight from `highlightLine`'s cache: they are read, never written.
 */
export function cut(spans: Span[], emph?: EmphRange[]): Part[] {
  if (!emph || emph.length === 0) return spans.map((sp) => ({ ...sp, on: false }));
  const parts: Part[] = [];
  let r = 0;
  let pos = 0;
  for (const sp of spans) {
    const end = pos + sp.text.length;
    let at = pos;
    while (at < end) {
      // A range that runs past this span continues into the next: `r` only moves once it is behind us.
      while (r < emph.length && emph[r][1] <= at) r++;
      const range = emph[r] as EmphRange | undefined;
      if (!range || range[0] >= end) {
        parts.push({ text: sp.text.slice(at - pos), cls: sp.cls, on: false });
        break;
      }
      const on = range[0] <= at;
      const stop = Math.min(end, on ? range[1] : range[0]);
      parts.push({ text: sp.text.slice(at - pos, stop - pos), cls: sp.cls, on });
      at = stop;
    }
    pos = end;
  }
  return parts;
}
