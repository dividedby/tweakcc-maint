---
status: active
---

# Design Plan: Four-zeros verdict authority

Scaffolding for the two-issue cluster that consolidates *who authoritatively
decides the Four-zeros verdict* — **#80** (verification-source adapter) and
**#76** (pass-predicate authority). Short-lived; mark `shipped` after the last
issue lands. CONTEXT.md + `docs/adr/` remain authoritative for durable facts.

## Problem

The control plane reconstructs skrabe's verification by hand in two places, and
that reconstruction is the drift risk:

- The real adoption-environment adapter hand-rolls `--apply` + Boot-verify +
  our own orphan validator, and the verdict re-parses raw `--apply` text — a
  private copy of his output format (the class #58 burned us on).
- The per-version pass predicate (`versionPassed`) is duplicated byte-for-byte
  in the gate module and the adoption-history aggregator — the silent
  missed-update path once the bar grows (Behavioral A/B, #11).

Both are the same shape of defect: a *second, private authority* for something
the canonical source should own once.

## Modules & seams

### `CapturedSignals` seam (the existing verdict seam)

The verdict is a pure function `evaluate(CapturedSignals) → FourZerosResult`
that does not know how its signals were produced. `CapturedSignals` is the seam
between *signal acquisition* (adapters) and *verdict decision* (the pure
evaluator).

- **#80** adds a new **signal-source adapter** behind this seam: when skrabe's
  `skills/showtime/driver.mjs` is present, source signals from `driver.mjs
  check` (#1/#2), `driver.mjs report <prev>` (#3 + UNKNOWN_N), and the leaf's
  `auditMisbinds.mjs` (#4). Driver-absent → fall back to the hand-rolled path
  (mirrors the #31 consumer fallback). The pure evaluator is unchanged except
  to accept the `auditMisbinds` input.
- **Invariant:** the driver is the *canonical* verification path; our static
  orphan-validator stays an **advisory** authoring-drift pre-check only
  (ADR 0005 — Boot-verify + the patcher are authority).
- **Must not depend on:** a private reconstruction of the driver's output
  format. Validate against the canonical, not a copy of it.

### Pass-predicate authority (the gate module)

- **#76** promotes `versionPassed(VersionResult)` to a single exported
  predicate owned by the gate module (which defines `VersionResult` and sets
  the bar). The adoption-history aggregator imports it; its private copy is
  deleted.
- **Invariant:** exactly one definition of the pass condition exists. The gate
  is its sole author.

## Testing strategy

- **#80** — the fake adoption-environment path stays the unit entry point and is
  unchanged. The new driver-backed adapter is tested behind `CapturedSignals`
  with a fake driver (stubbed `check`/`report` stdout + exit). Driver-absent
  fallback is a covered case. End-to-end against a *real* CC install is the
  **HITL gate**, not a unit test.
- **#76** — behavior is unchanged, so the existing gate + adoption-history tests
  are the regression net; the win is structural (one definition). Typecheck
  proves the import wiring.

## Issue index

- #80 — real gate sources its verdict from skrabe's `driver.mjs` (adapter).
- #76 — export the Four-zeros pass predicate (single authority).

## Surfaced for `/grill-with-docs` (defer or capture)

- An **ADR note / 0005 amendment** recording the driver as the canonical
  verification seam (called out in #80's acceptance criteria) — ADR-worthy,
  owned by `/grill-with-docs`, not this plan.
