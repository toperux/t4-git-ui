# CLAUDE.md

## Workflow for every change

1. **Prompt.** The user says what needs to happen or be implemented.
2. **Plan.** Write a plan for the user to refine and review.
3. **Plan review loop.** Review the plan in passes until a pass finds no more issues.
   - A decision that is the user's to make: ask **immediately**, not at the end, so the answer is reviewed in
     the next pass.
   - Any change to the plan (a fix, an answer, a user edit) means another review pass.
4. **Execute, only on the user's go.** A final plan is not a go. Ask first; never start on your own.
5. **Change review loop.** Review the changes in passes until a pass finds no more issues.
   - Decisions: ask immediately, as in step 3.
   - Keep a list of every finding that was skipped and every accepted limit found. Show it at the end of the
     loop for triage.
6. **Triage.** Go through that list with the user one item at a time. Each item is either:
   - fixed, in another fix → review loop (step 5);
   - deferred: listed in `docs/plans/open-items.md` for later;
   - accepted: recorded as an open accepted item to revisit, or as a closed accepted item for reference.
7. **Package.** Only after the review-fix loop is done: squash related commits, then push or open a PR.
   - **Ask explicitly before every push and every release.** Never push, tag or release on your own; a go on
     the task is not a go to push.
