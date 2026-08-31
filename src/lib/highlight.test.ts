import { beforeAll, describe, expect, it } from "vitest";
import { _cacheSize, highlightLine, isLoaded, langForPath, loadLang, type Span } from "./highlight";

const join = (spans: Span[]) => spans.map((s) => s.text).join("");
const of = (spans: Span[], cls: Span["cls"]) => spans.filter((s) => s.cls === cls).map((s) => s.text);

describe("langForPath", () => {
  it("maps extensions and ignores dots in directories", () => {
    expect(langForPath("src/a.ts")).toBe("ts");
    expect(langForPath("src/a.tsx")).toBe("tsx");
    expect(langForPath("crates/x/lib.rs")).toBe("rust");
    expect(langForPath("a.b/Makefile")).toBeNull();
    expect(langForPath("README.md")).toBeNull();
    expect(langForPath(null)).toBeNull();
  });
});

describe("highlightLine", () => {
  it("is plain text until the grammar is loaded", () => {
    expect(isLoaded("python")).toBe(false);
    expect(highlightLine("python", "def f(): pass")).toEqual([{ text: "def f(): pass", cls: null }]);
  });

  describe("with grammars loaded", () => {
    beforeAll(() => Promise.all([loadLang("ts"), loadLang("rust"), loadLang("json")]));

    it("a TypeScript line: keyword, function, string, number, comment, type; text round-trips", () => {
      const line = 'export const n: number = fmt("x", 42); // hi';
      const spans = highlightLine("ts", line);
      expect(join(spans)).toBe(line);
      expect(of(spans, "keyword")).toEqual(["export", "const"]);
      expect(of(spans, "function")).toEqual(["fmt"]);
      expect(of(spans, "string")).toEqual(['"x"']);
      expect(of(spans, "number")).toEqual(["42"]);
      expect(of(spans, "comment")).toEqual(["// hi"]);
      expect(of(spans, "type")).toEqual(["number"]);
    });

    it("a Rust line", () => {
      const line = "pub fn walk(repo: &Repository) -> Result<Vec<Oid>, GitError> {";
      const spans = highlightLine("rust", line);
      expect(join(spans)).toBe(line);
      expect(of(spans, "keyword")).toEqual(["pub", "fn"]);
      expect(of(spans, "function")).toContain("walk");
      expect(of(spans, "type")).toEqual(expect.arrayContaining(["Repository", "Result", "Vec", "Oid", "GitError"]));
    });

    it("unknown language / empty line passes through as plain text", () => {
      expect(highlightLine(null, "let x = 1;")).toEqual([{ text: "let x = 1;", cls: null }]);
      expect(highlightLine("ts", "")).toEqual([]);
      expect(highlightLine(null, "")).toEqual([]);
    });

    it("returns the cached array on a repeat and bounds the cache", () => {
      const a = highlightLine("ts", "const cached = true;");
      expect(highlightLine("ts", "const cached = true;")).toBe(a);
      for (let i = 0; i < 5200; i++) highlightLine("json", `{"k": ${i}}`);
      expect(_cacheSize()).toBeLessThanOrEqual(5000);
    });
  });
});
