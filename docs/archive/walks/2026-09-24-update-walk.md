# Update walk — 0.10.10 updating itself to the published 0.10.11 (2026-09-24)

The rows that had waited on "needs a published update":
- AC's *a failed check is honest* and *a failed install unsticks*;
- AZ 10, *an update's restart keeps every window*;
- BD 10, *Install refused while an operation runs*;
- `open-items.md` §I *F7 / updater restart*.

The installed app was 0.10.10, launched with `smoke-launch.ps1 -Installed` (its own WebView2 profile, CDP on 9222)
and with `HTTPS_PROXY` / `HTTP_PROXY` pointing at `docs/smoke/fixtures/throttle-proxy.mjs` on 127.0.0.1:8888. The
updater's HTTP client follows those variables. The proxy is the "network" these rows ask to pull: stopped, it is
offline; with a rate, a download slows enough to cut. `layout.json` seeded two windows, `c:\tmp\t4\work` and
`c:\tmp\t4\dogfood`. The store folder was backed up first and restored byte-exact after. `docs/smoke/cdp.mjs` now
takes `CDP_TITLE`, to pick one window of several.

## Results

1. **Offered on launch** (AC, already ticked, seen again): the launch check went through the proxy (`github.com`,
   then the release-assets host for `latest.json`). The toolbar showed *"Version 0.10.11 is available — open
   Settings"*, and Settings › Updates **Update to 0.10.11…**.
2. **A failed check is honest** — pass. With the proxy stopped, **Check now** read *Checking…*, then
   *"error sending request for url (https://github.com/…/latest.json)"* in the Updates section. No toast, no *is up
   to date*, and the dialog stayed usable.
3. **BD 10** — pass. A 60 s `git fetch … slow` running in `work`. In `dogfood`: **Check now**, then **Update to
   0.10.11…** → *"a git operation is still running — let it finish or cancel it, then install"*. The fetch carried
   on and nothing restarted.
4. **A failed install unsticks** — pass. The fetch was cancelled and the proxy restarted at 150 kB/s. **Update to
   0.10.11…** → *Downloading… 11%* with the progress bar at 11. Then the proxy was killed → *"error decoding
   response body"* beside the buttons, the bar gone, **Update to 0.10.11…** enabled again, the same process
   still running.
5. **AZ 10 and F7, the update restart** — pass. The proxy at full speed, both windows open, **Update to
   0.10.11…** → the process (pid 31648) was gone and a new one (11692) up within 5 s, with both windows, `dogfood`
   and `work`. The installed exe and the uninstall entry both read 0.10.11. In the app: no update badge,
   *"T4 Git UI 0.10.11 is up to date"*, the grid loaded. The single-instance lock let go on the way out, as read
   from the sources on 2026-09-21: the relaunch was not handed back to a dying process.

## Observations, none acted on

1. **Both failures show the HTTP library's words.** *"error sending request for url (…)"* and *"error decoding
   response body"* are reqwest's, and "decoding" is misleading for a download that was cut. Something like
   *"Couldn't reach GitHub"* / *"The download was interrupted"*, with the raw text as the detail, would read better.
2. **Update to 0.10.11… stays enabled after a failed check.** It is left over from the earlier successful one.
   Harmless, since pressing it retries the install, but the section then shows an offer and a failure together.
3. **Each window keeps its own update state.** `dogfood` showed only *T4 Git UI 0.10.10* and a plain **Update**
   until **Check now** was pressed in it, although `work` had already found 0.10.11 and the launch check had run.
4. **Escape did not close Settings** in `work` after **Check now** had been clicked there. **Close** did. Not
   chased: the clicks came over CDP, so the focus may simply not have been in the dialog.

## Not walked

AC's *deb / rpm* box needs a Linux package install.
