import { describe, expect, it } from "vitest";
import { joinPath, parentDir, repoNameFromUrl } from "./cloneUrl";

describe("repoNameFromUrl", () => {
  it("takes the last segment minus .git", () => {
    expect(repoNameFromUrl("https://github.com/x/repo.git")).toBe("repo");
    expect(repoNameFromUrl("git@github.com:x/repo")).toBe("repo");
    expect(repoNameFromUrl("https://github.com/x/repo/")).toBe("repo");
    expect(repoNameFromUrl("file:///C:/tmp/bare.git")).toBe("bare");
    expect(repoNameFromUrl("C:\\src\\bare.git\\")).toBe("bare");
    expect(repoNameFromUrl("")).toBe("");
  });
});

describe("joinPath / parentDir", () => {
  it("keeps the parent's separator and never doubles it", () => {
    expect(joinPath("C:\\src", "repo")).toBe("C:\\src\\repo");
    expect(joinPath("C:\\Users\\me\\", "repo")).toBe("C:\\Users\\me\\repo");
    expect(joinPath("/home/me", "repo")).toBe("/home/me/repo");
    expect(joinPath("", "repo")).toBe("repo");
  });

  it("parentDir strips the last segment", () => {
    expect(parentDir("C:\\src\\repo")).toBe("C:\\src");
    expect(parentDir("/home/me/repo/")).toBe("/home/me");
    expect(parentDir("C:")).toBe("C:");
  });
});
