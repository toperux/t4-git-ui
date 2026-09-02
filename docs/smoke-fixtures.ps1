# Builds the repositories docs/smoke-test.md section 0 needs, in one command:
#
#   pwsh -File docs/smoke-fixtures.ps1            # into C:\tmp\t4
#   pwsh -File docs/smoke-fixtures.ps1 -Force     # rebuild it from scratch
#   pwsh -File docs/smoke-fixtures.ps1 D:\t4      # somewhere else
#   pwsh -File docs/smoke-fixtures.ps1 -RemotesOnly   # add the extra remotes to a fixture that
#                                                     # predates them, keeping everything else
#
# It makes three things:
#   bare.git  a bare "remote"
#   work      history with a branch, a merge, a tag, one commit that is not pushed
#             yet (section 5 pushes it), the odd files the diff viewer is checked
#             against - CRLF, binary, no trailing newline - a 25 000-line diff and a
#             300-file commit for the section 7 checks, branches sitting on commits
#             for the section 5 context-menu checks, hunks.txt modified in the
#             working tree, in three hunks, for the staging checks, and the data the
#             post-v1 checklist (docs/smoke-test-post-v1.md) names: a `conflict`
#             branch, nested branch names, a folder-chain commit, a CRLF file with a
#             working-tree hunk, a deleted and an untracked file
#   other     a second clone of bare.git, for the divergence checks in section 5
# plus two extra remotes on work: `nowhere` (a path that doesn't exist) and `slow`
# (bare.git behind an upload-pack that sleeps a minute), for the failed / cancelled
# op checks in section 5.

[CmdletBinding()]
param(
    [string] $Root = 'C:\tmp\t4',
    [switch] $Force,
    [switch] $RemotesOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# git reports failure through its exit code, which PowerShell does not raise on its own.
function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)] [string[]] $Arguments)

    & git @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') exited with $LASTEXITCODE"
    }
}

# Set-Content would add a trailing newline and, on 5.1, a BOM; these files are byte-exact
# on purpose. .NET resolves relative paths against its own working directory, so every
# path handed to it below is absolute.
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
function Write-Text {
    param([string] $Path, [string] $Text)

    [System.IO.File]::WriteAllText($Path, $Text, $utf8NoBom)
}

# `throw` on a precondition would bury one line of advice under a page of PowerShell's
# error formatting; these two are for whoever is running the walkthrough to read.
function Stop-WithMessage {
    param([string] $Message)

    [Console]::Error.WriteLine($Message)
    exit 1
}

if ($RemotesOnly) {
    if (-not (Test-Path -LiteralPath (Join-Path $Root 'work'))) {
        Stop-WithMessage "$Root has no fixture to add remotes to - build one first"
    }
} elseif (Test-Path -LiteralPath $Root) {
    if (-not $Force) {
        Stop-WithMessage "$Root already exists - remove it, name another path, or pass -Force"
    }
    Write-Host "replacing $Root"
    Remove-Item -LiteralPath $Root -Recurse -Force
}

New-Item -ItemType Directory -Path $Root -Force | Out-Null
$Root = (Resolve-Path -LiteralPath $Root).Path
$work = Join-Path $Root 'work'
$bare = Join-Path $Root 'bare.git'
# git takes either separator, but a backslash in a remote URL is easy to mangle later.
$bareUrl = $bare -replace '\\', '/'

