# 0011 — Deprecate the release-detector + proposal-chain trigger chain

Status: Accepted (2026-06-12)

## Context

The auto-adopt pipeline originally used two workflow files to bridge npm release
detection to the Integration gate without human involvement:

- **`release-detector.yml`** — a 4h cron. It ran `src/release-detector-cli.ts`,
  which compared the npm `latest` Claude Code version against the Support matrix and
  opened one "adopt CC X.Y.Z" proposal issue per new version. Propose-only: it never
  started an adoption or mutated a leaf.
- **`proposal-chain.yml`** — a `ready-for-agent`-label trigger. When a proposal
  received the `ready-for-agent` label it ran `src/proposal-chain-cli.ts`, which
  parsed the proposal's `cc_version` marker and dispatched `integration-gate.yml`
  for that version — with no human approval step.

The chain was the manual workaround before `/adopt` existed: detection had to live in
a cron because there was no command-level entry point to ask "is there a new version?";
dispatch had to live in a label hook because there was no command that could invoke the
gate directly from the maintainer's shell.

The `/adopt` command (issues #242–#244, parent #241) replaces both roles:

- **Detection** — `/adopt` runs the alignment preflight (Phase 1: npm check + skrabe
  leaf state) at command invocation. The cron is now redundant: the command detects the
  same condition on demand and with fresher state (the cron's 4h window could miss a
  label-state change on a proposal; the command reads everything live).
- **Dispatch** — `/adopt` dispatches `integration-gate.yml` via `gh workflow run`
  directly from the maintainer's shell, replacing the label → proposal-chain →
  workflow-dispatch indirection. The human step was the intended behaviour for the
  manual entry point; the no-human-step chain was a compensation for the absence of
  a command.

## Decision

**Delete `release-detector.yml` and `proposal-chain.yml` and their exclusive src
modules.** The `/adopt` command is the sole entry point for new-version detection and
gate dispatch from this point forward.

**Keep `integration-gate.yml` intact and `workflow_dispatch(cc_version)`-dispatchable.**
The gate is CI-only infrastructure that `/adopt` cannot replicate locally: it runs a
pristine ephemeral Linux runner, installs the exact CC binary version, seeds the
strings file from the native binary (never a patched tree), runs Boot-verify with a
real headless model call, and uploads the Adoption record as a build artifact. Nothing
in the local command touches this — the gate is retained unchanged.

**Keep the `ready-for-agent` label and `docs/agents/triage-labels.md` untouched.**
The label has meaning beyond adopt proposals (AFK-ready signal for any issue) and is
not owned by the trigger chain.

Deleted alongside the workflow files (exclusive consumers only):

- `src/release-detector-cli.ts` — entry point for release-detector.yml, no other consumer
- `src/release-detector.ts` — domain module imported only by release-detector-cli.ts
- `src/proposal-chain-cli.ts` — entry point for proposal-chain.yml, no other consumer
- `src/real-issue-publisher.ts` — gh adapter imported only by release-detector-cli.ts
- `src/stub-issue-publisher.ts` — test double used only by release-detector.test.ts
- `test/release-detector-cli.test.ts`, `test/release-detector.test.ts`,
  `test/proposal-chain-cli.test.ts` — tests exclusively for the deleted modules

Retained (independently useful, have own tests or other consumers):

- `src/issue-publisher.ts` — pure formatter; `test/issue-publisher.test.ts` is its
  own unit; also used by `test/proposal-marker.test.ts`
- `src/proposal-marker.ts` — pure parser; `test/proposal-marker.test.ts` is its own unit
- `src/support-matrix.ts` — version list; used by `test/support-matrix.test.ts` and
  `test/support-matrix-status.test.ts`

## Alternatives considered

- **Keep the chain alongside `/adopt` as a fallback cron.** Rejected — the command
  fully covers detection and dispatch; a parallel cron adds maintenance surface with no
  payoff and could race with an in-flight command run (opening a duplicate proposal
  while the command is mid-adoption).
- **Keep only `release-detector.yml`, drop the label hook.** Rejected — if the
  detector is gone, the cron serves no function (it has nowhere to dispatch the gate).
  If the detector is kept, the human label step is the bottleneck the chain was built
  to avoid, which no longer applies once `/adopt` owns the full flow.

## Consequences

- New CC releases are detected by running `/adopt` rather than waiting up to 4h for
  the cron. The maintainer controls the timing of each adoption cycle.
- `integration-gate.yml` remains `workflow_dispatch(cc_version)`-only; no automated
  trigger fires it. The `proposal_issue` input is retained for manual gate runs that
  want write-back to an open adoption proposal.
- The cron's 4h worst-case detection window is gone; detection latency is now whatever
  the maintainer's review cadence is. This is acceptable: the control plane is a
  contributor cockpit, not an automated release pipeline.
