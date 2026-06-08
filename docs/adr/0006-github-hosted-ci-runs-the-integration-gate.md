# 0006 — GitHub-hosted CI runs the Integration gate on the fork

Status: Accepted (2026-06-07)

Realizes the "later" half of [ADR 0003](./0003-gate-runs-local-first-then-github-hosted-ci.md):
the gate now also runs unattended on GitHub-hosted CI, not only as a local command.
This ADR records the feasibility verdict on ADR 0003's three open questions and the
workflow design they unblock.

## Context

ADR 0003 shipped the gate local-first and deferred CI behind three feasibility
unknowns: whether `claude -p` (Boot-verify) can run in ephemeral CI, how the
per-version Claude Code binary is supplied, and whether node-lief native patching
works on GitHub-hosted Linux. ADR 0003 also made keeping secrets out of the public
tree mandatory but deferred the **harness guards** that enforce it — there was no
unattended `claude -p` runner yet to be the trigger. This slice (PRD #2, slice 4;
issue #10) adds that runner, so the guards land here.

## Decision

**Run the same environment-agnostic gate command (`pnpm tsx src/cli.ts`) on a
GitHub-hosted `ubuntu-latest` runner, on the maintainer's fork (`dividedby`), never
on the leaf owner's (`skrabe`) repo** — the control plane is a contributor cockpit
(CONTEXT.md → Control plane).

The three ADR-0003 unknowns resolve, all green:

1. **License/auth in CI is feasible.** `ANTHROPIC_API_KEY` alone authenticates
   `claude -p` headlessly — it sits above OAuth in the auth precedence and no
   onboarding/TTY prompt blocks `-p`. The gate already reads `ANTHROPIC_API_KEY`
   (`src/cli.ts`). Boot-verify asserts on the model's *reply content* (`"ok"`), not
   on `claude`'s exit code, so print-mode's undocumented exit semantics are moot.
2. **The per-version binary is CI's to install, not this repo's.** The gate assumes
   `claude` on PATH and never fetches it (`src/real-adoption-environment.ts`). CI
   pins a version with the native installer
   (`curl -fsSL https://claude.ai/install.sh | bash -s <version>` → `~/.local/bin/claude`),
   caches `~/.local/share/claude/` keyed on the version, and sets
   `DISABLE_AUTOUPDATER=1` so the pin holds. The matrix is installed-version-only
   (`listMatrix()` reads `claude --version`), so the workflow's `cc_version` input
   *is* the Support matrix: install it, the gate discovers it.
3. **node-lief on Linux is a leaf concern, low-risk.** node-lief is not a dependency
   here (`dependencies` is empty); the gate shells out to the leaf's built
   `dist/index.mjs --apply`. If the fork's Linux native patching regressed it would
   surface as `failedPatches` in the Adoption record — a clean gate FAIL, not a CI
   infrastructure error. The fork already supports Linux native patching; the first
   real run confirms it.

**The deferred harness guards land in this PR.** Two checked-in PreToolUse Bash
hooks under `.claude/`, plus `.claude/settings.json` wiring them at project scope:

- **git-guard** — hard-blocks destructive git (force-push, `reset --hard`,
  `clean -f`, discard-style checkout/restore; branch-delete only when unattended).
  Mirrors the worked exemplar in the skills repo.
- **secret-guard** — hard-blocks the two ways the `claude -p` license reaches the
  public tree: a force-add (`git add -f`) of a credential-shaped path, and a
  redirect/`tee` of a known credential env var or `sk-ant-` literal into a file.

Project scope (not the maintainer's global `~/.claude`) is the point: the guards
must run under unattended `claude -p`, where the global guards are absent.

## Alternatives considered

- **npm global install of the CC binary** (`npm i -g @anthropic-ai/claude-code@<v>`).
  Works, but it is a shim over the same native binary; the `install.sh … bash -s <v>`
  path installs the binary directly and is the documented version-pin mechanism.
- **A separate minimal feasibility spike** before the full workflow. Rejected: the
  full workflow's first run against the already-known-good installed version *is* the
  feasibility proof, with no throwaway artifact to maintain.
- **Landing the guards in a separate PR.** Rejected: ADR 0003 tied the guards to the
  arrival of the unattended runner; the runner arrives here, so the guards do too.

## Consequences

- A `cc_version`-driven `workflow_dispatch` is the initial trigger, matching the
  release detector's "adopt CC X.Y.Z" proposals (#6/#19). Issue/PR-driven triggers
  are a later refinement.
- The job clones both leaves and builds `tweakcc-fixed` (`pnpm install && pnpm build`)
  before invoking the gate — the gate runs the leaf's `dist/index.mjs`.
- `ANTHROPIC_API_KEY` is a repository secret on the fork; the secret-guard + existing
  `.gitignore` keep it out of the tree.
- The Adoption record is uploaded as a build artifact — the machine-readable evidence
  the same record feeds into the slice-6 adoption-history surface (#12).
- Acceptance (#10) is satisfied only once the workflow's first real run is green; the
  PR is prepared on that basis.
