# tweakcc-maint

Maintenance control plane for the Claude Code fork ecosystem:
[`tweakcc-fixed`](https://github.com/skrabe/tweakcc-fixed) (the patcher) and
[`lobotomized-claude-code`](https://github.com/skrabe/lobotomized-claude-code) (the prompt overrides).

Claude Code ships new versions regularly; each one can drift the patcher's regex anchors and the
prompt overrides' placeholder vocabulary. This repo coordinates keeping the fork current and proving
its value:

- **Version tracking** — detect new CC releases and kick the Release adoption runbook.
- **Testing** — broaden coverage so a Release adoption can't silently break patches/prompts.
- **CI/CD** — automate the lint → test → build → apply → `claude -p` boot-verify loop.
- **Runbooks / skills** — codify the recurring "new CC version" work.
- **Benchmarks** — verify behavioral claims over stock CC (extends `~/repos/bench`).

## Status

Architecture decisions are recorded in `docs/adr/`; the domain model lives in `CONTEXT.md`.
