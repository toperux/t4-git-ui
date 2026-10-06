# The restore hang's diagnosis, and the AZ re-walks — 2026-10-06

Jobs 4–6 diagnose "a restored second window sometimes never starts" (`docs/plans/open-items.md` §O) and "on X11
with no window manager, a `main` saved bigger than the screen can launch stuck on the start spinner" (§Q, T26).
Job 4 ran on the Linux VM's main checkout at `6bffe6d`; jobs 5–7 at `cc6d58f`, jobs 5 and 6 against a throwaway
timing patch (never committed, logging only). Then the re-walks the owner asked for: job 7 (Linux, `cc6d58f`) and
the Windows AZ row 3 re-walk.

## Job 4 — the first measurement

Linux VM, main `6bffe6d`, `.smoke` debug build, Xvfb `:99` 1600×1000, no window manager.

Rates over the probes run: restore 0/50, second launch 0/30, detach 1/34 (a racy probe, undercounted — see job 5),
detach under gdb 0/30, tear-off 0/43 (1 miss: a drag that made no window, the accepted T24), WebDriver restore 0/30.

T26 (a `main` saved bigger than the screen): 10/10 stalled on a direct launch, and 2/2 under gdb. The trigger is
window area: 1650×1050 loaded, 1700×1100 stalled — a threshold between 1.73 and 1.87 Mpx, not "the further past
the screen, the more likely" as first guessed. Under gdb: the main thread was waiting on an X reply
(`XGetWindowProperty`, `net_wm_hint`) — not a deadlock — with Xvfb at about 92% CPU.

Cold first launches (cache not yet warm, cause assumed): a restore took 13.23 s; a gdb-run detach took 6.96 s.

## Job 5 — the timing patch, 150 detaches

Linux VM, `cc6d58f`, the same Xvfb. gdb never reproduced job 4's detach hang; the owner chose option A, the plan's
own fallback for that case: a throwaway build that logs each step of the window spawn (lines prefixed `HANG`), and
150 direct detaches. Result: 107 OK, 33 kind
A (~22%, a stall after every Rust step completed), 10 kind B (Ctrl+Shift+N never reached `spawn`).

- **Kind A.** Every Rust step finishes on normal timings (enter → thread done, about 43 ms median); `w1` never
  calls `take_pending` within 20 s. Xvfb sits at 261–269/300 CPU ticks, the app itself about 46, both
  `WebKitWebProcess`s 27–33; a screenshot of `main` is blank; `w1` is on the spinner; pressing F5 in `main` doesn't
  release it (0/29). One run released on its own at 32.6 s, cause unknown. Same signature as T26.
- **OK runs' timings:** thread done → `take_pending` median 977 ms (394 ms – 2.6 s); key → both titles shown
  median 1.42 s.
- **Job 4's probe was racy:** its two separate title searches could both match `main` while its title flipped
  from `work` to `other`, which counted as OK (run 10 did, although `w1` never called `take_pending`). Job 4's
  detach rate (1/34) therefore undercounted; by how much is unmeasured.
- **Kind B.** Everything idle; whether XTEST's key reached the page was not determined.

Files are on the Linux VM only (`scratchpad/hang/j5-*.log`, `j5/run-N.log`, `j5-gaps.txt`, `shots/j5-*.png`); the
VM's `.claude/worktrees/hang` worktree was kept for job 6; the patched binary sat in the VM main checkout's
`target/debug` (rebuilt from clean `cc6d58f` after job 6).

## Job 6 — a real desktop and a window manager

Linux VM, the same patched binary, scratch `HOME`, job 5's probe, direct launches. The owner chose option A: try a real
desktop, then a window manager under Xvfb, before touching code. Focus with a window manager uses
`xdotool windowactivate --sync` (`_NET_ACTIVE_WINDOW`), not `windowfocus`; windows are found with `search --pid`.

