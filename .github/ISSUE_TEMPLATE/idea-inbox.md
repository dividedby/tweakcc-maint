---
name: 💡 Idea Inbox
about: Living scratchpad for half-formed feature/enhancement ideas. One per repo — keep adding.
title: "💡 Idea Inbox"
labels: idea-inbox
---

## Ideas

Un-actioned ideas first, newest on top. One raw idea per line — a sentence is fine.

- [ ] 

---

### ✅ Actioned

Completed ideas move below, checked, linked to the issue/PR they became.

<!-- - [x] <idea> → #123 -->

---

<details>
<summary>🤖 Agent operating instructions — read these when pointed at this issue</summary>

You are pointed at this repo's **Idea Inbox**. The unchecked items under **## Ideas**
are raw, un-actioned ideas. When I ask you to "check the idea inbox," work them:

> **Two-target intake (ADR 0009).** tweakcc-maint's roadmap is the single census of
> record for **two** repos — `dividedby/tweakcc-maint` and the owned sibling
> `dividedby/bench`. A drained idea is filed in **whichever repo owns the work**, then
> registered as a census row here. `bench` has no inbox of its own; this is it.

1. **Capture** — a new idea I give you goes in as an unchecked item at the TOP of
   `## Ideas`. Keep it short and source-faithful; do not expand it yet.
2. **Dedup / relate** — before acting on an idea, review the other OPEN issues in
   **both** repos (`gh issue list -R dividedby/tweakcc-maint` and
   `gh issue list -R dividedby/bench`). Decide whether it (a) already exists → note
   and drop it, (b) fits INTO an existing issue → comment there instead of making a
   new one, or (c) BLOCKS or DEPENDS ON an existing issue → record that relationship.
3. **Grill** — for ideas I ask you to act on, run `/grill-with-docs` to build shared
   understanding and a plan against this repo's CONTEXT.md / ADRs.
4. **Promote** — turn the grilled idea into tracked work with `/to-prd` and/or
   `/to-issues`. **Pick the target repo:** bench-primitive / `@dividedby/bench-core`
   work is filed in `dividedby/bench`; everything else in `dividedby/tweakcc-maint`.
   Then register it as a census row, qualifying a bench filing as `bench#NN`.
5. **Refine** — rewrite the resulting issue(s) with `/software-design`.
6. **Maintain** — keep this list sorted: un-actioned ideas always at the top of
   `## Ideas`; once an idea becomes an issue/PR, move it under **✅ Actioned**, check
   it, and append `→ #<num>` (or `→ bench#<num>` if it landed in bench).

Never delete an idea silently — either action it or move it with a one-line disposition.
</details>
