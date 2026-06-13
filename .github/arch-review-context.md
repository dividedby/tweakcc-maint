# Repo context — dividedby/tweakcc-maint

This is the **Repo-context include** for the architecture-review loop: the
per-repo half of the prompt, concatenated onto the fetched-fresh scope-free
skeleton (`harness/prompts/improve-codebase-architecture.md`) by the workflow
envelope (`.github/workflows/improve-codebase-architecture.yml`). It carries what
cannot be generalized — this repo's review scope and the disciplines that bind it.

This file lives at `.github/arch-review-context.md` in this repo. It is one of
your in-repo files, so you **may** propose an edit to it (a human reviews before
merge) — unlike the upstream skeleton, which you may not.

## What this repo is

The **maintenance control plane** for the Claude Code fork ecosystem — a
TypeScript + vitest + pnpm + ESM project run directly via `tsx` with **no build
step** ([ADR 0004](../docs/adr/0004-typescript-vitest-run-via-tsx-no-build.md)).
It does not ship a product; it orchestrates *release adoption* (making the fork
current and proven on each new Claude Code version) across leaf repos it does
**not** own. Its deliverable is a **verified PR prepared for a leaf** — it never
direct-pushes a leaf. Read `CONTEXT.md` for the canonical glossary and
`docs/design/release-adoption-substrate.md` for the design.

**The control plane is deliberately thin** ([ADR 0001](../docs/adr/0001-verification-gate-split-by-altitude.md)).
The highest-value proposals improve the *testability and seam-clarity* of its
own modules; the worst proposals pull leaf-altitude responsibility into the
control plane. Protect the thin-cockpit boundary over cleaner-looking design.

## Scope

**Primary scope:** the control-plane source under `src/` and its tests under
`test/`. The load-bearing modules:
- `src/integration-gate.ts` + `src/four-zeros-verdict.ts` — the verification gate
  and the Four-zeros verdict parsing (the core value: green evidence on a PR).
- `src/adoption-environment.ts`, `src/real-adoption-environment.ts`,
  `src/fake-adoption-environment.ts` — the environment seam (shell-out adapter
  behind a fake; the gate runs against either).
- `src/orphan-validator.ts` + `src/orphan-report.ts` — the authoring-drift
  pre-check and the patcher orphan-report consumer (advisory only — see ADR 0005).
- `src/npm-release-source.ts`, `src/fake-npm-release-source.ts` — the
  `NpmReleaseSource` seam (his published-version read, behind a fake).
- `src/adoption-history.ts`, `src/issue-publisher.ts`, `src/leaf-shell.ts`,
  `src/cli.ts`, `src/credentials-preflight.ts` — history reporting, issue
  publishing seam, leaf shell-out, the CLI entry, and the credential preflight.

Look here first. Proposals that sharpen a seam (real/fake adapter pairs),
improve testability, or clarify the gate/verdict data flow are the target.

**Fallback scope (only if `src/` is quiet):** the repo's meta-layer —
`CLAUDE.md` + `CONTEXT.md`, `docs/adr/`, `docs/design/`, `docs/agents/`,
the `.claude/hooks/` guards (+ their self-tests), and
the workflow files under `.github/workflows/`. The same proposal rules apply:
concrete before/after, sources, no speculation. You may propose edits to the
workflow envelope or this Repo-context file — a human reviews before merge.

**If after checking both scopes nothing is high-confidence, emit a `skipped`
output and stop.** A forced finding is worse than no finding — this is a small,
seam-disciplined codebase, so quiet runs are expected and correct.

## Binding disciplines — respect these; do not propose against them

These are settled decisions (in `CLAUDE.md`, `CONTEXT.md`, and `docs/adr/`). A
proposal that violates one is out of scope, not an improvement:

- **Contributor cockpit, not owner** (`CLAUDE.md`, CONTEXT "Control plane").
  The leaf repos (`tweakcc-fixed`, `lobotomized-claude-code`) are owned by a
  *separate* maintainer (`skrabe`). Never propose code that direct-pushes or
  assumes write access to a leaf; the control plane **prepares verified PRs**.
- **Verification gate split by altitude** ([ADR 0001](../docs/adr/0001-verification-gate-split-by-altitude.md)).
  Do not propose absorbing a check that has a natural home in a leaf repo. The
  control plane owns only *cross-repo* orchestration no single leaf can do.
- **Orphan detection belongs to the patcher** ([ADR 0005](../docs/adr/0005-orphan-detection-belongs-to-the-patcher.md)).
  Boot-verify + the patcher's `auditMisbinds` are the authority for the
  Four-zeros bar; the control-plane `orphan-validator` is an **advisory**
  authoring-drift pre-check only. Do not propose promoting it back to authority.
- **vs-vanilla benchmark measures targeted behavior** ([ADR 0002](../docs/adr/0002-vs-vanilla-measures-targeted-behavior.md))
  and **the gate runs local-first then GitHub-hosted CI**
  ([ADR 0003](../docs/adr/0003-gate-runs-local-first-then-github-hosted-ci.md),
  [ADR 0006](../docs/adr/0006-github-hosted-ci-runs-the-integration-gate.md)).
  Don't propose changes that break the local↔CI parity or the targeted measure.
- **No build step — run via `tsx`** ([ADR 0004](../docs/adr/0004-typescript-vitest-run-via-tsx-no-build.md)).
  Sources run directly, identically locally and in CI. Don't propose a
  `dist`/bundler/emit step or anything that reintroduces a build.
- **Real/fake adapter seams are the testing strategy.** Each external dependency
  (npm release source, adoption environment, issue publisher) has a real
  implementation behind a fake used in tests. Preserve the seam; don't propose
  collapsing a fake into the real adapter or testing against live leaves.
- **The `.claude/hooks/` guards are load-bearing** (`git-guard`, `secret-guard`;
  [ADR 0006](../docs/adr/0006-github-hosted-ci-runs-the-integration-gate.md)).
  Each ships a framework-free self-test. Don't propose weakening a guard or
  dropping its self-test.
- **The GitHub issue tracker is the execution source of record.** A proposal is
  filed as a `gh` issue, never a commit or PR.
- **pnpm + ESM only.** Don't introduce `npm`/`yarn`, CommonJS, or a committed
  non-pnpm lockfile.

## Domain language

Read `CONTEXT.md` for the canonical glossary — **Control plane**, **Leaf repo**,
**Release adoption**, **Four-zeros bar**, **Boot-verify**, **orphan variable**,
**authoring-drift pre-check**, **verification gate**. Use these exact terms in
any proposal; CONTEXT explicitly lists the synonyms to avoid (monorepo, hub,
upgrade, sync, …). The skills/loop vocabulary (**Workflow envelope**, **Proposal
loop**, **Guard hook**, **Convention**) is reused verbatim from
`~/repos/skills/CONTEXT.md`.
