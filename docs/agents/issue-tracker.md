# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues in `dividedby/tweakcc-maint`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue **in this repo** (`dividedby/tweakcc-maint`). This is the control plane's own backlog — distinct from the verified PRs the control plane prepares against the *leaf* repos (`tweakcc-fixed`, `lobotomized-claude-code`), which are owned by a separate maintainer (`skrabe`). See CONTEXT.md → "Control plane".

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
