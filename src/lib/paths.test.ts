import { describe, expect, it } from "vitest";
import { baseName, isAbsolutePath, joinPath, parentDir, prettyUrl, repoNameFromUrl } from "./paths";

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

  it("gives the child's `/` the parent's separator — a submodule path under a Windows repo", () => {
    expect(joinPath("C:\\src\\work", "vendor/lib")).toBe("C:\\src\\work\\vendor\\lib");
    // Only `/`: on a unix parent a backslash is a character of the name, not a separator.
    expect(joinPath("/home/me", "my\\repo")).toBe("/home/me/my\\repo");
  });

  it("parentDir strips the last segment", () => {
    expect(parentDir("C:\\src\\repo")).toBe("C:\\src");
    expect(parentDir("/home/me/repo/")).toBe("/home/me");
    expect(parentDir("C:")).toBe("C:");
  });

  it("parentDir keeps a root's separator — `c:` and `` are not absolute paths", () => {
    expect(parentDir("c:\\work")).toBe("c:\\");
    expect(parentDir("C:/work")).toBe("C:/");
    expect(parentDir("/work")).toBe("/");
    // A root is its own parent.
    expect(parentDir("c:\\")).toBe("c:\\");
    expect(parentDir("/")).toBe("/");
    expect(parentDir("repo")).toBe("repo");
    // A UNC share root: dropping the share would leave `\\server`, which is not a path.
    expect(parentDir("\\\\server\\share")).toBe("\\\\server\\share");
    expect(parentDir("\\\\server\\share\\")).toBe("\\\\server\\share\\");
    expect(parentDir("\\\\server\\share\\repo")).toBe("\\\\server\\share");
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

describe("isAbsolutePath", () => {
  it("takes a drive root, a POSIX root or a UNC path, not a bare or dotted name", () => {
    // The roots `parentDir` hands back count too — they are where a clone or a worktree may land.
    for (const p of ["C:\\src", "c:/src", "/home/x", "\\\\server\\share", "c:\\", "C:/", "/"]) expect(isAbsolutePath(p)).toBe(true);
    for (const p of ["src", "./src", "../src", "C:src", "Program Files/Git/home", "~/clones", ""]) expect(isAbsolutePath(p)).toBe(false);
  });
});
