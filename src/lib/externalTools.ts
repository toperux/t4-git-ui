// Premade external diff / merge tools (GitExtensions' Git Config page): git's own tool name, where
// to look for the executable, and the argument line each one wants. Data only — the search runs in
// Rust (`find_tool`), and `$LOCAL` / `$REMOTE` / `$BASE` / `$MERGED` are substituted there too.
import type { ToolKind } from "../api/types";

export interface ToolTemplate {
  /** git's name for the tool (`difftool.<id>.cmd`). */
  id: string;
  label: string;
  /** Names to look up on PATH (the Rust side adds `.exe` / `.cmd` on Windows). */
  exe: string[];
  /**
   * Install paths relative to the search roots (Program Files, LOCALAPPDATA on Windows; /usr/bin,
   * /usr/local/bin, /opt, /Applications on unix) — the Windows ones first, then the executable
   * inside the macOS app bundle.
   */
  dirs: string[];
  diffArgs: string;
  mergeArgs: string;
  /** Windows-only tools, hidden from the picker elsewhere (a stored one still loads). */
  windowsOnly?: true;
}

export const TOOLS: ToolTemplate[] = [
  {
    id: "kdiff3",
    label: "KDiff3",
    exe: ["kdiff3"],
    dirs: ["KDiff3/kdiff3.exe", "KDiff3.app/Contents/MacOS/kdiff3"],
    diffArgs: '"$LOCAL" "$REMOTE"',
    mergeArgs: '"$BASE" "$LOCAL" "$REMOTE" -o "$MERGED"',
  },
  {
    id: "bc",
    label: "Beyond Compare",
    exe: ["bcomp", "bcompare"],
    dirs: ["Beyond Compare 5/BComp.exe", "Beyond Compare 4/BComp.exe", "Beyond Compare.app/Contents/MacOS/bcomp"],
    diffArgs: '"$LOCAL" "$REMOTE"',
    mergeArgs: '"$LOCAL" "$REMOTE" "$BASE" "$MERGED"',
  },
  {
    id: "p4merge",
    label: "P4Merge",
    exe: ["p4merge"],
    dirs: ["Perforce/p4merge.exe", "p4merge.app/Contents/MacOS/p4merge"],
    diffArgs: '"$LOCAL" "$REMOTE"',
    mergeArgs: '"$BASE" "$LOCAL" "$REMOTE" "$MERGED"',
  },
  {
    id: "winmerge",
    label: "WinMerge",
    exe: ["WinMergeU"],
    dirs: ["WinMerge/WinMergeU.exe"],
    windowsOnly: true,
    diffArgs: '-e -u "$LOCAL" "$REMOTE"',
    mergeArgs: '-e -u -dl Local -dr Remote "$LOCAL" "$REMOTE" "$MERGED"',
  },
  {
    id: "tortoisemerge",
    label: "TortoiseGitMerge",
    exe: ["TortoiseGitMerge", "TortoiseMerge"],
    dirs: ["TortoiseGit/bin/TortoiseGitMerge.exe", "TortoiseSVN/bin/TortoiseMerge.exe"],
    windowsOnly: true,
    diffArgs: '"$LOCAL" "$REMOTE"',
    mergeArgs: '/base:"$BASE" /mine:"$LOCAL" /theirs:"$REMOTE" /merged:"$MERGED"',
  },
  {
    id: "vscode",
    label: "VS Code",
    exe: ["code"],
    dirs: ["Programs/Microsoft VS Code/Code.exe", "Microsoft VS Code/Code.exe", "Visual Studio Code.app/Contents/Resources/app/bin/code"],
    diffArgs: '--wait --diff "$LOCAL" "$REMOTE"',
    mergeArgs: '--wait --merge "$LOCAL" "$REMOTE" "$BASE" "$MERGED"',
  },
  {
    id: "vscodium",
    label: "VSCodium",
    exe: ["codium"],
    dirs: ["Programs/VSCodium/VSCodium.exe", "VSCodium/VSCodium.exe", "VSCodium.app/Contents/Resources/app/bin/codium"],
    diffArgs: '--wait --diff "$LOCAL" "$REMOTE"',
    mergeArgs: '--wait --merge "$LOCAL" "$REMOTE" "$BASE" "$MERGED"',
  },
  {
    id: "meld",
    label: "Meld",
    exe: ["meld"],
    dirs: ["Meld/Meld.exe", "Meld.app/Contents/MacOS/Meld"],
    diffArgs: '"$LOCAL" "$REMOTE"',
    mergeArgs: '"$LOCAL" "$BASE" "$REMOTE" --output "$MERGED"',
  },
  {
    id: "araxis",
    label: "Araxis Merge",
    exe: ["compare"],
    dirs: ["Araxis/Araxis Merge/Compare.exe", "Araxis Merge.app/Contents/Utilities/compare"],
    diffArgs: '/wait /2 "$LOCAL" "$REMOTE"',
    mergeArgs: '/wait /merge /3 "$REMOTE" "$BASE" "$LOCAL" "$MERGED"',
  },
  {
    id: "diffmerge",
    label: "DiffMerge",
    exe: ["sgdm"],
    dirs: ["SourceGear/Common/DiffMerge/sgdm.exe", "DiffMerge.app/Contents/MacOS/DiffMerge"],
    diffArgs: '"$LOCAL" "$REMOTE"',
    mergeArgs: '--merge --result="$MERGED" "$LOCAL" "$BASE" "$REMOTE"',
  },
];

export const IS_WINDOWS = /Windows/.test(navigator.userAgent);
export const IS_MAC = /Mac/.test(navigator.userAgent);

/** The templates the picker offers here: the Windows-only ones are not installable elsewhere. */
export const TEMPLATES = TOOLS.filter((t) => IS_WINDOWS || !t.windowsOnly);

/** Select value for a tool that is not one of the templates (its name and command are free text). */
export const CUSTOM = "custom";

/** The `.cmd` written to git config — the same shape GitExtensions writes. */
export const command = (path: string, args: string) => `"${path}" ${args}`;

export const templateArgs = (t: ToolTemplate, kind: ToolKind) => (kind === "diff" ? t.diffArgs : t.mergeArgs);

/** A configured tool's display name: the template's label, or the stored name itself. */
export const toolLabel = (name: string) => TOOLS.find((t) => t.id === name)?.label ?? name;