**Part 1, the VM's live desktop.** GNOME Shell 50.1 (mutter), Ubuntu 26.04, Wayland session; the app runs under
Xwayland on `:0` with `GDK_BACKEND=x11` (set as the AppImage sets it; native Wayland was not tried — `xdotool` can't
drive it and neither `ydotool` nor `wtype` was available). 150 runs: 150 OK, 0 kind A, 0 kind B.

| min / median / max | build | theme | enter→done | done→`take_pending` | key→both titles | Xwayland CPU, 1 s after a run |
|---|---|---|---|---|---|---|
| ms unless noted | 36.7/43.1/51.6 | 3.2/4.1/48.8 | 41.5/48.6/92.9 | 366/415/573 | 0.70/0.74/0.82 s | mean 0.1, max 2 /100 |

Aside: 1 of 2 trial runs before the 150 took 18.6 s key → both titles up; `spawn` was entered 19.6 s after
`main`'s `take_pending`, so the delay sat before Rust ever saw the key (maybe the first window activation); it did
not recur.

**Part 2, Xvfb `:99` 1600×1000×24 + openbox 3.6.1** (unpacked with `apt-get download` + `dpkg -x` into the
scratchpad, `LD_LIBRARY_PATH` pointed at it; nothing installed system-wide; `_NET_SUPPORTING_WM_CHECK` read back
"Openbox"; the recipe is in `smoke-linux.md`'s openbox subsection). 150 runs: 150 OK, 0 kind A, 0 kind B.

| min / median / max | build | theme | enter→done | done→`take_pending` | key→both titles | Xvfb CPU, 1 s after a run |
|---|---|---|---|---|---|---|
| ms unless noted | 33.6/37.0/55.0 | 3.1/3.6/32.0 | 38.2/41.7/70.1 | 358/385/442 | 1.02/1.11/1.45 s | 0 after every run |

For contrast, job 5's bare Xvfb: done → `take_pending` median 977 ms, and Xvfb CPU stayed at mean 31, max 62/100
even after OK runs.

**Move test, bare Xvfb:** unmap + map released a stuck kind-A page 4 of 4 times within about 0.5 s (including at
33–48 s after the Rust thread finished); `windowmove 200 200` released 0 of 2; an untouched control got nothing in
48 s
(then a remap freed it). A bare Xvfb reused after openbox failed 15 of 25 runs, mostly kind B, so a bare-Xvfb row
that follows an openbox one gets a fresh Xvfb.

**Measured:** kind A happened 0/300 with a window manager (real desktop or openbox) vs 33/150 bare; with a window
manager the X server stays idle and the page loads in about 0.4 s. **Not measured:** native Wayland, other desktop
environments, why a remap helps. **Reasoned, unverified:** without a window manager, a new window's first
map/configure never yields the frame/expose event the page is waiting for while the X server spins; a window
manager's reparent/configure supplies it.

**Owner's rulings, 2026-10-06:** §O closes as an artifact of the Linux harness (Xvfb with no window manager),
folded into §Q's T26 row. The Linux harness uses openbox for multi-window and restore rows only; single-window
rows stay on bare Xvfb. Phase B (a fix) is not needed. The re-walks go ahead: Linux AZ row 3 + row 6 + T7 under
openbox, and the Windows AZ row 3 re-walk.

## Job 7 — Linux re-walk (Linux VM, main checkout, `.smoke` debug build of `cc6d58f`, all pass)

Ubuntu 26.04.1 LTS; WebKitGTK 2.52.6-0ubuntu0.26.04.1; openbox 3.6.1-12ubuntu3; git 2.53.0. Xvfb `:99` 1600×1000×24;
openbox started before the app for row 3 and T7, bare Xvfb for AZ 6. Scratch `HOME`; the real store and
`~/.gitconfig` unchanged (md5, 15 files). Fixtures from `smoke-fixtures.sh --force`; `/tmp/t4/third` is a clone of
`other` (C). AZ 6: branch `long/a-very-long-branch-name-that-will-not-fit-in-a-280px-row-menu-at-all` on `work`,
own commit `770e266` ("long side"). A = `work` main, B = `other` w1, C = `third` w2. Windows close with
`xclose.py` (`WM_DELETE_WINDOW`); layout read with `cat` on
`.local/share/dev.topher.t4gitui.smoke/layout.json`. Under openbox, B's rect lands at x318 y173 (the window
manager places it).

