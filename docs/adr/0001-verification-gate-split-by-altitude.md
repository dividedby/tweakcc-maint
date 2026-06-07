# 0001 — The verification gate splits by altitude; the control plane owns only the integration gate

Status: Accepted (2026-06-07)

## Context

`tweakcc-maint` is a cross-repo control plane for adopting new Claude Code
releases into `tweakcc-fixed` (the patcher) and `lobotomized-claude-code` (the
prompt overrides). The first slice we chose to build is a **verification gate** —
the deterministic answer to "is this release adoption broken?" — because the
defining failure mode of a version bump is that it *only surfaces at `claude -p`
runtime*. Automating an unverifiable process just automates breakage.

But "the gate" is not one homogeneous thing. It ranges from pure-function unit
tests (does `buildSearchRegexFromPieces` escape backticks correctly?) through
golden-file extraction snapshots, up to a real `--apply` against a real CC binary
followed by `claude -p` boot-verify and orphan-`${VAR}` validation across both
repos.

## Decision

Split the gate **by altitude**, not by repo-of-convenience:

- **Leaf checks** live in the leaf repos and grow there. Unit tests
  (escape/regex logic) and golden extraction snapshots belong in `tweakcc-fixed`'s
  existing `vitest`; per-override coverage checks belong on the lobotomized side.
- **The integration gate** is the *only* check logic `tweakcc-maint` owns,
  because it structurally cannot live in either leaf: real `--apply` against a
  real CC install → boot-verify → orphan-variable validation that
  cross-references lobotomized overrides against tweakcc-fixed's pristine
  `identifierMap`.

The control plane stays thin: it orchestrates and owns cross-cutting checks; it
does not absorb checks with a natural leaf home.

## Alternatives considered

- **Centralize every check in `tweakcc-maint`.** Rejected: pulls unit tests
  away from the code they test, duplicates each leaf's `pnpm test`, and makes the
  control plane a dumping ground. The leaf repos already have test infra.
- **Push everything (incl. integration) into the leaf repos.** Rejected: the
  integration gate is inherently cross-repo (lobotomized overrides × tweakcc-fixed
  identifierMap × a CC binary). Neither leaf can run it alone without depending on
  the other, which inverts the intended one-way control-plane → leaf direction.

## Consequences

- Broadening leaf test coverage is in scope but is *leaf* work, tracked against
  the leaf repos — not a `tweakcc-maint` deliverable.
- `tweakcc-maint`'s build surface is the integration gate + its orchestration,
  keeping it small.
- Open question deferred to a later ADR: *where the integration gate executes*
  (GitHub-hosted CI vs. self-hosted VPS runner vs. local-only), since it needs a
  ~220 MB Bun CC binary and a license.
