import { describe, expect, it } from "vitest";
import { validateRefName } from "./branchName";

describe("validateRefName", () => {
  it("accepts ordinary names", () => {
    for (const n of ["main", "feature/lane-graph", "v1.0.0", "fix-123", "a.b"]) expect(validateRefName(n)).toBeNull();
  });

  it("rejects the documented shapes", () => {
    expect(validateRefName("")).toBe("Enter a name");
    expect(validateRefName("a b")).toBe("No spaces");
    expect(validateRefName("-x")).toBe("Must not start with -");
    expect(validateRefName("a..b")).toBe("Must not contain ..");
    expect(validateRefName("a/")).toMatch(/end with \//);
    expect(validateRefName("a~1")).toMatch(/Must not contain/);
    expect(validateRefName("a@{1}")).toBe("Must not contain @{");
    expect(validateRefName("x.lock")).toBe("No part may end with .lock");
    expect(validateRefName("HEAD")).toBe("HEAD is reserved");
  });

  it("rejects the rest of check-ref-format", () => {
    expect(validateRefName("@")).toBe("@ is reserved");
    expect(validateRefName(".hidden")).toBe("No part may start with .");
    expect(validateRefName("feat/.hidden")).toBe("No part may start with .");
    expect(validateRefName("feat/x.lock")).toBe("No part may end with .lock");
    expect(validateRefName("a//b")).toBe("Must not contain //");
    expect(validateRefName("/a")).toMatch(/start or end with \//);
    expect(validateRefName("a.")).toBe("Must not end with .");
    expect(validateRefName("a\\b")).toMatch(/Must not contain/);
    expect(validateRefName("a\x01b")).toMatch(/Must not contain/);
    expect(validateRefName("a^b")).toMatch(/Must not contain/);
    expect(validateRefName("a[b")).toMatch(/Must not contain/);
    // `@` is only reserved on its own.
    expect(validateRefName("release@2")).toBeNull();
  });

  it("rejects names already taken", () => {
    expect(validateRefName("main", ["main", "dev"])).toBe("main already exists");
    expect(validateRefName("main2", ["main", "dev"])).toBeNull();
  });
});