**AZ 3:**
- 3a pass — close B; `layout.json` 0.3 s + 2.0 s shows [A, B]; 4.7 s shows [A]; next launch opens `work` only,
  layout [A].
- 3b pass — close B, then A 1.65 s later; the app exits; [A, B] stays written 4 s later too; next launch opens
  `work` + `other`.
- 3c pass — close C, B +2.7 s, A +2.65 s (5.35 s total); [A, B, C] (w2's rect x0 y173); next launch opens all
  three.
- 3d pass — close B: 0.3 s shows [A, B], 5.0 s shows [A]; close A, app exits; [A]; next launch opens `work` only.
- 3f pass — `main` seeded [work, third] (third active), B = other; close B; +0.8 s Ctrl+W in `main`
  (`windowactivate` + a real key); close `main`; 2.27 s total; [A{tabs work}, B]; next launch opens `work` +
  `other`.
- 3h pass — `layout.restoring` gone once both titles showed; close B, SIGKILL +1.3 s; [A, B]; next launch opens
  `work` + `other`.
- 3i pass — Ctrl+W in `main` → start screen; [B]; close B: 0.3 s + 5.3 s shows [B]; close `main`, app exits; [B];
  next launch opens one window "T4 Git UI - other", layout [{tabs other}].
- 3k pass — Ctrl+Q in `main` (`windowactivate` + a real key) with A + B open; app exits; [A, B]; next launch opens
  `work` + `other`.

**AZ 6 pass, light and dark** (bare Xvfb; WebDriver reads; real XTEST keys/clicks):
- Dark: Shift+F10 on the long row → the first item "Checkout long/…" focused and `data-kbd`, wraps to 57 px,
  `white-space: normal`, accent `rgb(58,110,224)`; the other items stay 26 px, nowrap. Down → back to 26 px.
  "Merge long/… into main…" wraps to 57 px, read as one sentence (from a screenshot). End → Delete wraps to 54 px.
  Esc → back to the grid, keyboard focus. Window at 1280×560 + Shift+F10 + End: menu top 41, bottom 556/560,
  Delete 498–552 wraps to 54 px, not cut off. Not walked: the grid's last visible row (held twin-a/twin-b
  references with the details pane open) — the long row stood in for it; the menu still moved up at 515 px tall.
  Mouse: right-click the long row → the first item focused but *not* marked, 26 px, nowrap, transparent, no
  outline/box-shadow; `title` carries the full 82-character name. Arrow keys then a right-click: the same. The
  Menu key: marked and wrapped like Shift+F10.
- Light: Shift+F10 marks the item, 57 px, `bg rgb(36,89,190)`, white text; Merge wraps to 57 px, one sentence; at
  560 px + End, Delete wraps to 54 px, bottom at 556; arrow keys / mouse leave it unmarked, 26 px, transparent,
  `title` 82 characters.
- `:focus-visible` is false on every marked item on WebKitGTK; the highlight comes from `data-kbd` alone, as
  designed.
- Not walked: the sidebar's branch menu and its submenu note (information in the row, not something to check).

**T7 (Xvfb + openbox):** a fresh `tauri-driver` and `wd.mjs start` per run, listing handles, window 0/1, evaluating
`label` and `title`. 10/10 runs: 2 handles (0 = "w1 | T4 Git UI - other", 1 = "main | T4 Git UI - work" — `w1`
comes first); both pages answered 10/10; start → both titles shown in 1.48–1.91 s; quit via `invoke('quit')`, no
stale sessions.

Cleanup: `pgrep` empty; the hang worktree removed (`--force`; the timing patch kept at the VM's
`scratchpad/hang.patch`); the openbox unpack deleted; fixtures left in `/tmp/t4` including the long branch
`770e266` and `/tmp/t4/third`. No commits or pushes.

