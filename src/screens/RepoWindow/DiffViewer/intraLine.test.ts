import { describe, expect, it } from "vitest";
import type { Span } from "../../../lib/highlight";
import { cut, emphasis, type EmphRange } from "./intraLine";

describe("emphasis", () => {
  it("marks an inserted word", () => {
    expect(emphasis("foo baz", "foo bar baz")).toEqual({ del: [], add: [[4, 8]] });
  });

  it("marks a replaced word on both sides", () => {
    expect(emphasis("x foo y", "x bar y")).toEqual({ del: [[2, 5]], add: [[2, 5]] });
  });

  it("marks a single punctuation change", () => {
    expect(emphasis("a;", "a,")).toEqual({ del: [[1, 2]], add: [[1, 2]] });
  });

  it("marks leading whitespace on its own", () => {
    expect(emphasis("line 15", "    line 15")).toEqual({ del: [], add: [[0, 4]] });
  });

  it("merges adjacent changed tokens into one range", () => {
    // The smoke fixture's own pair: `[0];` is four tokens on the del side, `.first() {` six on the add.
    const e = emphasis("    let lane = matches[0];\r", "    let lane = match matches.first() {");
    expect(e).toEqual({ del: [[22, 26]], add: [[15, 21], [28, 38]] });
  });

  it("marks the appended words of the smoke fixture's first hunk", () => {
    expect(emphasis("line 02", "line 02 edited")).toEqual({ del: [], add: [[7, 14]] });
  });

  it("gives up on identical, CRLF-only, oversized, token-heavy and rewritten pairs", () => {
    expect(emphasis("a", "a")).toBeNull();
    expect(emphasis("same\r", "same")).toBeNull();
    expect(emphasis("a".repeat(1001), "b".repeat(1001))).toBeNull();
    // Token cap on its own: 120 shared words with a one-letter change between each — 16 % changed
    // chars, so only the cap (over 100 tokens once the head and tail are trimmed) says no.
    const words = (sep: string) => Array.from({ length: 120 }, (_, i) => `w${i}`).join(sep);
    expect(words(" x ").length).toBeLessThan(1000);
    expect(emphasis(words(" x "), words(" y "))).toBeNull();
    expect(emphasis("aaaa bbbb", "cccc dddd")).toBeNull();
  });

  it("keeps every offset inside the body of a CRLF pair", () => {
    const e = emphasis("crlf 05\r", "crlf 05 edited\r");
    expect(e).toEqual({ del: [], add: [[7, 14]] });
    expect("crlf 05 edited".slice(7, 14)).toBe(" edited");
  });

  it("cuts on code-point boundaries, not UTF-16 units", () => {
    const e = emphasis("a 🙂 b", "a 🎉 b");
    expect(e).toEqual({ del: [[2, 4]], add: [[2, 4]] });
    expect("a 🙂 b".slice(2, 4)).toBe("🙂");
    // A combining mark stays with its base: a range of 1 here would split `e` from its accent.
    expect(emphasis("a é b", "a f́ b")).toEqual({ del: [[2, 4]], add: [[2, 4]] });
  });

  it("keeps an emoji sequence in one token", () => {
    // ZWJ family (8 units), a flag pair (4), a skin-toned thumb (4): a span edge inside any of them
    // breaks the glyph. The families and thumbs share their first pictograph, so a tokenizer that
    // split them would mark only the tail.
    expect(emphasis("hello 👨‍👩‍👧 world", "hello 👨‍👩‍👦 world")).toEqual({ del: [[6, 14]], add: [[6, 14]] });
    expect(emphasis("hello 🇺🇸 world", "hello 🇬🇧 world")).toEqual({ del: [[6, 10]], add: [[6, 10]] });
    expect(emphasis("hello 👍🏽 world", "hello 👍🏿 world")).toEqual({ del: [[6, 10]], add: [[6, 10]] });
  });
});

const spans = (...parts: [string, Span["cls"]][]): Span[] => parts.map(([text, cls]) => ({ text, cls }));

describe("cut", () => {
  it("passes the spans through when there is nothing to emphasise", () => {
    expect(cut(spans(["abc", null], ["de", "keyword"]))).toEqual([
      { text: "abc", cls: null, on: false },
      { text: "de", cls: "keyword", on: false },
    ]);
    expect(cut(spans(["abc", null]), [])).toEqual([{ text: "abc", cls: null, on: false }]);
  });

  it("splits a span around a range inside it", () => {
    expect(cut(spans(["hello world", "keyword"]), [[6, 11]])).toEqual([
      { text: "hello ", cls: "keyword", on: false },
      { text: "world", cls: "keyword", on: true },
    ]);
  });

  it("carries a range that runs past a span into the next one", () => {
    expect(cut(spans(["ab", null], ["cd", "string"]), [[1, 3]])).toEqual([
      { text: "a", cls: null, on: false },
      { text: "b", cls: null, on: true },
      { text: "c", cls: "string", on: true },
      { text: "d", cls: "string", on: false },
    ]);
  });

  it("reassembles the body and leaves the cached spans alone", () => {
    const input = spans(["let ", "keyword"], ["lane = matches", null], ["[0];", "punct"]);
    const before = JSON.parse(JSON.stringify(input));
    const body = input.map((sp) => sp.text).join("");
    const cases: (EmphRange[] | undefined)[] = [undefined, [], [[0, 3]], [[4, 8], [18, 22]], [[0, body.length]]];
    for (const emph of cases) expect(cut(input, emph).map((p) => p.text).join("")).toBe(body);
    expect(input).toEqual(before);
  });
});
