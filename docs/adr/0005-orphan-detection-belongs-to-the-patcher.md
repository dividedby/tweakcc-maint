# 0005 — Orphan detection belongs to the patcher's apply-time resolution; the static check is demoted to an authoring-drift pre-check

Status: Accepted (2026-06-07)

## Context

The **Four-zeros bar** ([ADR 0001](./0001-verification-gate-split-by-altitude.md))
requires **0 Orphan variables** after a real `--apply`. The control plane's
`OrphanValidator` (`src/orphan-validator.ts`) implements this statically by
cross-referencing each override's declared `variables:` frontmatter against the
target version's `identifierMap` values.

A real HITL gate run (issue #22, 2026-06-08) exposed a divergence the validator
cannot resolve from where it stands (issue #27):

- **Runtime Boot-verify** crashed on `IS_TRUTHY_FN`.
- **The static validator** flagged seven *other* names — and **not**
  `IS_TRUTHY_FN`.

Both correctly concluded "broken," so the verdict held. But the divergence is
structural, not a tuning bug:

1. **A static check cannot know runtime scope.** An Orphan variable (per
   CONTEXT.md) is a `${VAR}` that survives into the *applied* prompt with no
   binding in the patched binary's runtime scope. Which JS identifiers are in
   scope at an injection point exists only when the patched binary runs — it is
   not in any `prompts-<version>.json`. Asking the static check to "match
   runtime" is asking it to do **Boot-verify**'s job.
2. **The fork already owns the resolution.** `tweakcc-fixed`'s
   `applyCustomizationsToPrompt` (`src/systemPromptSync.ts`) emits `${humanName}`
   literally for every `identifierMap` slot the override does not fill — the exact
   orphan-emission. Distinguishing a real interpolation **slot** from a `${...}`
   that is merely prose requires the fork's `pieces[]`/`identifiers[]` model. An
   earlier control-plane draft that body-scanned `${VAR}` without that model
   over-reported wildly. Re-deriving the fork's resolution in the control plane
   would re-introduce **drift** — the precise risk #27 set out to kill.
3. **The source was never ours to choose.** `tweakcc-fixed`'s
   `downloadStringsFile` already declares its resolution order — repo-local
   `data/prompts/` wins, then user cache, then network — *because the fork's
   locally-extracted JSON is the authoritative one*. The validator maintaining its
   own two-candidate order only created a way to disagree with the fork.

## Decision

Assign orphan detection by **altitude and ownership**, consistent with
[ADR 0001](./0001-verification-gate-split-by-altitude.md):

- **Runtime orphans are Boot-verify's job** and remain so. Boot-verify is the
  authoritative runtime detector; it already FAILs correctly on the
  `IS_TRUTHY_FN` class.
- **The authoritative static orphan report belongs in the patcher.** Because
  `tweakcc-fixed` already performs the apply-time resolution, it is the natural
  home for emitting the surviving-`${...}` set (e.g. a `--report-orphans` flag or
  JSON line). The **Integration gate** *consumes* that report — the same
  shell-out-and-parse pattern it already uses for `--apply`. The control plane
  **prepares this as a PR to the leaf** (skrabe-owned); it does not own or mutate
  the leaf.
- **The control plane's static check is demoted to an authoring-drift
  pre-check.** It keeps the cheap declared-vars-vs-`identifierMap` cross-reference
  (catches a name upstream renamed or inlined), but stops claiming to be *the*
  orphan authority, and defers to the fork's resolution order instead of its own
  two-candidate fallback.

## Alternatives considered

- **Re-implement the fork's apply resolution in the control plane (Q4-B).**
  Rejected: buys runtime independence at the cost of a second copy of the fork's
  apply semantics that silently goes stale when the fork changes — the drift this
  decision exists to prevent.
- **Import the fork's library internals (Q4-C).** Rejected: those functions are
  `export const` in the fork's *source*, not stable public API off its dist
  entry; deep-import coupling is brittle on version skew and is the closest thing
  to *owning* a leaf, violating the cockpit guardrail.
- **Keep chasing static/runtime parity in the existing validator.** Rejected per
  Context (1): structurally impossible for a static check.

## Consequences

- The gate's *precise* static orphan check is sequenced behind a leaf PR the
  control plane does not control the merge of. Until it lands, the Four-zeros bar
  is **not** blind: Boot-verify is the runtime backstop, and the demoted
  pre-check still catches the authoring-drift class early.
- `src/orphan-validator.ts` is re-scoped and re-documented as the authoring-drift
  pre-check; its `resolveStringsFilePath` two-candidate logic is replaced by the
  fork's repo-local-wins order.
- This dovetails with the #26 broken-fork finding: the skrabe-facing report can
  carry the `--report-orphans` capability as a concrete, friendly PR proposal.
- The CONTEXT.md **Orphan variable** term is updated to name Boot-verify and the
  patcher's apply-time report as the authoritative detectors, with the static
  check as a bounded pre-check.

## Addendum (2026-06-09, #80): the published driver is the canonical verification seam

skrabe published `skills/showtime/driver.mjs` in `tweakcc-fixed` (c5fabdf) — his
owner-canonical four-zeros harness (`check` = idempotent re-apply + apply-log
hygiene + smoke + mis-bind audit; `report` = the version-bump report incl. the
`UNKNOWN_N` placeholder count). This extends the decision's principle ("the fork
already owns the resolution") from orphan detection to the whole verification
path:

- **The driver is the canonical signal source.** When present in the configured
  checkout, the Integration gate sources its apply / orphan / mis-bind signals
  from `driver.mjs check` + `report` + `tools/auditMisbinds.mjs`
  (`src/driver-verification.ts`), keying on the driver's exit codes — never on a
  private re-parse of his output prose (the #58 drift class). When absent (older
  checkout) the gate falls back to the hand-rolled path, the same shape as the
  #31 consumer fallback.
- **`auditMisbinds=0` is the fourth zero.** The leaf's mis-bind audit (wrong-but-
  valid slot binding — invisible to the other three zeros and to smoke) is a
  first-class verdict input, sourced from the leaf's own tool, not reimplemented.
- **Unchanged authority split.** Boot-verify stays the control plane's own
  runtime check (the driver's smoke step is deliberately inconclusive-tolerant,
  and the gate's boot-verify carries the cost-ledger wiring), and the static
  validator stays the advisory authoring-drift pre-check — this addendum narrows
  nothing decided above.
