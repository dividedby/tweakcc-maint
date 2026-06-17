# 0010 — Support-matrix adoption state is derived and live-checked, not persisted

Status: Accepted (2026-06-12)

## Context

The `/adopt` command (issue #241) reworks the **Support matrix** into a tracking
surface that answers two questions per CC version:

1. **`ourFlowComplete`** — has the version been through our full checks/improvement
   flow (a real **Integration gate** run: **Four-zeros bar** + **Restore drill**)?
2. **`skrabeAdopted`** — is the version in `skrabe`'s leaves (shipped by him, or via
   one of our merged adoption PRs)?

These drive the command's two-path fork at Phase 1 (the alignment preflight): a
version `skrabe` has **not** adopted takes **Full adoption** (we author the patcher
PR); one he **has** adopted takes the **Verify-and-improve pass** (no patcher PR; we
prove his state against our gate and add only the **Lobotomy** overrides he lacks).

Today the matrix is a code constant — `SUPPORT_MATRIX_SEED` in
`src/support-matrix.ts`, a version *list* with no per-version state — unioned with
proposal-derived versions and consumed by `alignment-snapshot.ts`
(`aheadOfEvery(latest, matrix)`) and the now-deprecated release detector. Adoption
records already exist as per-run artifacts at
`docs/records/adoption-record-<version>.json`. The naive rework would add a
persisted per-version state table carrying both flags.

The hazard is staleness. `skrabe`'s leaves move hourly; a cached `skrabeAdopted=false`
that has gone stale would route a run down **Full adoption** and author an adoption PR
he has already rendered redundant — the exact failure the alignment preflight exists
to prevent, and the documented cause of closed/contaminated drafts (lcc#9,
tweakcc-fixed#8).

## Decision

**The matrix carries no persisted per-version adoption-state file. Both flags are
computed, not stored:**

- **`ourFlowComplete`** is **derived** from the adoption records on disk — it is
  exactly "a passing `adoption-record-<version>.json` exists." The gate emits that
  record only on a full pass, so the record *is* the persistence; a second stored
  boolean would duplicate it and invite drift.
- **`skrabeAdopted`** is **live-checked at Phase 1 on every run** (`npm view` +
  `git log origin/main` on both leaves, plus his open/recently-closed PRs) and is
  **never cached for a routing decision**. His repo state is authoritative only live.
- A `supportMatrixStatus()` **report function** composes both on demand, giving the
  visible version × skrabe-adopted × our-flow-complete table without a stale cache
  driving the two-path fork.

`SUPPORT_MATRIX_SEED` stays the install-free version *list* (reset to `['2.1.176']`
so 2.1.177 is the first `/adopt` target); the adoption records stay the
*flow-complete* evidence; the skrabe flag is always live.

## Considered options

- **A persisted `support-matrix.json` state table** (both flags committed per
  version). Rejected — a committed `skrabeAdopted` is a point-in-time observation that
  goes stale the moment he commits; a run trusting it would re-author a redundant
  adoption PR, defeating the alignment preflight. History/visibility is recoverable
  cheaply from the on-demand report without that risk.
- **Store `ourFlowComplete` alongside the records.** Rejected — pure duplication of a
  fact the records already carry; two sources of the same truth drift.
- **Live-check both flags, persist neither, no report surface.** Rejected only in
  part — this is the chosen model *plus* an on-demand report, because the issue asks
  for a visible tracking surface; the report satisfies that without persistence.

## Consequences

- The two-path fork (Full adoption vs. Verify-and-improve pass) is always decided on
  **fresh** skrabe state — the staleness class that closes redundant drafts cannot
  enter through a cached flag.
- "Tracking" the matrix is a *read* (compose the report), not a *write*. There is no
  state file to keep in sync, no migration, and no commit churn per adoption.
- The report is only as current as its inputs: `ourFlowComplete` is exact (records are
  immutable on-disk artifacts); `skrabeAdopted` is exact at composition time and
  carries no historical trail of *when* he adopted. If an audit trail of adoption
  *timing* is ever needed, that is a separate additive artifact and revisits this ADR.
- Pre-baseline versions (< 2.1.176) leave the active matrix; their adoption records
  (2.1.169, 2.1.170) are retained as history but no longer assert the **Four-zeros
  bar**. Their patch match-methods live in `tweakcc-fixed` (skrabe's), so pruning them
  is his call, not a control-plane action.

## Addendum (2026-06-17, #330): `/adopt` is verify-and-measure; the two-path fork no longer authors a version PR

**What changed.** `/adopt` (Epic E, #330) was overhauled from a *version-adoption*
pipeline (extract → realign → "Prompts for \<ver\>" patcher PR) to a
**verify-and-measure** workflow. The command is now a thin invoker for the
`release-adoption` skill (`SKILL.md` + `references/adopt-flow.md`), which is the
single home for all orchestration logic.

**The two-path fork is retired as a routing mechanism.** The original ADR described
Path A (Full adoption — we author the patcher PR when skrabe has not shipped) vs.
Path B (Verify-and-improve — we prove his state when he has shipped). In practice,
skrabe ships CC versions the same day they land on npm; every real run since 2.1.172
has been Path B. The distinction that made Path A meaningful is gone. `/adopt` no
longer branches on `skrabeAdopted` for routing; it always goes to verify-and-measure.

Contributions are now:
- **tweakcc-fixed:** a test for a silent-corruption class the gate surfaced, OR a
  surgical correctness fix. **Never** a version-adoption PR.
- **lcc:** a surgical mis-bind / vocab fix the gate proved, OR a leanness +
  non-regression **measurement artifact** he can't generate. **Never** a full-set
  realign.

**The core decision is unchanged.** Derived, live-checked, non-persisted matrix state
(this ADR's decision) is still exactly right: `ourFlowComplete` is derived from
on-disk adoption records; `skrabeAdopted` is live at Phase 1 and never cached. The
`supportMatrixStatus()` report still composes both on demand. The staleness hazard
(a cached `skrabeAdopted=false` routing a run into a now-redundant adoption PR) was
the original motivation; it is even more acute now that he ships same-day.
