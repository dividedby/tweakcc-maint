# tweakcc-maint — agent guide

Maintenance **control plane** for the Claude Code fork ecosystem. `README.md` is the
human overview; this file is the agent index. Keep entries earn-the-line.

## Read before proposing
- `CONTEXT.md` — the domain glossary. Use these exact terms; don't coin synonyms for them.
- `docs/adr/0001`–`0003` — load-bearing decisions (verification gate split by altitude ·
  vs-vanilla benchmark measures targeted behavior · gate runs local-first then CI). Check the
  relevant one before changing gate, benchmark, or CI design.

## Contributor cockpit, not owner
The leaf repos — `tweakcc-fixed`, `lobotomized-claude-code` — are owned by a *separate*
maintainer (`skrabe`). Never direct-push or assume write access to a leaf: the control plane
**prepares verified PRs**. (Full model: CONTEXT.md → "Control plane".)

## Build / test / run
Stack: **TypeScript + vitest + pnpm + ESM, run via `tsx` (no build step)** — see
`docs/adr/0004`. The exact build / test / lint / run incantations land here once slice 1
scaffolds `package.json`. Design: `docs/design/release-adoption-substrate.md`.

## Agent skills

### Issue tracker

GitHub Issues in `dividedby/tweakcc-maint` (the control plane's own backlog; verified PRs go to the leaf repos). See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the root. See `docs/agents/domain.md`.
