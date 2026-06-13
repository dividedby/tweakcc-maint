# Design Plan — /adopt hardening (first-run findings)

status: active
epic: #241 (`/adopt`)
source: the first real `/adopt` run (CC 2.1.177 full adoption, Path A)

Implementation scaffolding for the backlog that hardens the `/adopt` command,
the **Integration gate**, and the adoption tooling after the first real run.
The issue tracker is authoritative for issue bodies; this plan records the
modules, seams, invariants, and testing strategy. Uses CONTEXT.md vocabulary.

## Modules & seams

| Module / seam | Responsibility (one reason to change) | Issue |
|---|---|---|
| **CapturedSignals contract** (seam) | A captured gate signal that did-not-run is `undefined`, never an empty string a parser reads as failure. | #262 |
| **Override-surface composition** (module) | Assemble the **Three override surfaces** for a run, incl. an isolated mode (empty surfaces, throwaway dirs) with guaranteed restore. | #263 |
| **Leaf-build adapter** (module) | Guarantee the leaf `dist/` reflects `src/` before the **Driver**'s `--apply`. | #261 |
| **Leaf-checkout adapter** (CI) | Parameterize which leaf repo+ref the gate clones (default `skrabe/*@main`). | #264 |
| **Adoption-analysis CLIs** (transport) | Thin argv→pure-core→stdout wrappers for drift-triage + lobotomy-ranker (ADR 0004). | #265 |
| **Driver `report` provenance** (leaf) | The version-bump report asserts source cli.js == target before extracting. | #260 |
| Run-book (non-module) | The `/adopt` command doc reflects the corrected procedure. | #267 |
| Showtime doc hygiene (non-module) | Purge dead Piebald `upstream` refs (**Extractor-canonical upstream policy**). | #266 |

## The CapturedSignals three-state contract (#262)

The **Mis-bind** audit (skrabe's fourth zero) has three verdict states, not two:
**ran-clean** (`mis-bind audit: 0`) → pass; **ran-with-findings** (`MIS-BINDS: N`)
→ fail; **not-asserted** → pass-through, with two recorded reasons — `SKIPPED`
(ran, no upstream reference dump) and `not-run` (no override dirs). Represented as
`undefined` (absent), never `""`. Asymmetric with **Boot-verify**, which is
fail-when-absent (it must positively assert success and is never vacuous). Full
rationale: ADR 0005 addendum (2026-06-13, #262).

## Invariants

- not-run ≠ failed (CapturedSignals contract).
- The gate never applies stale build output (Leaf-build adapter).
- Override isolation always restores the runtime `~/.tweakcc/system-prompts` target
  — on success and on error — and never writes runtime files into a tracked clone.
- `SUPPORT_MATRIX_SEED` is not bumped pre-merge; draft records are evidence, not
  matrix membership (ADR 0010).

## Testing strategy

- **Pure verdict + signal composition** (#262, #261, #263): unit-test through the
  public interfaces (`evaluate(CapturedSignals)`, `driverSignals`, the composition
  module) with in-memory signals / fake `ShellResult[]` / fake fs + symlink ops.
  Never test the leaf tools' internals.
- **Transport** (#265): thin argv/stdout-contract tests over the already-tested
  pure cores; do not re-test core logic.
- **Workflow & docs** (#264, #266, #267): verified by a real dispatch / the next
  `/adopt` run, not a unit harness.
- **Leaf provenance** (#260): fixture cli.js (match/mismatch) at the `.cjs` CLI
  boundary; shipped as a verified PR.

## Ordering (tracer → core → edge → integration)

#262 (tracer; unblocks #263) → #261 → #263 → #260 → #264 → #265 → #266 → #267.

## Issue index

- #260 — versionBumpReport: assert cli version == target (leaf PR)
- #261 — gate refreshes leaf dist before --apply
- #262 — auditMisbinds: empty overrideDirs = not-run (tracer)
- #263 — ISOLATE_OVERRIDES flag (blocked by #262)
- #264 — integration-gate.yml leaf_repo/leaf_ref inputs
- #265 — drift-triage + lobotomy-ranker CLIs
- #266 — purge dead Piebald upstream refs (leaf PR)
- #267 — harden /adopt command doc

## Decisions captured elsewhere

- ADR 0005 addendum (2026-06-13, #262) — the not-run/SKIPPED/ran mis-bind-audit
  states and the Boot-verify asymmetry. No items left deferred.