## Windows AZ row 3 re-walk (Windows VM, all pass)

Local `tauri build --no-bundle` of main `cc6d58f` (v0.10.20), driven with `smoke-launch.ps1` (CDP). WebView2
154.0.4258.53, git 2.55.0.windows.5, Windows 11, dark theme. The store was backed up first; fixtures from
`smoke-fixtures.ps1 -Force`; A = `c:\tmp\t4\work`, B = `c:\tmp\t4\other`, C = `c:\tmp\t4\third` (a scratch clone of
`bare.git`, deleted after). `layout.json` seeded per row, `layout.restoring` deleted before each launch. Window
close = `WM_CLOSE` to the HWND; tab close = CDP Ctrl+W; quit = CDP Ctrl+Q. `layout.json` read with
`Get-Content -Raw`; times are milliseconds from the start of the sequence. Next launch: relaunch, list windows,
Ctrl+Q, read the written file. Log for 2026-10-06: 0 WARN, 0 ERROR.

- 3a pass — close B at 0.1 s; file at 0.8 s + 3.3 s shows A+B (B with its rect); 5.3 s shows A only; close A; next
  launch opens A (`work`).
- 3b pass — close B, then A 1.5 s later; 4.2 s + 8.2 s show A+B; next launch opens `work` + `other`; Ctrl+Q wrote
  A+B.
- 3c pass — C at 0.1 s, B at 2.6 s, A at 5.2 s; 7.7 s + 10.7 s show A+B+C; next launch opens all three; Ctrl+Q
  wrote all three.
- 3d pass — close B, wait 5 s; 5.1 s shows A; close A; 7.7 s shows A; next launch opens `work` only.
- 3f pass — seed A=[work, third] (third active), B=[other]; close B at 0.1 s, Ctrl+W in A at 0.5 s; 1.0 s shows
  A[work]+B; close A at 1.0 s; 3.0 s + 7.0 s show A[work]+B; next launch opens A without `third` + B; Ctrl+Q wrote
  A[work]+B. On the way: the first 3f attempt came up void (a bug in the VM's runner script — the key step never
  ran), and the next launch hit the still-running process, opening a second-launch start-screen window (a
  single-instance artifact, not a row result); the script was fixed and 3f was re-walked clean.
- 3h pass — `layout.restoring` gone at launch + 5 s; close B at 0.1 s, `Stop-Process -Force` at 1.6 s; 2.6 s +
  6.6 s show A+B; no `layout.restoring` left; next launch opens `work` + `other`.
- 3i pass — seed A=`work` (`main`), B=`other`; Ctrl+W in `main` → start screen; 1.9 s shows B only; close B at
  2.0 s; 3.0 s + 8.0 s show B; close `main` at 8.0 s; 10.5 s shows B; next launch opens one window "T4 Git UI -
  other" (B's tab, in `main`), Ctrl+Q wrote it with no rect (`main`).
- 3k pass — Ctrl+Q with A+B open; 2.9 s + 6.9 s show A+B; next launch opens `work` + `other`; Ctrl+Q wrote A+B.

Cleanup: Ctrl+Q, the store restored byte-identical (`layout.json`, `recents.json`, `.window-state.json`), the
backup deleted; `c:\tmp\t4\third` deleted; no screenshots; the repo's main checkout stayed clean at `cc6d58f`. The
restored store still points at the owner's pre-existing `c:\tmp\t4cap\work`.

## Verdict

§O ("a restored second window sometimes never starts") is ruled an artifact of the harness: the stall needs Xvfb
with no window manager (33 of 150 detaches there, 0 of 300 with one, on GNOME/Xwayland and under openbox). Why a
window manager prevents it is reasoned, not measured; native Wayland and other desktops were not walked. §Q's T26
row carries the combined measurement and the reopen trigger. The Linux harness now runs openbox for multi-window
and restore rows; single-window rows stay on bare Xvfb. AZ 11's
Linux line and T7 are both ticked off this walk.
