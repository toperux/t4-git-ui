import { describe, expect, it } from "vitest";
import { baseName, joinPath, parentDir, prettyUrl, repoNameFromUrl } from "./paths";

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

describe("baseName / prettyUrl", () => {
  it("baseName takes the last segment", () => {
    expect(baseName("C:\\src\\repo\\")).toBe("repo");
    expect(baseName("/home/me/repo")).toBe("repo");
    expect(baseName("repo")).toBe("repo");
  });

  it("prettyUrl drops scheme, git@ and .git", () => {
    expect(prettyUrl("https://github.com/x/y.git")).toBe("github.com/x/y");
    expect(prettyUrl("git@github.com:x/y.git")).toBe("github.com:x/y");
    expect(prettyUrl("ssh://host/x/y")).toBe("host/x/y");
    expect(prettyUrl("file:///C:/tmp/t4/bare.git")).toBe("C:/tmp/t4/bare");
    expect(prettyUrl("file://server/share/bare.git")).toBe("server/share/bare");
    // Only a drive letter loses the third slash; a POSIX clone URL keeps its absolute path.
    expect(prettyUrl("file:///home/u/bare.git")).toBe("/home/u/bare");
  });
});
