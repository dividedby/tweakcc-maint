# 0004 — tweakcc-maint is TypeScript + vitest, run via tsx with no build step

Status: Accepted (2026-06-07)

## Context

`tweakcc-maint` is greenfield; the stack was deferred from the design grill to
`/software-design`. Two pulls shaped the choice: the leaf `tweakcc-fixed` is
**TypeScript + pnpm + ESM + vitest** (it bundles for publish via `tsdown`), while the
benchmark sibling `~/repos/bench` is **plain Node `.mjs`** — and bench's run/judge/aggregate
primitives are what the slice-5 **Behavioral A/B benchmark** driver will reuse ([ADR 0002](./0002-vs-vanilla-measures-targeted-behavior.md)).

## Decision

- **TypeScript with vitest, pnpm, ESM** — matching the `tweakcc-fixed` leaf.
- **Run sources directly via `tsx`; no bundler / `dist` build step.** Type-checking via
  `tsc --noEmit`.

## Considered Options

- **Plain `.mjs` (match bench).** Rejected: the design leans on typed value objects
  (`CcVersion`, `FourZerosResult`, `AdoptionRecord`) and SDK-style port interfaces
  (`AdoptionEnvironment`, `NpmReleaseSource`, `IssuePublisher`) that the seam/fake testing
  strategy depends on — `.mjs` can't express them. It also diverges from the leaf's vitest.
  bench's `.mjs` primitives stay consumable from TypeScript via ESM interop when slice 5 lands.
- **`tsc`/`tsdown` → `dist` build (like the leaf).** Rejected *for now*: a build step only
  earns its place if `tweakcc-maint` itself becomes a distributable package. It isn't — it is a
  **contributor cockpit**, internal maintenance tooling, not a product. Nobody installs the gate
  to *use* the fork; the published artifacts are the fork leaves (`tweakcc-fixed`,
  `lobotomized-claude-code`), which already bundle and publish at the leaf. Running `.ts` directly
  keeps [ADR 0003](./0003-gate-runs-local-first-then-github-hosted-ci.md)'s "identical command
  locally and in CI" invariant with no compiled artifact to drift.

## Consequences

- Tooling: pnpm + ESM + vitest; `tsx` as the runner; `tsc --noEmit` for type-checking.
- Publishing a fork of a leaf (if upstream rejects a PR) happens **at the leaf**, which already
  compiles — unaffected by this decision.
- Revisit only if `tweakcc-maint` is ever meant to be installed/distributed on its own.
