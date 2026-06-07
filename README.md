# tweakcc-maint

Maintenance control plane for the Claude Code fork ecosystem:
[`tweakcc-fixed`](https://github.com/skrabe/tweakcc-fixed) (the patcher) and
[`lobotomized-claude-code`](https://github.com/skrabe/lobotomized-claude-code) (the prompt overrides).

Claude Code ships new versions regularly; each one can drift the patcher's regex anchors and the
prompt overrides' placeholder vocabulary. This repo coordinates keeping the fork current and proving
its value:

- **Version tracking** — detect new CC releases and kick the bump runbook.
- **Testing** — broaden coverage so a bump can't silently break patches/prompts.
- **CI/CD** — automate the lint → test → build → apply → `claude -p` boot-verify loop.
- **Runbooks / skills** — codify the recurring "new CC version" work.
- **Benchmarks** — verify performance / improvement claims over vanilla Claude (extends `~/repos/bench`).

## Status

Greenfield. Scope and architecture are being designed via `/grill-with-docs` — see the handoff:
`~/handoffs/tweakcc-maintenance-infra-grill-2026-06-07-1133.md`.

Decisions land as ADRs under `docs/adr/` and the domain model in `CONTEXT.md` (created during the grill).