# Two remotes for the failed / cancelled op checks in section 5: `nowhere`, a path that
# does not exist (local, so it fails at once instead of waiting on DNS), and `slow`, bare.git
# again but served through an upload-pack that sleeps first, so a fetch from it hangs long
# enough to be cancelled. Quoted so git hands the command to sh instead of trying to exec
# a .sh file itself.
function Add-ExtraRemotes {
    Invoke-Git -C $work remote add nowhere (Join-Path $Root 'does-not-exist')
    $slowPack = Join-Path $Root 'slow-upload-pack.sh'
    Write-Text $slowPack "#!/bin/sh`nsleep 60`nexec git upload-pack `"`$@`"`n"
    Invoke-Git -C $work remote add slow $bareUrl
    Invoke-Git -C $work config remote.slow.uploadpack "sh `"$($slowPack -replace '\\', '/')`""
}

if ($RemotesOnly) {
    foreach ($name in 'nowhere', 'slow') {
        # Absent on a fixture that predates them; `remove` says so on stderr, harmlessly.
        & git -C $work remote remove $name 2>$null
    }
    Add-ExtraRemotes
    Write-Host "added remotes nowhere and slow to $work"
    exit 0
}

Invoke-Git init -q --bare -b main $bare
Invoke-Git init -q -b main $work

# Off, or git rewrites crlf.txt to LF on the way into the index and the committed blob
# has no CR left for the diff viewer to mark (section 3). Git for Windows ships this as
# `true` and plenty of people set `input`; either one hides the marker.
Invoke-Git -C $work config core.autocrlf false
Invoke-Git -C $work remote add origin $bareUrl
Add-ExtraRemotes

Write-Text (Join-Path $work 'a.txt') "one`n"
Invoke-Git -C $work add .
Invoke-Git -C $work commit -qm 'first'

Invoke-Git -C $work switch -qc feature
Write-Text (Join-Path $work 'a.txt') "one`ntwo`n"
Invoke-Git -C $work commit -qam 'feature edit'

Invoke-Git -C $work switch -q main
Write-Text (Join-Path $work 'b.txt') "main`n"
Invoke-Git -C $work add .
Invoke-Git -C $work commit -qm 'main edit'

Invoke-Git -C $work tag v0.1.0
Invoke-Git -C $work merge -q feature -m 'merge feature'

# Thirty lines so an edit can put changes far enough apart to stay separate hunks: git merges
# two changes closer together than twice the context (3 lines each side) into one.
$lines = 1..30 | ForEach-Object { 'line {0:d2}' -f $_ }
Write-Text (Join-Path $work 'hunks.txt') (($lines -join "`n") + "`n")
Invoke-Git -C $work add .
Invoke-Git -C $work commit -qm 'hunks fixture'

# Section 7 without a large clone: one commit whose diff passes the viewer's 20 000-line cap
# (big.txt, 25 000 lines, so the truncation banner has something to show) and one that touches
# 300 files, so the file list has enough rows to have to scroll.
$big = 1..25000 | ForEach-Object { "line $_" }
Write-Text (Join-Path $work 'big.txt') (($big -join "`n") + "`n")
Invoke-Git -C $work add big.txt
Invoke-Git -C $work commit -qm 'big diff (25 000 lines)'
$many = Join-Path $work 'many'
New-Item -ItemType Directory -Path $many | Out-Null
1..300 | ForEach-Object { Write-Text (Join-Path $many ('{0:d3}.txt' -f $_)) "file $_`n" }
Invoke-Git -C $work add many
Invoke-Git -C $work commit -qm 'many files (300)'

Invoke-Git -C $work push -q -u origin main

# Section 5 pulls on a branch whose upstream is named something else, so both branches have to
# exist and differ - otherwise following the name and following the upstream look the same. The
# two commits are made on throwaway branches off feature and pushed under the names the check
# wants; only the remote-tracking refs are kept.
Invoke-Git -C $work switch -qc feature-upstream feature
Write-Text (Join-Path $work 'upstream.txt') "from the upstream branch`n"
Invoke-Git -C $work add .
Invoke-Git -C $work commit -qm 'upstream branch commit'
Invoke-Git -C $work push -q origin feature-upstream

Invoke-Git -C $work switch -qc feature-decoy feature
Write-Text (Join-Path $work 'decoy.txt') "from the same-named branch`n"
Invoke-Git -C $work add .
Invoke-Git -C $work commit -qm 'decoy branch commit'
Invoke-Git -C $work push -q origin feature-decoy:feature

Invoke-Git -C $work switch -q main
# Long option names: PowerShell swallows a bare `-D` on its way to the argument list.
Invoke-Git -C $work branch --delete --force feature-upstream feature-decoy | Out-Null
Invoke-Git -C $work branch --set-upstream-to=origin/feature-upstream feature | Out-Null

# The commit context menu's branch items (section 5): what it offers depends on which branches sit
# on the row.
#   reset-me      two commits off main, pushed with an upstream: "Reset reset-me to here…" moves it
#                 back one, then origin/reset-me on the tip row offers to put it back
#   twin-a/-b     one commit with two local branches and origin/twin-remote (no local one), so
#                 Checkout shows a picker instead of a single entry
#   origin/solo   a remote branch with no local counterpart: checked out as a new tracking local
Invoke-Git -C $work switch -qc reset-me
Write-Text (Join-Path $work 'reset.txt') "one`n"
Invoke-Git -C $work add .
Invoke-Git -C $work commit -qm 'reset fixture 1'
Write-Text (Join-Path $work 'reset.txt') "one`ntwo`n"
Invoke-Git -C $work commit -qam 'reset fixture 2'
Invoke-Git -C $work push -q -u origin reset-me

Invoke-Git -C $work switch -qc twin-a main
Write-Text (Join-Path $work 'twins.txt') "three branches sit here`n"
Invoke-Git -C $work add .
Invoke-Git -C $work commit -qm 'twins (three branches here)'
Invoke-Git -C $work branch twin-b
Invoke-Git -C $work push -q origin twin-a:twin-remote

Invoke-Git -C $work switch -qc solo main
Write-Text (Join-Path $work 'solo.txt') "only on the remote`n"
Invoke-Git -C $work add .
Invoke-Git -C $work commit -qm 'solo (remote only)'
Invoke-Git -C $work push -q origin solo

Invoke-Git -C $work switch -q main
Invoke-Git -C $work branch --delete --force solo | Out-Null

# docs/smoke-test-post-v1.md needs a few more things:
#   conflict              changes conflict.txt one way while main changes it the other, so merging
#                         it conflicts (group H and section 5's merge) and so does rebasing it onto
#                         main - the ours / theirs labels are checked in both directions
#   topic/nested          a local branch with a `/`; origin/topic/on-origin a remote one (group A's
#                         sidebar folders, the same folder name in both sections). Each has a commit of its own, or an equal tip would
#                         earn main a `merged` badge
#   'nested folders'      a commit with a single-child folder chain (examples/exclude/schema) and a
#                         two-file folder (src/), for the details-pane tree (group E); the same
#                         files are edited in the working tree below for the commit-panel tree,
#                         crlf-hunks.txt gets a working-tree hunk (group F), gone.txt is deleted
#                         from the working tree (group G)
Write-Text (Join-Path $work 'conflict.txt') "base`n"
Invoke-Git -C $work add .
Invoke-Git -C $work commit -qm 'conflict base'
Invoke-Git -C $work switch -qc conflict
Write-Text (Join-Path $work 'conflict.txt') "the conflict branch's line`n"
Invoke-Git -C $work commit -qam 'conflict branch side'
Invoke-Git -C $work switch -q main
Write-Text (Join-Path $work 'conflict.txt') "main's line`n"
Invoke-Git -C $work commit -qam 'main side of the conflict'

Invoke-Git -C $work switch -qc topic/nested
Write-Text (Join-Path $work 'topic.txt') "a branch in a folder`n"
Invoke-Git -C $work add .
Invoke-Git -C $work commit -qm 'topic/nested (folder branch)'
Invoke-Git -C $work switch -qc feature-nested main
Write-Text (Join-Path $work 'nested.txt') "a remote branch in a folder`n"
Invoke-Git -C $work add .
Invoke-Git -C $work commit -qm 'origin/topic/on-origin (remote folder branch)'
Invoke-Git -C $work push -q origin feature-nested:topic/on-origin
Invoke-Git -C $work switch -q main
Invoke-Git -C $work branch --delete --force feature-nested | Out-Null

$chain = Join-Path $work 'examples\exclude\schema'
New-Item -ItemType Directory -Path $chain | Out-Null
Write-Text (Join-Path $chain 'tables.txt') "deep down a chain of single folders`n"
New-Item -ItemType Directory -Path (Join-Path $work 'src\lib') | Out-Null
Write-Text (Join-Path $work 'src\a.txt') "src a`n"
Write-Text (Join-Path $work 'src\lib\b.txt') "src lib b`n"
Write-Text (Join-Path $work 'gone.txt') "deleted from the working tree later`n"
$crlfLines = 1..10 | ForEach-Object { 'crlf {0:d2}' -f $_ }
Write-Text (Join-Path $work 'crlf-hunks.txt') (($crlfLines -join "`r`n") + "`r`n")
Invoke-Git -C $work add .
Invoke-Git -C $work commit -qm 'nested folders'
# Keep "one commit not pushed yet" true: everything up to here goes out, 'odd files' below stays.
Invoke-Git -C $work push -q origin main

Write-Text (Join-Path $work 'crlf.txt') "x`r`ny`r`n"
Write-Text (Join-Path $work 'nonl.txt') 'no newline'
$binary = [byte[]] (@(0, 1, 2) + [System.Text.Encoding]::ASCII.GetBytes('binary'))
[System.IO.File]::WriteAllBytes((Join-Path $work 'blob.bin'), $binary)

Invoke-Git -C $work add .
Invoke-Git -C $work commit -qm 'odd files'

# The one thing here that silently does nothing when a filter is in the way. Compare byte
# counts rather than reading the blob back: PowerShell splits a native command's output
# into lines and drops the terminators, so the CRs would vanish on the way in.
$onDisk = [System.IO.File]::ReadAllBytes((Join-Path $work 'crlf.txt')).Length
$committed = [int] (Invoke-Git -C $work cat-file -s 'HEAD:crlf.txt')
if ($committed -ne $onDisk) {
    Stop-WithMessage "crlf.txt lost its CRs on the way into the index ($onDisk bytes on disk, $committed committed) - core.autocrlf is overriding us"
}

# The working-tree change section 4 stages: three changes, far enough apart to arrive as three
# hunks - one that edits a line and adds one, one that only re-indents (section 3's whitespace
# toggle has something to hide), and one that deletes. Left uncommitted on purpose.
$edited = [System.Collections.Generic.List[string]]::new()
foreach ($line in $lines) {
    switch ($line) {
        'line 02' { $edited.Add('line 02 edited'); $edited.Add('line 02b') }
        'line 15' { $edited.Add('    line 15') }
        'line 28' { }
        default { $edited.Add($line) }
    }
}
Write-Text (Join-Path $work 'hunks.txt') (($edited -join "`n") + "`n")

$hunkCount = @(Invoke-Git -C $work diff --unified=3 -- hunks.txt | Where-Object { $_ -like '@@*' }).Count
if ($hunkCount -ne 3) {
    Stop-WithMessage "hunks.txt came out as $hunkCount hunks, expected 3 - the edits drifted too close together"
}

# The rest of the working tree the post-v1 checklist looks at: two edited files under src/ (a
# folder to collapse), an untracked file at the bottom of a single-folder chain (one tree row,
# `deep / one / two`), a deleted file, and one CRLF line changed so crlf-hunks.txt shows a hunk
# whose discard has to keep the CRs.
Write-Text (Join-Path $work 'src\a.txt') "src a edited`n"
Write-Text (Join-Path $work 'src\lib\b.txt') "src lib b edited`n"
New-Item -ItemType Directory -Path (Join-Path $work 'deep\one\two') | Out-Null
Write-Text (Join-Path $work 'deep\one\two\z.txt') "untracked, three folders down`n"
Remove-Item -LiteralPath (Join-Path $work 'gone.txt')
$crlfEdited = $crlfLines | ForEach-Object { if ($_ -eq 'crlf 05') { 'crlf 05 edited' } else { $_ } }
Write-Text (Join-Path $work 'crlf-hunks.txt') (($crlfEdited -join "`r`n") + "`r`n")

Invoke-Git clone -q $bareUrl (Join-Path $Root 'other')

$commits = Invoke-Git -C $work rev-list --count HEAD
Write-Host ''
Write-Host "ready - open $work in the app"
Write-Host "  work   $commits commits, the last one not pushed yet"
Write-Host '         hunks.txt is modified in the working tree, in three hunks'
Write-Host '         feature tracks origin/feature-upstream, while origin/feature is someone else'
Write-Host '         reset-me, twin-a/twin-b/origin/twin-remote and origin/solo are the commit-menu branches'
Write-Host '         "big diff" and "many files" are the section 7 commits'
Write-Host '         conflict conflicts with main; topic/nested and origin/topic/on-origin are the folder branches'
Write-Host '         src/ is edited, deep/one/two/z.txt untracked, gone.txt deleted, crlf-hunks.txt has a CRLF hunk'
Write-Host '  other  second clone, for the divergence checks in section 5'
