# Idea Inbox — drain protocol

The canonical operating instructions for the repo's **Idea Inbox** (GitHub issue
**#99**, label `idea-inbox`). The issue body is the human-facing scratchpad; this
doc is the agent-facing drain protocol.

## Two-target intake (ADR 0009)

This repo's GitHub issue tracker is the single source of record for **two** repos —
`dividedby/tweakcc-maint` and the owned sibling `dividedby/bench`. A drained idea is
filed in **whichever repo owns the work** as a tracked GitHub issue. `bench` has no
inbox of its own; #99 is it.

## Draining the inbox

The unchecked items under `## Ideas` in #99 are raw, un-actioned ideas. When asked to
"check the idea inbox," work them:

1. **Capture** — a new idea goes in as an unchecked item at the TOP of `## Ideas`.
   Keep it short and source-faithful; do not expand it yet. Enrich with ambient
   context (where it came from, the file/issue/PR that prompted it) — don't grill or
   scope it yet.
2. **Dedup / relate** — before acting, review the OPEN issues in **both** repos
   (`gh issue list -R dividedby/tweakcc-maint` and `gh issue list -R dividedby/bench`).
   Decide whether it (a) already exists → note and drop, (b) fits INTO an existing
   issue → comment there instead of making a new one, or (c) BLOCKS / DEPENDS ON an
   existing issue → record that relationship.
3. **Grill** — for ideas to act on, run `/grill-with-docs` to build shared
   understanding and a plan against this repo's CONTEXT.md / ADRs.
4. **Promote** — turn the grilled idea into tracked work with `/to-prd` and/or
   `/to-issues`. **Pick the target repo:** bench-primitive / `@dividedby/bench-core`
   work is filed in `dividedby/bench`; everything else in `dividedby/tweakcc-maint`.
   Then register it as a census row, qualifying a bench filing as `bench#NN` (a bare
   integer means tweakcc-maint).
5. **Labels** — when filing issues, apply labels from `docs/agents/labels.md`: state
   (`needs-triage` to start), category (`bug` / `enhancement` / `chore` / `epic`),
   and a size estimate (`size:S` / `size:M` / `size:L` / `size:XL`). The compact
   vocabulary reference is `docs/agents/triage-labels.md`.
6. **Refine** — rewrite the resulting issue(s) with `/software-design`.
7. **Maintain** — keep `## Ideas` sorted (un-actioned at the top); once an idea
   becomes an issue/PR, move it under **✅ Actioned**, check it, and append `→ #<num>`
   (or `→ bench#<num>` if it landed in bench). Prune `Actioned` to a rolling window
   (~8 most recent) — older items drop off; their record survives on the `→ #N` link.

Never delete an idea silently — either action it or move it with a one-line disposition.
