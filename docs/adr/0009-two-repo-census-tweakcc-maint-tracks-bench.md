# 0009 — One census tracks two repos: tweakcc-maint also tracks `dividedby/bench`

Status: Accepted (2026-06-10)

## Context

tweakcc-maint is the maintenance **control plane** for the fork ecosystem, and it
also **owns** the sibling repo `github.com/dividedby/bench` (the
`@dividedby/bench-core` public-npm package) — see CLAUDE.md "Owned sibling". The
Behavioral A/B bench primitives this repo depends on (`executeRun`,
`normalize`/`groupByCell`, cost, the `JudgeBackend` panel backend) live there, and
that repo's work is steered from sessions **here**.

The roadmap pattern ([the `/roadmap` skill](../../docs/plans/roadmap.md),
ADR 0020–0023) assumes a **single repo**: one census, one Idea Inbox, one read-only
mirror, and a drift-nudge that enumerates *one* repo's `gh issue list`. Standing up a
second full roadmap stack inside `bench` would split the census of record across two
docs and duplicate the intake/mirror machinery for a repo that is already managed
from here.

## Decision

**One census in tweakcc-maint tracks issues from BOTH `dividedby/tweakcc-maint` and
`dividedby/bench`.** `bench` gets **no roadmap, no Idea Inbox, and no mirror of its
own** — it is tracked here. Concretely:

- **Row repo-disambiguation.** A census row's issue cell qualifies its repo: a bare
  integer (`#NN` / `148`) means `dividedby/tweakcc-maint`; a `bench#NN` cell means
  `dividedby/bench`. Rows are keyed by the composite identity **(repo, number)**, not
  by number alone, so `bench#3` and `#3` are distinct rows.
- **The drift-nudge queries both repos.** `roadmap-drift-nudge.py` runs
  `gh issue list -R <repo>` for **both** `dividedby/tweakcc-maint` and
  `dividedby/bench`, keying every issue by the same composite identity. A `bench#NN`
  census row therefore matches its `bench` issue rather than reading as "unfiled",
  and a closed `bench` issue whose row is non-Done surfaces as stale-closed,
  qualified `bench#NN` in the printed message.
- **One Idea Inbox, two targets.** The single Idea Inbox (issue #99) is the canonical
  intake for unstructured ideas; a drained idea is **filed in whichever repo owns the
  work** (tweakcc-maint or bench) and then registered as a census row here, qualified
  if it lands in `bench`. Capture/dedup considers the OPEN issues of **both** repos.

## Considered options

- **A second full roadmap stack in `bench`** (its own census + inbox + mirror +
  hooks). Rejected — splits the census of record, duplicates intake/mirror machinery,
  and contradicts the "work bench from sessions here" ownership model (CLAUDE.md).
- **Track only tweakcc-maint; leave `bench` untracked.** Rejected — `bench` carries
  live backlog (`bench#1`, `bench#2`, `bench#7`, `bench#8`) that the control plane's
  own work depends on; leaving it off the census of record makes the doc untrustworthy
  as the single place to pick the next task.
- **Number-only keying with a repo column.** Rejected in favor of qualifying the issue
  cell itself: the bare-vs-`bench#NN` form keeps the parser's existing single-column
  issue cell, is visible at a glance in the row, and composes with the drift-nudge's
  `(repo, number)` key without a schema change to every consumer.

## Consequences

- This is a **departure from the single-repo census** the `/roadmap` skill assumes
  (surfaced per the issue's design note rather than silently bending the skill). The
  departure is local to tweakcc-maint: the skill templates are unchanged upstream;
  only this repo's `roadmap-drift-nudge.py` carries the cross-repo enumeration.
- The drift-nudge makes **two** `gh` calls per run instead of one (still throttled,
  still fails open silent if either repo's call fails — an offline/error result skips
  the nudge rather than mis-reporting drift).
- `bench` issues are closed by their own maintainer actions in `dividedby/bench`; the
  census here reflects that state on reconcile, but closing stays a human act on a
  Tier-3 recommendation exactly as for tweakcc-maint rows (ADR 0017 invariant holds).
- If `bench` ever outgrows being tracked-from-here (e.g. it gains its own contributor
  cadence), this ADR is revisited and `bench` gets its own stack — superseding this.
