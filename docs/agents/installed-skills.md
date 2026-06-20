# Installed-skill inventory

Snapshot of capabilities **installed in the harness environment** (available in every
session here) but **not** committed as files under this repo's `skills/`. A remote
`apply-agent-research` run cannot enumerate the install at run time, so this committed
snapshot is its only signal — it reads this file as part of the **already-do-this
baseline** and treats any capability listed here as *present, not absent*. Never
propose rebuilding one of these; the only proposal against an entry is an *integration*
or *novel use* with this repo's own skills.

Snapshot date: 2026-06-13. Maintenance: refresh when the harness skill set changes
(re-list from the session's available-skills catalog). This is distinct from the repo's
local `skills/` and the agent-meta files alongside it (`issue-tracker.md`,
`triage-labels.md`, `domain.md`, `idea-inbox.md`).

## Release / adoption
- **release-adoption** — full Release adoption of a new Claude Code version across the leaf repos (extract → sync → realign → patch → build → apply → boot-verify → prove value).
- **adopt** — `/adopt` release-adoption command entry point.

## Loop / orchestration
- **autonomous-loop** — take a briefed backlog to a safely-running unattended (AFK) loop; owns stop condition, per-iteration gate, HITL→AFK graduation, caps.
- **context-firewall** — restructure a long multi-item run so each item gets a fresh sub-agent context; budget checkpoints + between-item compaction.
- **loop** — run a prompt/slash command on a recurring interval (or self-paced).
- **schedule** — create/manage scheduled cloud agents (cron routines).

## Issue / planning workflow
- **triage** — drive issues through the triage-role state machine.
- **to-issues** — break a plan/PRD into independently-grabbable tracer-bullet issues.
- **to-prd** — turn conversation context into a PRD on the tracker.
- **software-design** — design modules/seams/testing strategy for a multi-issue backlog.
- **grill-me** — interview/stress-test a plan until shared understanding.
- **grill-with-docs** — grilling that sharpens terminology and updates CONTEXT.md/ADRs inline.

## Implementation / quality
- **tdd** — test-driven red-green-refactor implementation.
- **diagnose** — disciplined diagnosis loop for hard bugs / perf regressions.
- **improve-codebase-architecture** — find deepening/refactor opportunities informed by CONTEXT.md + ADRs.
- **code-review** (`/code-review`, `code-review:code-review`) — review the diff for correctness bugs + cleanups at a chosen effort; `--comment`/`--fix` modes.
- **review** — review a pull request.
- **security-review** — security review of pending changes on the branch.
- **simplify** — apply reuse/simplification/efficiency/altitude cleanups (quality only).
- **verify** — run the app and observe behavior to confirm a change works.
- **run** — launch/drive this project's app to see a change working.
- **prototype** — build a throwaway prototype (terminal app or UI variations) before committing to a design.

## Git / PR flow
- **flow-pr** — end-to-end PR lifecycle: branch → commit → push → PR → review gate → CI → merge.
- **commit** (`commit-commands:commit`) — create a git commit.
- **commit-push-pr** (`commit-commands:commit-push-pr`) — commit, push, open a PR.
- **clean_gone** (`commit-commands:clean_gone`) — prune local `[gone]` branches + worktrees.

## Knowledge / research
- **apply-agent-research** — apply an external agent-research KB to this repo's agent-meta, proposing the best improvements as labeled issues (propose-only).
- **cba-searching** — `/cba-searching` prior-art / competitive-landscape scan of GitHub.
- **find-skills** — discover and install agent skills.
- **write-a-skill** — create new agent skills with proper structure.
- **staleness-audit** — audit pinned toolchain versions for staleness; ranked report.
- **claude-api** — reference for the Claude API / Anthropic SDK (models, pricing, params, tool use, caching).

## Harness / config
- **update-config** — configure the Claude Code harness via settings.json (hooks, permissions, env).
- **keybindings-help** — customize keyboard shortcuts / keybindings.json.
- **fewer-permission-prompts** — scan transcripts and add a read-only allowlist to project settings.
- **handoff** — compact the conversation into a handoff document.
- **init** — initialize a CLAUDE.md with codebase documentation.

## Writing
- **writing-fragments** — mine the user for heterogeneous writing fragments into one doc.
- **writing-shape** — shape a markdown pile of notes into an article conversationally.
- **writing-beats** — shape an article as a journey of beats (choose-your-own-adventure).
- **frontend-design** — design/refine opinionated production-grade frontend UIs.
- **playwright-cli** — automate browser interactions (testing, forms, screenshots, extraction).

## Communication modes
- **caveman** — ultra-compressed communication mode.
- **ponytail** (`ponytail:ponytail`, `ponytail-help`, `ponytail-review`) — laziest-solution-that-works mode + over-engineering review.
