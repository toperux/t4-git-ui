// Per-line syntax highlighting for the diff viewer (style guide §4 Diff).
// Each line is parsed on its own with a lezer parser — good enough for diffs, and cheap: a line is
// tokenized only when its virtual row renders, and the result is cached per (lang, text).
// Grammars are code-split: `loadLang` fetches one on first use; until then lines render plain.
import type { Parser } from "@lezer/common";
import { highlightTree, tagHighlighter, tags as t } from "@lezer/highlight";

export type SynClass = "keyword" | "string" | "comment" | "number" | "type" | "function" | "punct";
export interface Span {
  text: string;
  /** `null` = plain text. */
  cls: SynClass | null;
}

export type Lang = "js" | "jsx" | "ts" | "tsx" | "rust" | "css" | "json" | "html" | "python";

const BY_EXT: Record<string, Lang> = {
  js: "js", mjs: "js", cjs: "js",
  jsx: "jsx",
  ts: "ts", mts: "ts", cts: "ts",
  tsx: "tsx",
  rs: "rust",
  css: "css",
  json: "json", jsonc: "json",
  html: "html", htm: "html",
  py: "python", pyi: "python",
};

/** Language for a path by extension; `null` = plain text. */
export function langForPath(path: string | null | undefined): Lang | null {
  if (!path) return null;
  const dot = path.lastIndexOf(".");
  if (dot < 0 || dot < path.lastIndexOf("/")) return null;
  return BY_EXT[path.slice(dot + 1).toLowerCase()] ?? null;
}

const js = (dialect?: string) => () => import("@lezer/javascript").then((m) => (dialect ? m.parser.configure({ dialect }) : m.parser));
const LOADERS: Record<Lang, () => Promise<Parser>> = {
  js: js(),
  jsx: js("jsx"),
  ts: js("ts"),
  tsx: js("ts jsx"),
  rust: () => import("@lezer/rust").then((m) => m.parser),
  css: () => import("@lezer/css").then((m) => m.parser),
  json: () => import("@lezer/json").then((m) => m.parser),
  html: () => import("@lezer/html").then((m) => m.parser),
  python: () => import("@lezer/python").then((m) => m.parser),
};

const parsers = new Map<Lang, Parser>();
const pending = new Map<Lang, Promise<void>>();

export const isLoaded = (lang: Lang | null): lang is Lang => !!lang && parsers.has(lang);

/** Resolves once the grammar is available (no-op when it already is). */
export function loadLang(lang: Lang): Promise<void> {
  if (parsers.has(lang)) return Promise.resolve();
  let p = pending.get(lang);
  if (!p) {
    p = LOADERS[lang]().then((parser) => {
      parsers.set(lang, parser);
      pending.delete(lang);
    });
    pending.set(lang, p);
  }
  return p;
}

// Sub-tags (controlKeyword, lineComment, integer, …) resolve to their parent's class.
const highlighter = tagHighlighter([
  { tag: t.keyword, class: "keyword" },
  { tag: [t.string, t.special(t.string), t.regexp, t.escape], class: "string" },
  { tag: t.comment, class: "comment" },
  { tag: [t.number, t.bool, t.null, t.atom], class: "number" },
  { tag: [t.typeName, t.className, t.namespace, t.tagName], class: "type" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName))], class: "function" },
  { tag: [t.punctuation, t.operator], class: "punct" },
]);

const CACHE_MAX = 5000;
const cache = new Map<string, Span[]>();

function tokenize(parser: Parser, text: string): Span[] {
  const spans: Span[] = [];
  let pos = 0;
  highlightTree(parser.parse(text), highlighter, (from, to, cls) => {
    if (from > pos) spans.push({ text: text.slice(pos, from), cls: null });
    spans.push({ text: text.slice(from, to), cls: cls as SynClass });
    pos = to;
  });
  if (pos < text.length) spans.push({ text: text.slice(pos), cls: null });
  return spans;
}

/** Spans for one line. Plain text for unknown / not-yet-loaded languages and empty lines. Cached (LRU, 5k entries). */
export function highlightLine(lang: Lang | null, text: string): Span[] {
  const parser = lang && parsers.get(lang);
  if (!parser || text.length === 0) return text ? [{ text, cls: null }] : [];
  const key = `${lang}\0${text}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const spans = tokenize(parser, text);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, spans);
  return spans;
}

/** Test hook. */
export const _cacheSize = () => cache.size;
