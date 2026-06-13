# Issue tracker: GitHub

This repo's issues and PRDs live as GitHub issues in `dividedby/tweakcc-maint`,
managed via the `gh` CLI. Generic `gh` mechanics (create/view/list/comment/label/close,
repo inference) and the shared label vocabulary are the common `dividedby`
convention — canonical reference: the `skills` repo,
[`docs/agents/issue-tracker.md`](https://github.com/dividedby/skills/blob/main/docs/agents/issue-tracker.md)
and [`docs/agents/labels.md`](https://github.com/dividedby/skills/blob/main/docs/agents/labels.md).

## When a skill says "publish to the issue tracker"

Create a GitHub issue **in this repo** (`dividedby/tweakcc-maint`). This is the control plane's own backlog — distinct from the verified PRs the control plane prepares against the *leaf* repos (`tweakcc-fixed`, `lobotomized-claude-code`), which are owned by a separate maintainer (`skrabe`). See CONTEXT.md → "Control plane".

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
