# Design Plan: Release-adoption substrate (integration gate + release detector)

> Status: approved
> Created: 2026-06-07
> Epic: PRD #2 — release-adoption control plane

## Context

The control plane must answer "is this Release adoption broken?" deterministically and
propose adoptions as new Claude Code versions ship. The defining failure mode is runtime-only
breakage that unit tests structurally cannot catch, so the gate does a real apply + Boot-verify
across the Support matrix and emits an Adoption record. This plan designs the buildable
substrate (PRD slice 1); roadmap slices 2–6 are out of scope here.

## Domain Vocabulary Used

From `CONTEXT.md` (authoritative — not redefined here):

- **Integration gate**, **Four-zeros bar**, **Boot-verify**, **Orphan variable**,
  **Support matrix**, **Restore drill**, **Adoption record**, **Release adoption**, **Control plane**.

## Module Map

| Module | Responsibility (one reason to change) | Interface (operations) | Seams |
|---|---|---|---|
| FourZerosVerdict | Interpret raw apply/boot/validator output into a structured Four-zeros result | `evaluate(signals) → FourZerosResult` | none (pure) |
| IntegrationGate | Verify a Release adoption across the Support matrix and emit an Adoption record | `runGate(matrix, env) → AdoptionRecord` | AdoptionEnvironment |
| ReleaseDetector | Decide whether a newly-published CC version warrants proposing an adoption, and propose it | `decide(latestNpm, matrix, openProposals) → ProposalDecision` (pure); `run(sources)` | NpmReleaseSource, IssuePublisher |

The **CLI** is the transport / end-to-end test entry point (subprocess seam), not a domain
module. The **Adoption record** is a structured value type emitted by IntegrationGate (machine-
readable so slice-6 reporting can aggregate it); it is not yet its own module (YAGNI).

## Seams

| Seam | What crosses it | Adapter in tests | Adapter in prod |
|---|---|---|---|
| AdoptionEnvironment | apply · boot-verify · orphan-detect · backup · restore · matrix-list | `FakeAdoptionEnvironment` (must drive failed-patch, missing-prompt, orphan-var, boot-crash, dirty-restore, missing-backup per version) | `RealAdoptionEnvironment` (shells out to tweakcc-fixed --apply / claude -p / --restore / validator — #7, HITL) |
| NpmReleaseSource | latest `@anthropic-ai/claude-code` version | `FakeNpmReleaseSource` (must return a settable latest version + a malformed-response case) | npm registry adapter |
| IssuePublisher | open an "adopt CC X.Y.Z" issue | `StubIssuePublisher` (must capture proposed issues and never create one — enforces propose-only) | `gh issue create` adapter |

## Invariants and Contracts

- A Four-zeros verdict is "pass" iff 0 failed patches, 0 missing system prompts, 0 Orphan
  variables, and Boot-verify passes.
- A Release adoption passes iff **every** Support-matrix version passes; any breach → non-zero exit.
- The per-version flow is backup-exists → apply → Four-zeros → restore → verify-clean; a run
  must restore to clean stock (dirty restore fails the run).
- The same `runGate` runs identically with the Fake (tests) and Real (prod) AdoptionEnvironment
  — environment-agnostic (ADR 0003).
- ReleaseDetector is propose-only: it never starts an adoption, mutates a leaf, or duplicates an
  open proposal.
- No license/secret is committed to the public tree (ADR 0003; harness secret-guard later).

## Testing Strategy

| Module | Test entry point | Test level | Fake strategy |
|---|---|---|---|
| FourZerosVerdict | `evaluate(signals)` | Unit (pure) | none — golden output fixtures |
| IntegrationGate | `runGate(matrix, env)` | Unit | FakeAdoptionEnvironment; real FourZerosVerdict |
| ReleaseDetector | `decide(...)` (pure) + `run(sources)` | Unit | FakeNpmReleaseSource, StubIssuePublisher |
| End-to-end gate | the CLI as a subprocess | Integration | FakeAdoptionEnvironment fixture env |
| Real environment | RealAdoptionEnvironment behind the seam | Manual / HITL | none — real CC install (#7) |

## Issue Index

| Issue | Module | One-line description |
|---|---|---|
| #13 | FourZerosVerdict | Parse the four failure signatures → verdict (foundation) |
| #3 | IntegrationGate | Walking skeleton: single-version verdict → Adoption record (tracer bullet) |
| #4 | IntegrationGate | Support-matrix iteration; every version must pass |
| #5 | IntegrationGate | Restore-drill bracketing the per-version flow |
| #6 | ReleaseDetector | Propose-only npm poll → adopt issue |
| #7 | AdoptionEnvironment | Real shell-out adapter against a live CC install (HITL) |

Dependency order: #13 → #3 → {#4, #5} → #7; #6 independent (parallel).

## Open Questions

- [ ] **Stack = TypeScript + vitest** is a hard-to-reverse choice with a real alternative
      (plain `.mjs`, matching `~/repos/bench`). Decided in this session; **ADR-worthy** —
      capture via `/grill-with-docs` so the rationale (leaf vitest parity, typed value
      objects + SDK-style port interfaces vs. frictionless bench `.mjs` reuse) is durable.
- [ ] Adoption-record on-disk format/location (input to slice-6 reporting) — defer to when
      reporting is designed; #3 only requires it be structured/machine-readable.
