# 0003 — The integration gate runs as a local command first, then GitHub-hosted CI on a fork PR branch

Status: Accepted (2026-06-07)

## Context

The integration gate ([ADR 0001](./0001-verification-gate-split-by-altitude.md))
needs three things that complicate automation: a ~220 MB Bun-compiled Claude Code
binary (per version), a **license/auth** to run `claude -p` for **Boot-verify**,
and node-lief native deps for `--apply`. Whether `claude -p` can run in ephemeral
CI was an open feasibility question.

Two facts shape the execution home:
- The maintainer (`dividedby`) is a **contributor** to leaf repos owned by a
  separate maintainer (`skrabe`); changes land via PR, not direct push.
- A VPS already exists with CC installed, auth configured, and a per-version sync
  loop (`bootstrap-vps.sh` + a HOSTS list).

## Decision

- **First slice: a single locally-runnable command.** The gate is invoked by a
  human (on the Mac or the VPS) during a release adoption. It exits non-zero on
  any breach of the **Four-zeros bar**. Building it does not block on the CI
  feasibility question — its value (one command answers "is this bump broken?") is
  fully realized when a human runs it.
- **Later: GitHub-hosted CI on the maintainer's fork PR branch.** When automated,
  the gate runs on ephemeral GitHub-hosted runners against the *fork's* PR branch
  (auth via an `ANTHROPIC_API_KEY` secret; the CC binary cached per version;
  node-lief Linux native extraction). The control plane is a contributor cockpit,
  so CI lives on the maintainer's fork, not skrabe's repo.

## Alternatives considered

- **Self-hosted VPS runner.** Tempting — the VPS already has the binary and auth.
  Rejected as the *target* home: it adds a runner to maintain and runs CI code on
  a credentialed always-on box; the maintainer preferred GitHub-hosted. The VPS
  remains available as the place a human can run the local gate command.
- **GitHub-hosted from day one.** Rejected as the *first* slice: couples the gate's
  existence to the unresolved-at-the-time license-in-CI question. Local-first
  decouples them.
- **Boot-verify with a heavyweight task.** Rejected: Boot-verify only needs CC to
  *start and run the patched path*; a trivial `claude -p` on a cheap model keeps
  per-run cost negligible.

## Consequences

- The gate command must take a target CC version + the two leaf clones as inputs
  and be environment-agnostic (same command locally and in CI).
- Eventual CI requires: an `ANTHROPIC_API_KEY` secret, a per-version binary cache,
  and confirmation that node-lief native extraction works on GitHub-hosted Linux
  (the fork already supports Linux native patching).
- Keeping secrets out of the public tree stays mandatory (the harness secret-guard
  hook + `.gitignore`).
