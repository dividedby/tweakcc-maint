# Design Plan — `/adopt` slash command

status: active · parent: #241 · ADR: 0010 · Epic E: #330

The `/adopt` command is a thin invoker for the **release-adoption** skill
(`.claude/skills/release-adoption/SKILL.md`), which is the single home for all
verify-and-measure logic. CONTEXT.md + ADR 0010 are authoritative for vocabulary
and the persistence decision.

## Architecture: the skill is the single home

`/adopt` itself is ~10 lines — it delegates entirely to the skill. All
orchestration logic, phase-by-phase instructions, and PR templates live in the
skill and its reference (`references/adopt-flow.md`). This collapses the earlier
dual-home duplication (the 743-line `adopt.md` + 143-line `SKILL.md` each encoding
the same procedure independently).

## Modules & seams

**`alignment-snapshot` (existing)** — owns the read-only gather of skrabe's current
state and the matrix posture.
- `LeafStateSource`, `NpmReleaseSource`, `GatherSources` injection bundle,
  `aheadOfEvery` (matrix comparison), `ScreenedCandidate`/`headCovers`
  (redundancy suppression — stale-premise guard).
- `AdoptionRecordSource`: reads `docs/records/adoption-record-*.json` → per-version
  pass. Feeds `ourFlowComplete`.
- `supportMatrixStatus()`: composes the version × `skrabeAdopted` × `ourFlowComplete`
  report on demand without persisting state.

**Leanness source (#328 / A6)** — the primary prove-value measurement seam. The
always-on prompt-size delta (stock CC vs lobotomized-CC, per-prompt + per-category).
Objective and deterministic; maps directly onto lcc's stated ~30% claim. ADR 0012
records this as the headline artifact; the Behavioral A/B is the backstop.

**Anti-laziness harness (#331 / A7)** — the Behavioral A/B with anti-laziness
**behavior-bait fixtures**. Used as a non-regression guardrail on every version;
surfaced as evidence only when a re-run with higher power produces `provesValue: true`
(the first metered run at n=5 returned null — ADR 0012).

**Integration gate (existing)** — the correctness verification seam. Shells to the
gate CLI (`integration-gate.yml` via `gh workflow run`). The gate is our own trust
instrument, not a PR-producing step. It **wraps skrabe's Showtime Driver**
(`driver.mjs check`/`report`) as the canonical signal source when present in the leaf
checkout, keying on exit codes (`src/driver-verification.ts`, #80; ADR 0005/0007);
driver-absent falls back to the hand-rolled path. We never re-run his Showtime
version-bump pipeline — verify only.

### Invariants (ADR 0010)
- `supportMatrixStatus()` persists nothing; skrabe state is injected, never cached.
- `ourFlowComplete(version)` ≡ a passing `adoption-record-<version>.json` exists.
- `skrabeAdopted` is live at Phase 1; it is never persisted for a routing decision.

### Must not depend on
- The command transport / prompt layer; real npm/git/gh inside the pure core
  (those live behind the existing seams).

## Non-code slices
- **Epic E (#330)** — the overhaul that pivoted `/adopt` from version-adoption to
  verify-and-measure; landed the skill + reference rewrite + thin invoker.
- **#245** — ops: delete `release-detector.yml` + `proposal-chain.yml`.

## Testing strategy
- Entry point: `supportMatrixStatus()` public interface.
- Unit: fake `AdoptionRecordSource` (in-memory records) + fake `LeafStateSource`
  (canned skrabe state); assert the table + the ADR 0010 invariant. No network.
- Reuse the existing `GatherSources` real/fake adapter split.

## Issue index
- #241 — parent: `/adopt` command
- #242 — matrix state model + Phase 1 preflight + routing floor (the code slice)
- #330 — Epic E: verify-and-measure overhaul (this reframe)
