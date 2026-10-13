# Rewrite Every Commit Message Plan

> **Status (2026-10-13): parked by the owner, not run.** A rewrite can't make the old commits unreachable: GitHub
> keeps `refs/pull/4..26/head`, which the owner can't delete, and they keep up to 430 old commits (443 Claude
> lines, PRs #24–#26) fetchable and viewable by URL; only GitHub Support can purge them. So the owner kept only the
> rules for future commits: step 0's `CLAUDE.md` section (its topic bullet widened to any commit with several
> topics, each topic a body line under a summary for the whole commit, none if the summary says it all; its
> attribution bullet reworded; its exemption widened to GitHub's merge commits, beyond ruling n) and the release
> skill's steps 3 and 7 (rulings c and h) were committed on their own, and the owner turned Claude Code's
> attribution off in the user settings. Open-items §AK holds the reopen trigger.
>
> Where the review stood: passes found 15 issues and 4 questions (pass 1, rulings a–d), 14 and 4 (pass 2, e–h),
> 10 and 4 (pass 3, i–l), 11 and 2 (pass 4, m–n), 10 and 1 (pass 5, o), 9 and 2 (pass 6, p–q), all fixed and
> re-rehearsed here. Pass 7 found 12 more. One is settled: rule 3 vs the `CLAUDE.md` wording, now that `CLAUDE.md`
> gives any commit with several topics a line per topic. The other 11 aren't fixed: (1) step 5c's `am` names no
> patch file; (2) 5c's patches all number `0001`, and when to re-apply them is unclear; (3) a folded patch is left
> behind after a step-0 message redo; (4) that redo's key swap has no command; (5) its amend contradicts "nothing is
> committed during steps 1–7"; (6) step 8 adds no open-items rows; (7) step 3 doesn't create `<RW>/chunks`; (8) a
> rollback drops step 8's commit; (9) no Dependabot re-check after the push; (10) the work-folder list is
> incomplete; (11) step 0's status edit is ambiguous. Its two questions (how to record Claude Code's own trailer
> instruction, one cumulative 5c patch or numbered) are unanswered. Ruling e also gets a §Q row once the plan runs.
> The scripts were in `F:\src\_ pet projects\t4-git-ui-rewrite\rw\`, a folder the owner deleted on 2026-10-14; a run
> rewrites them from *Scripts* below. Every count, hash and date below is as of 2026-10-13 and has to be re-measured
> before any run.

**Goal:** every commit message loses its Claude trailers and gets shorter: a one-line summary, then a body of 1–2
lines, or none if the summary says it all. A squashed commit gets one line per topic, with a blank line between
topics. Each tag ends up on the rewritten copy of the commit it marks today. The force-push starts no CI or release
build. The commit rules go into `CLAUDE.md`.

**Spec:** the owner, 2026-10-13, relayed from the md-viewer session: "remove all claude trailers in the commit
messages and make them more concise main/first line for a concise summary then just a few lines after. ideally 1-2
lines but if it is a squashed commit, 1 line per "topic" is fine, separated by a space each"; "if the commit can be
described in just the first line then no detail lines are needed"; "without triggering all the builds/actions again
but still keep the tags in the proper commits"; "add the commit rules to claude.md too".

## How this repo differs from md-viewer

- **Release notes don't come from commit messages.** `release.yml:635` sets `generate_release_notes: true`; GitHub
  builds that list from merged pull requests, and `.github/release.yml` says so in as many words. So there is no
  release-notes regex to protect and no rebuild of release notes from new summaries (md-viewer's R5 and its step 6b
  don't apply).
- **Conventional-commit prefixes.** 413 of 469 summaries start with `type:` or `type(scope):` (`docs` 129, `fix` 126,
  `feat` 43, `ci` 18, plus `test`, `perf`, `build(deps)`, `style`, `chore`, `refactor`, one `design:`, two
  `deps(…)`, and scoped forms). The other 56: 33 `Bump the version to x.y.z` (the release skill, step 3), 3 merges,
  and 20 early commits (2026-08-31 to 09-06), some with milestone labels such as `M1 UI:` or `M6:`.
- **Tags mark bump commits**, except `v0.1.0`, which marks `b88ddef docs(plan): …`. `Bump the version to 0.1.1`
  (`9f7443f`) has no tag: v0.1.1 was withdrawn.
- **6 release pages cite old commit hashes** in hand-written notes: v0.10.13–v0.10.18, 61 short hashes in all (D5).
- **A local-only tag holds 20 commits off `main`** (D4).

## Current state (main at 1fc2384)

- 469 commits across all refs:
  - 449 on `main`, with 3 merges (`9a05e23` PR #4, `a5f41d1` PR #5, `5cc5de9` PR #18).
  - 20 reachable only from the local tag `ignore-these-commits` (at `aa1bb94`, 2026-09-12, branching from `7a31e19`):
    a pre-squash line of docs/fix/test commits. It isn't on GitHub.
- 34 tags locally:
  - 33 `v*` tags, all on GitHub and equal to the local ones, one Release each; none is a draft or prerelease.
    Titles are `T4 Git UI vX.Y.Z`.
  - 7 annotated (`v0.1.0`, `v0.1.2`, `v0.1.3`, `v0.7.0`, `v0.10.0`, `v0.10.4`, `v0.10.5`), none signed, no Claude
    lines in their messages. 26 lightweight.
  - `ignore-these-commits` (lightweight), only on this PC. It mustn't be pushed.
- Claude trailers: 455 `Co-Authored-By: Claude …` lines (Opus 5.5: 205, Fable 5.1: 124, Fable 5: 68, Opus 5: 56,
  Sonnet 5: 2) in 453 commits, 2 of them with two; 24 `Claude-Session:` lines.
- Other trailers to keep: 10 `Co-authored-by: dependabot[bot]`, 12 `Signed-off-by:`.
- Body length, trailers and blank lines not counted (469 commits): none 58, 1–3 lines 72, 4–10 lines 207, 11–35
  lines 116, 36+ lines 16. Bump commits' bodies are `- ` bullet lists today.
- Summary length: 16–720 characters, median 67; 167 are over 72 and 50 over 100.
- 15 commits are signed by GitHub: the 12 Dependabot commits and the 3 merges. Rewriting their ancestors changes
  their hashes, so all 15 lose their "Verified" badge; git and filter-repo drop the signature on their own. All 15
  messages have no final newline, and all 15 are left untouched.
- 27 hash mentions inside messages name a commit in this repo; each names an ancestor of the commit that mentions
  it, so filter-repo can translate every one. 6 of them sit in, and point into, the `ignore-these-commits` line.
- No stash, extra worktree, non-UTF-8 message, `encoding` header, empty message or CR byte in a message. One clean
  checkout.
- Workflows:
  - `CI` (`ci.yml`): push to `main` and pull requests to `main`, except when only `docs/**` and `**/*.md` change.
  - `Release` (`release.yml`): push of a `v*` tag. Its `build` legs also wait for the owner's approval (the
    `signing` environment), but `version` and `checks` would run unapproved.
  - `Checks` (`checks.yml`): `workflow_call` only; it runs only when CI or Release calls it.
  - `Dependabot Updates`: GitHub's, not ours to turn off.
  - No `release:` or `workflow_run` trigger anywhere.
- GitHub, checked with `gh api`:
  - Ruleset *Protect release tags* (`refs/tags/v*`): blocks deletion and update. *Protect main*: deletion,
    non-fast-forward, pull request. Both have the admin bypass, `current_user_can_bypass: always`.
  - Immutable releases off. No open pull request, no webhook, no Pages site, no fork.
  - `refs/pull/4..26/head` stay on GitHub and keep some old commits reachable there.
  - 33 releases, 503 assets in all. v0.10.19's body holds CR bytes (not one 6b edits).
- Old hashes in tracked files: 572 mentions of a commit in this repo (`docs/archive` 316, `docs/plans` 217,
  `docs/smoke` 38, `.claude` 1).
- Clones: this PC; the Windows VM (`test-pc`, `C:\src\t4-git-ui`); the Linux VM (`topher-ubuntu-vm`,
  `/home/toperux/src/t4-git-ui`); the Mac (a local clone, path not yet checked). WSL's clone was removed after use.
- `git-filter-repo` 2.47.0 is installed as a Python module (Python 3.14.7). It translates hashes in a message at
  L3950 and calls the commit callback at L4108.

## Rules for a new message

The rules for future commits go into `CLAUDE.md` → "Commit messages" (step 0; wording below). The rewrite follows
the same rules, plus 5 and 6:

1. The summary is a plain sentence with no full stop at the end. Aim for 72 characters; never go over 100.
   - `feat:` and `fix:` say what changed for someone using the app, not which code changed (D3).
   - Every other type just says what changed.
   - After the colon, the first word is lowercase unless it's a name, an acronym or a code identifier (D3).
2. Keep each commit's `type:` or `type(scope):` prefix exactly, every milestone label (`M1 UI:`, `M6:` …) exactly
   (ruling b), and every `Bump the version to x.y.z` summary as it is. Add no prefix to the 20 early unprefixed
   commits; they keep sentence case (D3).
3. The body:
   - None, if the summary says it all.
   - Otherwise 1–2 lines.
   - A squash, a `Bump the version` commit or step 0's commit (several topics in one) gets one line per topic,
     each at most 72 characters, with a blank line between topics and no `- ` bullets (ruling a).
   - Lines wrap at 72.
4. Remove every `Co-Authored-By: Claude …` and `Claude-Session: …` line, and any other AI attribution line. No
   line may mention `claude` or `anthropic` in any case, except the file name `CLAUDE.md`, `claude-md` in a file name
   and `.claude/` paths (ruling g). Keep every other trailer, verbatim, after a blank line.
5. Don't touch the 3 merges, the 12 Dependabot commits or the 7 annotated tags' own messages.
6. Don't invent facts: the new message only shortens the old one, and the writer doesn't read the diff. A commit
   hash may stay or go, but no new one appears; step 5 translates those that stay.

## Scripts

Written and rehearsed in this session's scratchpad (see *Rehearsal*), and copied byte-identical to `<RW>/rw/` (ruling
m); the real run uses that copy. Every step-0 hash argument, and every hash in a push lease, is the full 40-character
hash: the scripts refuse a short one, and a lease can't parse a short hash of a commit the repo doesn't hold
(measured).

- `export.py <mirror> <messages.json>`: step 2.
- `chunks.py split <mirror> <messages.json> <dir> <n> <step-0 hash>` and
  `chunks.py merge <messages.json> <dir> <n> <step-0 hash> <new-messages.json>`: step 3's hand-out and merge.
- `check3.py <messages.json> <new-messages.json> <step-0 hash>`: step 3's checks. `FAIL` lines break a rule (exit 1);
  `LIST` lines go to the owner.
- `review.py gen <mirror> <messages.json> <new-messages.json> <review.md> <step-0 hash>` and
  `review.py read <review.md> <new-messages.json>`: step 4.
- `apply.py <new-messages.json> <work>`, then `verify.py <mirror> <work> <messages.json> <new-messages.json>`: step 5.
- `mapcommit.py <mirror> <work>`: step 5b, with its own checks.
- `swap6b.py <releases-before.json> <commit-map.txt> <outdir>`: step 6b.
- `relcheck.py <releases-before.json> <releases-after.json> [<6b outdir>]`: steps 6 and 6b.
- `bodies.py <releases-before.json> <outdir> <tag>...`: writes saved release bodies byte-exact; the rollback of 6b.
- `dummy.py`: the rehearsal's stand-in for the scribes; not used in the real run. In rehearsal, `none` stands in for
  the step-0 hash.

**Work folder** (ruling j): `F:\src\_ pet projects\t4-git-ui-rewrite\` (below, `<RW>`), outside the repo and outside
Temp, so the work survives a new session and the mirror stays as the only copy of the old history. It holds `rw/`
(the scripts), `mirror.git`, `work/`, the JSON files, `chunks/`, `review.md` and `6b/`. It stays until the owner
deletes it. In every command, `<RW>` is written out in full and quoted (`"F:/src/_ pet projects/t4-git-ui-rewrite"`),
for output files too: an agent's working directory is the real repo, so a relative path would write into it.

All Python runs from Git Bash with `python -I`, except `apply.py`, which needs the user site-packages for
`git_filter_repo` and so runs as plain `python`. Files the scripts read are written by the scripts or by Git Bash
redirection, never through PowerShell, which re-encodes text.

## Steps

From step 1 until step 7, nothing is committed to this PC's repo. The rewrite works from a frozen copy, and step 7
resets this repo to the result.

0. **Sync, then commit first.** `git fetch origin`, then check that `main`, `origin/main` and GitHub's `main`
   (`git ls-remote origin refs/heads/main`) are the same commit, and that `git status` is clean apart from this plan
   (untracked). If not, stop and ask the owner. Then one local `docs:` commit, following the new rules and with no
   trailer, holding:
   - the `CLAUDE.md` section below
   - this plan
   - the release skill's step 3 (`.claude/skills/release/SKILL.md:111`), its body clause changed to "body: one line
     per topic that landed since the last tag, as `CLAUDE.md` → *Commit messages* says" (ruling c)
   - the release skill's step 7 (`SKILL.md:163`): "generates them from the commits" becomes "generates them from the
     merged pull requests" (ruling h)

   Its message comes through the rewrite unchanged; its hash still changes, because its parent does.
   Before committing, set this plan's status line to "final; executing from step 0" with the date; nothing else in
   the plan changes until step 8.
   → check, by hand, on the message part of `git cat-file commit main` (not `%B`, which adds a blank line): rules
   1, 3 and 4 (summary ≤100 with no full stop; body lines ≤72, no bullets, one blank line between topics, none at
   the end; no AI mention beyond `CLAUDE.md`; no trailer). Otherwise amend it before step 1.
1. **Freeze a copy.** The scripts are already in `<RW>/rw/` (copied 2026-10-13 on the owner's word, ruling m).
   ```
   git clone --mirror "F:/src/_ pet projects/t4-git-ui" "<RW>/mirror.git"
   git -C "<RW>/mirror.git" update-ref refs/old/github-main refs/remotes/origin/main
   git -C "<RW>/mirror.git" remote remove origin
   ```
   Every later step reads the old history from the mirror. `refs/old/github-main` keeps GitHub's `main` as of step
   0 (`git remote remove` on a mirror deletes `refs/remotes/origin/*`, measured). Removing the remote means no fetch
   in the mirror can ever overwrite the old history, which after step 7 lives only here. `remote remove` prints a note
   suggesting `git branch -d main`: expected, don't follow it.
   → check: the mirror's `main` = this repo's `main` (step 0's commit); `refs/old/github-main` = this repo's
   `origin/main`; 34 tags; `rev-list --all --count` = 470; `git -C "<RW>/mirror.git" remote` prints nothing.
2. **Export:** `export.py` writes `messages.json`: one entry per commit reachable from `main` or a `v*` tag (450;
   `ignore-these-commits` is left out, D4), with the raw message from `git cat-file commit` (not `%B`, which changes
   trailing newlines), and whether it's a merge or a Dependabot commit.
   → check: 450 commits, 15 untouched.
3. **Rewrite** (D1). `chunks.py split … 6 <step-0 hash>` writes `chunk-1.json` … `chunk-6.json` (about 73 commits
   each, oldest first, step 0's commit and the 15 untouched ones left out; never `none` outside rehearsal). Six
   `scribe` agents (Sonnet) run in parallel; each reads the rules above and its `chunk-N.json`
   (`{full hash: old message}`) and writes `out-N.json` with the same keys and the new messages. `chunks.py merge`
   checks each `out-N.json` holds exactly its chunk's keys, adds step 0's message as it is, and writes
   `new-messages.json`. `check3.py` then checks:
   - the keys are exactly the exported commits minus the 15 untouched ones (435)
   - step 0's message is unchanged
   - each prefix or milestone label is the same as the old one; each `Bump the version` summary is unchanged
   - each summary is ≤100 characters, not empty after its prefix, with no trailing full stop
   - a blank line follows the summary when there's a body; no body line over 72; no `- ` or `* ` bullet
   - a body over 2 lines has one line per topic
   - no line with leading or trailing whitespace; never two blank lines in a row
   - each message ends with exactly one `\n` and holds no `\r`
   - no line mentions `claude` or `anthropic`, except as rule 4 allows (ruling g)
   - every other `Co-authored-by:` and `Signed-off-by:` line of the old message is still there
   - no hex string that isn't in the old message
   - listed for the owner: an uppercase first word after a prefix, and every topic count

   A scribe whose output fails gets its `FAIL` lines back and rewrites `out-N.json`; repeat until `check3.py`
   exits 0.
4. **Owner review.** `review.py gen` writes `<RW>/review.md`: every commit in history order, oldest
   first, the old message and the new one in four-backtick blocks, flagged `UNTOUCHED`, `STEP0` (must stay as it
   is), `BUMP` or `LONG` (old body over 10 lines). That's 434 rewritten messages to review, plus step 0's (D1). The
   owner edits only inside the `new <hash>` blocks; `review.py read` puts the edits back into `new-messages.json`,
   and `check3.py` runs again. Repeat until the owner is done and it exits 0.
5. **Apply** in `git clone --no-local "<RW>/mirror.git" "<RW>/work"`:
   - `git -C "<RW>/work" tag -d ignore-these-commits` first (D4), so filter-repo neither rewrites nor keeps its 20
     commits.
     → check: 33 tags, 450 commits (`rev-list --all`).
   - `apply.py` imports `git_filter_repo` and runs it in the work clone:
     - `fr.FilteringOptions.default_options()`; no `--force` (it skips the freshness check) and no `--refs` (it
       means no gc and keeps `origin`).
     - `fr.RepoFilter(args, commit_callback=cb).run()`.
     - `cb(commit, metadata)` changes only commits in `new-messages.json`, looked up by `commit.original_id`. It sets
       the new message as UTF-8 bytes and translates old hashes in it with
       `re.sub(rb'(\b[0-9a-f]{7,40}\b)', metadata['commit_rename_func'], msg)`. Other commits keep the message
       filter-repo already holds, its hashes already translated.
   - Why not the CLI `--commit-callback`: filter-repo translates hashes in a message before the callback runs, so a
     message replaced there keeps the old hashes, and the CLI doesn't expose the rename function.
     `--message-callback` doesn't get the commit, so it can't be keyed by hash.
   - filter-repo removes `origin`: add it back with
     `git -C "<RW>/work" remote add origin https://github.com/toperux/t4-git-ui.git`.
   - `verify.py` (output saved as `<RW>/verify.txt`) checks, the old side read from the mirror:
     - `new-messages.json` holds exactly the exported commits minus the 15 untouched ones
     - the commit map covers all 450 exported commits, and the new history is exactly the map's new side
     - each pair has the same tree, author and committer (dates included), and the new parents are the old
       parents' new copies
     - each new message is exactly the reviewed one with its hashes translated; no hash in it still names an old
       commit; each untouched message is byte-identical
     - each of the 33 tags points at the new copy of its old commit (from the map, not by tree); each annotated tag
       keeps its tagger and message
     - `main` is the new copy of the mirror's `main`
     - no line in the history mentions `claude` or `anthropic`, except as rule 4 allows
   - Expected noise: `.git/filter-repo/suboptimal-issues` lists hex that names no commit here: upstream hashes in
     Dependabot messages, Actions run IDs, and hashes of commits squashed away before 2026-09-21. They stay as they
     are.
   - Any re-run (after a failed check or an owner edit) starts from a fresh `--no-local` clone of the mirror; a
     second `apply.py` in the same clone would be a filter-repo continuation on already-rewritten commits.
5b. **Map commit** (D2): `mapcommit.py` (output saved as `<RW>/mapcommit.txt`) writes `docs/notes/commit-map.txt`
    (a header line, then `<old> <new>` per line, 450 pairs), adds a `notes/` entry to `docs/README.md`, and commits
    both as `docs: map old commit hashes to their rewritten ones`, with no trailer.
    → its checks: the parent is the new copy of the mirror's `main`, the message is exact, only those 2 files
    changed, every new hash resolves, and no line in the history mentions `claude` or `anthropic` beyond rule 4.
5c. **Change review** (ruling i; `CLAUDE.md` workflow step 5). A fresh reviewer agent checks the work clone against
    this plan: `verify.txt` and `mapcommit.txt` (not a re-run: after 5b, `verify.py` fails by design, since the
    history has one more commit), a sample of the new `git log` (bump commits and squashes included), the 33 tags,
    and step 0's diff (`CLAUDE.md`, the plan, the skill). Review again after each fix until a pass finds nothing.
    Skipped findings and limits go to the owner, as the workflow says. A fix goes (ruling o):
    - **A message in `new-messages.json`:** back through steps 4–5b. Delete `<RW>/work` first (a clone into a
      non-empty folder fails), clone afresh, and save `verify.txt` and `mapcommit.txt` again.
    - **Step 0's content** (`CLAUDE.md`, the plan, the skill): a follow-up `docs:` commit in `<RW>/work` on top of
      5b's, following the rules, no trailer. Save it at once as a patch,
      `git -C "<RW>/work" format-patch -1 -o "<RW>/5c"` (ruling q), and re-apply it with `git -C "<RW>/work" am`
      after any later redo rebuilds the work clone. Before step 6, give its message step 0's hand check, and scan
      the whole history once more:
      `git -C "<RW>/work" log --all --format=%B | sed -E 's/CLAUDE\.md|claude-md|\.claude\///g' | grep -ciE 'claude|anthropic'`
      must print 0. Step 6 compares GitHub with the work clone, so it covers that commit.
    - **Step 0's own message:** amend step 0 in this PC's repo, delete `<RW>/mirror.git` and `<RW>/work`, and redo
      steps 1–2 only, not 3: `chunks.py merge` would rebuild `new-messages.json` from the scribes' files and lose
      the owner's step-4 edits. Copy `new-messages.json` aside first, swap step 0's old key for the new full hash
      (its value is the new message), run `check3.py` with that hash, `review.py gen` again, then steps 5–5c. A
      saved 5c patch is folded into the amend instead, since step 0 is being remade anyway.
6. **Push from the work clone, only on the owner's go.** `<RW>` below stands for
   `"F:/src/_ pet projects/t4-git-ui-rewrite"`, written out in full in every command (see *Scripts*).
   - Save, in Git Bash:
     - `gh api repos/toperux/t4-git-ui/releases --paginate > "<RW>/releases-before.json"` (one JSON array of 33:
       bodies, drafts, targets, asset names and sizes)
     - `gh run list -R toperux/t4-git-ui -L 20 --json databaseId,workflowName,event,createdAt > "<RW>/runs-before.json"`
     - `gh api repos/toperux/t4-git-ui/releases/latest --jq .tag_name` (today `v0.10.23`), noted in
       `<RW>/record.md`
   - Check that GitHub hasn't moved since step 1; if any of these fails, stop and ask the owner:
     - `git -C "<RW>/work" ls-remote origin refs/heads/main 'refs/tags/v*'`, tabs turned into spaces and sorted:
       the `main` line's hash is the mirror's `git -C "<RW>/mirror.git" rev-parse refs/old/github-main`
       (`1fc2384f…` today; step 0's commit is local only), and the `v*` lines equal
       `git -C "<RW>/mirror.git" show-ref -d | grep ' refs/tags/v'`, sorted
     - `git -C "<RW>/work" ls-remote --heads origin` lists only `main`, plus any `dependabot/…` branch that backs an
       open Dependabot pull request
     - `gh pr list -R toperux/t4-git-ui --state open` is empty, or holds only Dependabot pull requests. One opened on
       the old history would, once merged, bring the old commits back. The push still goes ahead; afterwards, on the
       owner's go, comment `@dependabot recreate` on each so Dependabot rebuilds it on the new history (ruling f).
       That force-pushes its branch and starts one CI run on the pull request once CI is back on (ruling k).
   - Turn the workflows off and confirm:
     ```
     gh workflow disable CI -R toperux/t4-git-ui
     gh workflow disable Release -R toperux/t4-git-ui
     gh workflow list -R toperux/t4-git-ui --all   # CI and Release: disabled_manually
     ```
   - Push, the lease on GitHub's `main` as the check found it, as the full 40-character hash:
     ```
     git -C "<RW>/work" push --atomic --force-with-lease=main:<full hash> origin main '+refs/tags/v*:refs/tags/v*'
     ```
   - Wait about 5 minutes (a Monitor wait, not a foreground `sleep`), save
     `gh run list -R toperux/t4-git-ui -L 20 --json databaseId,workflowName,event,createdAt > "<RW>/runs-after.json"`,
     and check it holds no CI or Release run that isn't in `runs-before.json`. If one is there, ask the owner
     (recommendation: `gh run cancel <id> -R toperux/t4-git-ui`). Then turn the workflows back on:
     ```
     gh workflow enable CI -R toperux/t4-git-ui
     gh workflow enable Release -R toperux/t4-git-ui
     ```
     Turn them back on even if the push fails. Every command names its repo and path in full, since shell
     variables don't carry over between Bash calls.
   - Why it's safe:
     - The lease: if anyone pushed to `main` since the check, GitHub's `main` isn't that hash and the push is
       refused. `+` on the tag refspec forces only the tags. `--atomic`: every ref or none, so a refused ref can't
       leave `main` rewritten under old tags, or the reverse.
     - `refs/tags/v*` pushes the 33 release tags and leaves `ignore-these-commits` out.
     - GitHub creates no push event when more than 3 tags are pushed at once (GitHub's docs; not tested here), and
       the new `main` differs from the old tip only in `docs/**` and `*.md`. Both are reasons nothing should start;
       the disable is the safeguard, and the wait covers events GitHub handles after the push returns (reasoned).
   - Checks:
     - `git -C "<RW>/work" ls-remote origin refs/heads/main 'refs/tags/v*'` (tabs turned into spaces, sorted)
       equals `git -C "<RW>/work" show-ref -d | grep -E ' refs/(heads/main|tags/v)'` (sorted; `^{}` lines
       included, `refs/remotes/origin/main` left out by the pattern)
     - `gh api repos/toperux/t4-git-ui/releases --paginate > "<RW>/releases-after.json"`, then
       `python -I "<RW>/rw/relcheck.py" "<RW>/releases-before.json" "<RW>/releases-after.json"`: every release's tag,
       title, draft, prerelease, target, body, and asset names and sizes are unchanged
     - the Latest release is still the same tag
     - If a check fails, stop and ask the owner. A release field can be put back with `gh release edit`; how GitHub
       releases react to force-updated tags hasn't been measured here (Risks).
   - **Rollback**, only on the owner's word:
     - Workflows off and confirmed, as above. Then, with the lease on the new `main` as a full hash:
       ```
       git -C "<RW>/mirror.git" push --atomic --force-with-lease=main:<full hash> https://github.com/toperux/t4-git-ui.git refs/old/github-main:refs/heads/main '+refs/tags/v*:refs/tags/v*'
       ```
       Then the same wait and workflows on, the runs saved as `<RW>/runs-rollback.json` (the forward push's files
       stay as they are).
     - Check: GitHub's `main` is the mirror's `refs/old/github-main`, and its `v*` lines equal the mirror's (the
       pre-push commands); once the bodies are back, `gh api … --paginate > "<RW>/releases-rollback.json"` and
       `relcheck.py "<RW>/releases-before.json" "<RW>/releases-rollback.json"` passes.
     - If 6b ran:
       ```
       python -I "<RW>/rw/bodies.py" "<RW>/releases-before.json" "<RW>/restore" v0.10.13 v0.10.14 v0.10.15 v0.10.16 v0.10.17 v0.10.18
       for t in v0.10.13 v0.10.14 v0.10.15 v0.10.16 v0.10.17 v0.10.18; do gh release edit $t -R toperux/t4-git-ui --notes-file "<RW>/restore/$t.md"; done
       ```
     - If step 7 ran: the other clones run step 7 again. This PC instead takes the mirror's `main` (step 0's commit
       on the old history), the old `v*` tags and the dropped tag back (a plain fetch leaves the tags on the
       rewritten commits, and `fetch --tags` refuses to move them; measured):
       ```
       git -C "F:/src/_ pet projects/t4-git-ui" fetch "<RW>/mirror.git" main '+refs/tags/v*:refs/tags/v*' refs/tags/ignore-these-commits:refs/tags/ignore-these-commits
       git -C "F:/src/_ pet projects/t4-git-ui" checkout -B main FETCH_HEAD
       git -C "F:/src/_ pet projects/t4-git-ui" fetch origin
       ```
     - Rehearsed against a bare copy: every `main` and `v*` ref came back to the mirror's.
6b. **Release pages** (D5), only on the owner's go. `swap6b.py` writes the bodies of v0.10.13–v0.10.18 from
    `releases-before.json` into `<RW>/6b/`, each old hash swapped for the same length of its new one from the map and
    nothing else changed, as bytes. It refuses an old hash that matches more than one commit, a new prefix that does,
    or a saved body that differs from the live page. Titles aren't touched. No workflow has a `release:` trigger.
    ```
    mkdir -p "<RW>/6b"
    python -I "<RW>/rw/swap6b.py" "<RW>/releases-before.json" "<RW>/work/docs/notes/commit-map.txt" "<RW>/6b"
    for t in v0.10.13 v0.10.14 v0.10.15 v0.10.16 v0.10.17 v0.10.18; do gh release edit $t -R toperux/t4-git-ui --notes-file "<RW>/6b/$t.md"; done
    gh api repos/toperux/t4-git-ui/releases --paginate > "<RW>/releases-6b.json"
    python -I "<RW>/rw/relcheck.py" "<RW>/releases-before.json" "<RW>/releases-6b.json" "<RW>/6b"
    gh api repos/toperux/t4-git-ui/releases/latest --jq .tag_name
    ```
    → check: `relcheck.py` passes (each edited body equals its file; everything else is unchanged), and the Latest
    release is still the same tag.
7. **Reset the clones.** On each clone:
   - Check for unpushed work: `git status`, `git log origin/main..` on every branch, `git stash list`. Move anything
     worth keeping to this PC's work first. On this PC, step 0's commit shows up there; that's expected, its rewritten
     copy is on GitHub.
   - `git fetch --force --prune --prune-tags origin`, then `git checkout -B main origin/main` (it resets `main`
     whichever branch was checked out). `--prune-tags` deletes local tags GitHub doesn't have, so on this PC it
     removes `ignore-these-commits` (D4); its 20 commits then live only in the mirror, until the mirror is removed.
   - `git for-each-ref refs/heads refs/tags`: delete every branch other than `main` whose commits aren't in the new
     history (a stale branch, pushed later, would bring the old commits and their Claude lines back).
   - The Windows VM, the Linux VM and the Mac are reset by their own Remote Control sessions, sent these steps by
     SendMessage (ruling l). The VM sessions' classifiers deny network fetches, so the owner runs or approves the
     fetch there. The Mac session first reports its clone's path, or that it has none.
8. **Record** (ruling p). During steps 1–7 the notes go to `<RW>/record.md`, not the plan, so this PC's tracked
   plan stays as step 0 committed it and step 7's checkout has nothing to overwrite. After step 7, on this PC: an
   *Execution record* section at the end of this plan (what ran, the check outputs, the Latest release before and
   after, the clones reset, anything skipped), the status line set to "executed", the plan moved to
   `docs/archive/plans/`, and the `docs/README.md` archive line updated. One local `docs:` commit, following the
   rules, no trailer. It's docs-only, so CI's paths filter skips it. Its push needs its own go from the owner.

## Risks

- **Old history stays fetchable on GitHub** (ruling e, accepted): `refs/pull/4..26/head` can't be deleted by the
  owner. `refs/pull/26/head` alone reaches 430 old commits with 443 Claude lines (419 `Co-Authored-By`, 24
  `Claude-Session`); anyone can fetch it, and old commit URLs keep working. `main` and the tags are clean. Reopen
  if the owner wants them purged: only GitHub Support can remove pull request refs.
- **Old hashes in docs** (572 mentions) and in memory files: they no longer name a commit in the history. The map
  (D2) keeps them traceable.
- **Tag protection:** the bypass is reported by the API but untested on a tag update here. If refused, `--atomic`
  leaves the remote as it was: turn the workflows back on and look at the rules.
- **Signed commits:** 15 GitHub-signed commits lose "Verified". No tag is signed.
- **Releases under force-updated tags:** untested in this repo and in md-viewer (which hasn't run its rewrite). The
  release objects name tags, not commits, so they should follow (reasoned); `relcheck.py` after the push is the
  measurement, and step 6 says what to do if it fails.
- **Repo moving underneath:** locally, the frozen mirror and no commits between steps 1 and 7; on GitHub, the sync
  check in step 0, the pre-push check and the lease on `main` (step 6).
- **Release v0.1.0's `target_commitish`** names the old full hash `b88ddef…`. GitHub uses it only when the tag is
  missing, and the tag stays.
- **Claude Code's own attribution:** the harness tells each session to end commits with a `Co-Authored-By: Claude`
  line. The new `CLAUDE.md` rule overrides it, but a session that misses the rule adds it again. Turning it off in
  Claude Code's settings is the owner's call, outside this plan.

## Rehearsal (D6, 2026-10-13)

In this session's scratchpad, on a mirror of `1fc2384` (449 commits on `main` and `v*` tags, since there's no step 0
commit yet):

- `export.py`: 449 commits, 15 untouched.
- `check3.py`: on the dummy messages (old minus Claude lines) it fails on length, bullets and multi-line topics, as
  it should. On a valid set (each summary cut to 100, trailers kept) it passes, 0 `FAIL`. On a copy with one message
  removed, a bullet and a made-up hash added, it reports exactly those 3.
- `review.py`: `gen` then `read` with no edits leaves `new-messages.json` byte-identical.
- `apply.py` on the valid set: ran without `--force` (the `--no-local` clone passed filter-repo's freshness check)
  and removed `origin`. `verify.py`: all checks pass. `98c04ff` in `2d31fba`'s message came out as its new hash, and
  `verify.py` fails on a tampered message.
- `mapcommit.py`: 449 pairs, all checks pass, 2 files changed.
- Push to a bare copy of the mirror with `ignore-these-commits` and the non-`main` refs removed (like GitHub):
  `--atomic --force-with-lease=main:<old> … '+refs/tags/v*:refs/tags/v*'` left its `main` and `v*` refs equal to
  the work clone's, with no `ignore-these-commits`; the 7 annotated tags were rewritten as new tag objects. With the
  bare copy's `main` moved and `v0.9.0` put back, the same push was refused (`stale info`, `atomic push failed`)
  and neither ref changed.
- `swap6b.py` on the real releases (saved read-only with `gh api`): 61 hashes swapped on the 6 pages, all
  unambiguous, the rest of each body byte-identical, each saved body equal to the live page.
- After pass 2:
  - `chunks.py`: split into 6 chunks (73 × 5, 69), the valid set handed back as `out-N.json`, merge equals the
    valid set.
  - `check3.py`: still 0 `FAIL` on the valid set. On a copy with an empty summary, an empty `fix: `, a trailing
    space, a quadruple newline, `Generated with [Claude Code]`, a Fable co-author with an anthropic address and a
    `CLAUDE.md` / `.claude/skills` mention, it fails the first six and passes the last.
  - The whole chain again (apply, verify with the `main` check, mapcommit with the mirror, leased push): all pass,
    refs match.
  - `relcheck.py`: live releases against `releases-before.json` pass; with the 6b files and the pages not yet
    edited, it fails exactly the 6 bodies.
- After pass 3: `chunks.py split` with a real full hash as step 0 left it out of every chunk (73 × 5, 68);
  `check3.py` refuses a short step-0 hash.
- After pass 4: on a copy of the mirror, `git remote remove origin` alone deleted `refs/remotes/origin/main`;
  saving it as `refs/old/github-main` first kept it, left no remote and all 469 commits. The rollback push from that
  copy (`refs/old/github-main:refs/heads/main` and the `v*` tags, leased on the new `main`) to the bare copy holding
  the rewritten history put every `main` and `v*` ref back to the mirror's.
- After pass 5: `bodies.py` wrote v0.10.13, v0.10.18 and v0.10.19 (the one with CR bytes) from
  `releases-before.json`, and `relcheck.py` with those files as the 6b folder passed: byte-exact.

## Owner rulings (2026-10-13)

- **D1. Who drafts, who reviews:** Sonnet `scribe` agents draft; the owner reviews all 434 side by side, plus step
  0's, which must stay as it is (step 4).
- **D2. Map file:** commit `docs/notes/commit-map.txt` (step 5b). Files already in history stay as they are.
- **D3. Summary voice and form:** `feat:`/`fix:` are written for someone using the app, other types just say what
  changed. Prefixes stay as they are; the 20 early unprefixed commits get none. The first word after the colon is
  lowercase unless it's a name, an acronym or a code identifier.
- **D4. `ignore-these-commits`:** dropped. Its 20 commits aren't rewritten (step 5) and the tag is deleted on this PC
  (step 7); the mirror holds them until it's removed.
- **D5. Release pages:** swap the 61 old hashes on the 6 pages for their new ones, nothing else (step 6b).
- **D6. Rehearsal:** the scripts run on a scratchpad clone during plan review, with stand-in messages. Nothing is
  pushed or committed to this repo.
- **D7. `CLAUDE.md` wording:** as drafted below.
- **a. Topic lines:** one line per topic, at most 72 characters, no bullets.
- **b. Milestone labels** (`M1 UI:`, `M6:` …) on the early commits stay verbatim, like a prefix.
- **c. Release skill:** step 3's body clause points at the `CLAUDE.md` rule (step 0).
- **d. Type list:** `design:` and `deps:` stay out of the `CLAUDE.md` list; the rewrite keeps them where they are.
- **e. Pull request refs:** accepted that old history stays fetchable through `refs/pull/*`; no GitHub Support
  request (Risks).
- **f. A Dependabot pull request open at push time:** push anyway, then `@dependabot recreate` on the owner's go
  (step 6).
- **g. AI mentions:** any line mentioning `claude` or `anthropic` fails, except `CLAUDE.md`, `claude-md` and
  `.claude/` paths (rule 4).
- **h. Release skill step 7:** "from the commits" becomes "from the merged pull requests" (step 0).
- **i. Change review:** a fresh reviewer pass on the work clone before the push go (step 5c), as `CLAUDE.md`'s
  workflow says, not the owner's message review standing in for it.
- **j. Work folder:** `F:\src\_ pet projects\t4-git-ui-rewrite\`, kept until the owner deletes it.
- **k. Dependabot recreate:** one CI run on a recreated Dependabot pull request is accepted (step 6).
- **l. Other clones:** the Windows VM, Linux VM and Mac sessions reset their own clones (step 7).
- **m. Scripts:** copied to `<RW>/rw/` now, before the go, so they outlive this session.
- **n. Dependabot exemption:** the `CLAUDE.md` section says Dependabot's own commits are exempt.
- **o. A step-5c fix to step 0:** its content gets a follow-up `docs:` commit in the work clone; only a wrong step-0
  message means amending step 0 and redoing steps 1–2.
- **p. Execution record:** a section at the end of this plan, then the plan is archived; one `docs:` commit after
  step 7, pushed on its own go (step 8).
- **q. A 5c follow-up commit:** saved as a patch in `<RW>/5c` and re-applied after any redo of the work clone.

### Draft `CLAUDE.md` section

Superseded: the committed wording is in `CLAUDE.md` → *Commit messages* (see the status block).

```
## Commit messages

- **Summary line:** `type: summary` or `type(scope): summary`, a plain sentence with no full stop at the end. Aim
  for 72 characters; never go over 100.
  - `feat:` and `fix:` say what changed for someone using the app, not which code changed.
  - Other types (`docs:`, `test:`, `ci:`, `build:`, `perf:`, `refactor:`, `style:`, `chore:`) just say what changed.
  - After the colon, start lowercase unless the first word is a name, an acronym or a code identifier.
  - A release commit is `Bump the version to x.y.z` (the release skill).
- **Body:**
  - None, if the summary line says it all.
  - Otherwise 1–2 lines.
  - A squashed commit, or a release commit, gets one line per topic, at most 72 characters, with a blank line
    between topics and no bullets.
  - Wrap lines at 72 characters.
- **No AI attribution:** no `Co-Authored-By: Claude` trailer, no `Claude-Session:` line, nor any other.
- Dependabot's own commits (`<type>(deps…): Bump …`) are exempt.
```
