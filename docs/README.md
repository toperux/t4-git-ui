# docs/

What lives where. A plan is archived once every open row it holds is carried by
`plans/open-items.md`; the archive is the record, not a backlog.

```
design/            style guide + design canvases (token source of truth; see design/style-guide.md)
plans/
  open-items.md       the one live list: deferred features, verification owed, roadmap, to-revisit rows
  open-items-done.md  its done / closed rows, same § letters
smoke/
  smoke-test.md            v1 regression walkthrough, ticked as walked
  smoke-test-post-v1.md    post-v1 feature groups A–AZ, ticked as walked
  smoke-cdp.md             driving the installed app over CDP instead of by hand
  fixtures/                smoke-fixtures.ps1 (builds C:\tmp\t4), smoke-dialog.ps1, ad7-*.sh, irebase-fixture.sh, linked-fixture.sh, bd-fixture.sh, bd2-fixture.sh, dogfood-fixture.sh
archive/
  plans/     executed plans and their review records (v1 plan, interactive rebase, Files/blame/history,
             CI alignment, the 2026-09-12 consolidated findings, review2-A–D, the 2026-09-20 review
             findings and their fix plan)
  reviews/   dated whole-codebase reviews, 2026-09-01 … 09-06
  walks/     dated smoke-walk records and the findings they produced
```
