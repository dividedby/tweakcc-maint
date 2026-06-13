# Design Plan — `/adopt` slash command

status: active · parent: #241 · ADR: 0010

Short-lived implementation scaffolding for the `/adopt` backlog (#242–#245).
The issue tracker is authoritative for behavior; this records the module/seam
shape and testing strategy. CONTEXT.md + ADR 0010 are authoritative for
vocabulary and the persistence decision.

## Finding: single-module extension, not a multi-module design

The bulk of `/adopt` is a slash-command **orchestration prompt**
(`.claude/commands/adopt.md`) that delegates to gearbox tiers and shells to
existing scripts (`skills/showtime/driver.mjs`, `versionBumpReport.js`,
`integration-gate.yml` dispatch) — not vitest-testable code. The only genuinely
new code is a small extension of the existing alignment-snapshot module.

## Modules & seams

**`alignment-snapshot` (existing, extended)** — owns the read-only gather of
skrabe's current state and the matrix posture.
- Already provides the seams `LeafStateSource`, `NpmReleaseSource`, the
  `GatherSources` injection bundle, `aheadOfEvery` (matrix comparison), and
  `ScreenedCandidate`/`headCovers` (redundancy suppression — the stale-premise
  guard, lcc#9/tf#8, which *is* Path B's gap-diff logic).
- **New injected seam — `AdoptionRecordSource`**: reads
  `docs/records/adoption-record-*.json` → per-version pass. Feeds
  `ourFlowComplete`.
- **New pure composition — `supportMatrixStatus()`**: composes the
  version × `skrabeAdopted` × `ourFlowComplete` report over (matrix versions,
  `AdoptionRecordSource`, gathered skrabe state).

### Invariants (ADR 0010)
- `supportMatrixStatus()` persists nothing; skrabe state is injected, never cached.
- `ourFlowComplete(version)` ≡ a passing `adoption-record-<version>.json` exists
  (no second stored boolean).
- `skrabeAdopted` is live at composition time; it drives the two-path fork on
  fresh state only.

### Must not depend on
- The command transport / prompt layer; real npm/git/gh inside the pure core
  (those live behind the existing seams).

## Non-code slices
- **#243 / #244** — `adopt.md` orchestration (Full adoption / Verify-and-improve
  paths). Gearbox-tier delegation + script shelling. Path B redundancy reuses
  `ScreenedCandidate`/`headCovers`.
- **#245** — ops: delete `release-detector.yml` + `proposal-chain.yml`.

## Testing strategy
- Entry point: `supportMatrixStatus()` public interface.
- Unit: fake `AdoptionRecordSource` (in-memory records) + fake `LeafStateSource`
  (canned skrabe state); assert the table + the ADR 0010 invariant. No network.
- Reuse the existing `GatherSources` real/fake adapter split.

## Issue index
- #242 — matrix state model + Phase 1 preflight + routing floor (the code slice)
- #243 — Full adoption path (Path A) — orchestration
- #244 — Verify-and-improve path (Path B) — orchestration
- #245 — deprecate detector + proposal-chain workflows — ops
