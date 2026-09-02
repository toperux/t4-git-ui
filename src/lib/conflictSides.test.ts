import { describe, expect, it } from "vitest";
import { sideLabel, sideName } from "./conflictSides";

describe("sideLabel", () => {
  it("names the branch the backend put on the side", () => {
    const sides = { ours: "main", theirs: "feature" };
    expect(sideLabel(sides, "ours")).toBe("Keep main's version");
    expect(sideLabel(sides, "theirs")).toBe("Keep feature's version");
  });

  it("falls back to git's own words, with no possessive to mangle", () => {
    expect(sideLabel(null, "ours")).toBe("Keep our version");
    expect(sideLabel(undefined, "theirs")).toBe("Keep their version");
  });
});

describe("sideName", () => {
  it("is what the confirmation puts before ’s version", () => {
    expect(sideName({ ours: "main", theirs: "feature" }, "theirs")).toBe("feature");
    expect(sideName(null, "ours")).toBe("our side");
    expect(sideName(null, "theirs")).toBe("their side");
  });
});
