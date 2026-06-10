# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Orthogonal status tags

The five roles above are **mutually exclusive** — an issue carries exactly one. The labels
in this section are a **separate axis**: they layer *on top of* a role, not instead of it.
An issue keeps its role (`ready-for-agent`, `ready-for-human`, …) **and** additionally
carries a status tag when it applies.

### `blocked-on-skrabe`

| Label | Color | Meaning |
| ----- | ----- | ------- |
| `blocked-on-skrabe` | `#D4A72C` | The immediate next action is skrabe's, and we have nothing further to do until he acts |

The control plane is a **contributor cockpit**: it prepares verified PRs to the leaf repos
(`tweakcc-fixed`, `lobotomized-claude-code`), which are owned by a separate maintainer,
`skrabe` (CONTEXT.md → "Control plane"). When our work on an issue is genuinely complete and
the only remaining move belongs to skrabe — merging a leaf PR we already opened, or accepting
a leaf contribution we already prepared — that issue is parked on him. This tag marks that.

**Apply when** the next action is unambiguously skrabe's on something **already
prepared and open** — e.g. an open leaf PR awaiting his merge, or a prepared contribution
awaiting his acceptance — and there is nothing further we can do until he acts.

**Do NOT apply when** we still owe work: the leaf PR/finding hasn't been prepared or
submitted yet, the issue is a tracking placeholder that still needs triage or design, or
the blocker is on *us* or on the rest of our own backlog (that is not a skrabe block).

**Remove it when he acts** (he merges / accepts, or closes the leaf PR). Removing the tag
the moment he moves is what lets the queue self-clean: "show me the skrabe blockers" stays a
list of issues that are *truly* idle on him, and an issue drops back into its role queue —
surfacing the follow-up work we now owe — as soon as it is no longer blocked.
