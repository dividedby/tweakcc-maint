# Design Plan — Auto-adopt pipeline (detect → propose → auto-gate)

> **status:** active · **PRD:** #196 · **wave:** W4
>
> Short-lived implementation scaffolding (`/software-design`). Records modules,
> seams, and the testing strategy for the detect → propose → auto-gate spine.
> The issue tracker is authoritative for issue bodies; CONTEXT.md + `docs/adr/`
> are authoritative for durable vocabulary and decisions. Mark `shipped` after
> the last slice (#200) lands.

## Scope

Automate the mechanizable front of a **Release adoption**: detect a newly-shipped
Claude Code version, publish one proposal, and run the **Integration gate** for it
autonomously, posting the **Adoption record** back to the proposal. The
judgment-/ownership-bound back-half (realign + patch authoring, **Behavioral A/B**,
leaf PRs) stays human by existing rule (ADR 0002 local-first; the cockpit rule).

## Modules

### Release detector (`ReleaseDetector` — existing)
- **Responsibility:** decide whether a newly-published CC version warrants a
  proposal, and (propose-only) publish it. One reason to change: the proposal rule.
- **Interface:** `decide()` (pure) + `run()` (orchestrator).
- **Invariants:** propose iff strictly newer than every **Support matrix** version
  and not already proposed; the only outward action is publishing a proposal.
- **Depends on:** seams `NpmReleaseSource`, `IssuePublisher`.
- **Must not depend on:** the gate, the workflow layer.
- **Slice 1 (#197) adds:** a composition-root entry point wiring the real seams,
  and a machine-readable `cc_version` marker on the published `AdoptionProposal`.

### Strings-file extractor (new)
- **Responsibility:** given a pristine **Stock CC** binary + version, produce
  `prompts-<version>.json` into `prompt-data-cache`. One reason to change: how the
  strings file is extracted.
- **Interface:** `(binaryPath, version, outDir) → outputPath`.
- **Invariants:** extracted internal version equals the requested version; output
  is ephemeral (never committed to a leaf — cockpit rule).
- **Depends on:** the **leaf prompt-extractor adapter** seam
  (`extractClaudeJsFromNativeInstallation` → `promptExtractor`).
- **Must not depend on:** the detector, the workflow layer.
- **Slice 3 (#198).** Generalizes the #180 linchpin: a just-shipped version's
  strings file 404s upstream, so the gate extracts it from its own freshly-installed
  pristine binary.

## Seams

| Seam | Kind | Adapter strategy |
| ---- | ---- | ---------------- |
| `NpmReleaseSource` | external (npm registry) | real HTTP adapter in prod; fake returns a canned `NpmLatest` in tests |
| `IssuePublisher` | external (`gh`) | real `gh` adapter in prod; fake records `AdoptionProposal` / comment calls in tests. Carries the `cc_version` marker (slice 1) and the write-back comment (slice 4) |
| leaf prompt-extractor adapter | external (leaf tool / dynamic import) | real `extractClaudeJsFromNativeInstallation` + `promptExtractor` in the gate; fake returns canned `cli.js` bytes in unit tests |
| `cc_version` marker parser | pure | parses the marker out of a proposal body; unit-tested directly |
| Adoption-record write-back formatter | pure + comment seam | formats `Adoption record → comment body`; posts via the `IssuePublisher` comment seam (additive only) |

Workflow glue (cron in slice 2 / chain in slice 4) holds **no business logic** —
mirrors `integration-gate.yml` keeping logic in `src/cli.ts`. It is
integration-verified by real dispatch.

## Testing strategy

- **`decide()`** — pure unit (exists).
- **Slice 1 entry point** — all-fake wiring test (fake `NpmReleaseSource` + fake
  `IssuePublisher`): propose-once-with-marker, plus each no-propose path.
- **Slice 3 extractor** — unit with a fake leaf-extractor seam: input → output path,
  version-mismatch throws. Real extraction (incl. `@babel/parser`, native parsing)
  is integration-verified by a gate dispatch, not the unit.
- **Slice 4** — unit the pure marker parser + the write-back formatter (fake comment
  seam asserts additive comment, never body-rewrite/close). The dispatch chain is
  integration-verified by one budgeted real run.
- **Slices 2 & 4 workflows** — integration-verified by real dispatch.

## Invariants (cross-cutting)

- Detection is **propose-only**; nothing autonomous mutates a leaf.
- One proposal per version; one gate run per proposal → bounded unattended spend.
- Strings-file extraction is **ephemeral**; the leaf's committed `data/prompts/`
  stays skrabe's to regenerate (cockpit rule).
- Write-back is **additive** (comment); never rewrites a body, never auto-closes.

## Out of scope (HITL back-half)

Realign + patch authoring · **Behavioral A/B** prove-value run (local-only, never
CI — ADR 0002) · opening/merging leaf PRs (cockpit rule) · committing
`prompts-<version>.json` to a leaf.

## Deferred to `/grill-with-docs`

- **"Strings-file extractor" / prompt-data-cache seeding** is a new term not yet in
  CONTEXT.md — capture or defer.

## Issue index

- #197 — slice 1: Release detector entry point + proposal marker *(tracer)*
- #198 — slice 3: strings-file extractor *(core; independent)*
- #199 — slice 2: daily-cron detector workflow *(integration; dep #197)*
- #200 — slice 4: auto-chain dispatch + Adoption-record write-back *(integration; deps #199 #198)*
