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
    expect(validateRefName("a/")).toMatch(/start or end/);
    expect(validateRefName("a~1")).toMatch(/Must not contain/);
    expect(validateRefName("a@{1}")).toMatch(/Must not contain/);
    expect(validateRefName("x.lock")).toBe("Invalid name");
    expect(validateRefName("HEAD")).toBe("HEAD is reserved");
  });

  it("rejects names already taken", () => {
    expect(validateRefName("main", ["main", "dev"])).toBe("main already exists");
    expect(validateRefName("main2", ["main", "dev"])).toBeNull();
  });
});
