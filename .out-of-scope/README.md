# `.out-of-scope/` — Already-refused filter

## Purpose

Each file in this directory records one *explicitly-refused* capability — a
proposal that was considered and deliberately declined, not merely unprioritized.
The `apply-agent-research` skill reads this directory as its **already-refused
filter**: when a file for a capability is present, the loop suppresses re-proposals
for that capability without traversing closed-issue history.

This is distinct from the already-do-this filter (which the skill derives from
`CLAUDE.md` / `CONTEXT.md` / `docs/adr/`): not "the repo already does this" but
"the repo decided **not** to, on purpose."

Source of truth: `apply-agent-research` SKILL.md §Inputs — "Already-refused
filter (if the host maintains a rejection record)":

> some repos keep one structured file per *explicitly-refused* capability, with
> the reasoning and a bar-to-revisit (this repo: `.out-of-scope/`). Read it
> directly when present — never re-propose a capability whose `.out-of-scope/`
> file shows its bar-to-revisit is unmet.

## Per-refusal file format

**Filename:** `<capability-slug>.md` — use the same kebab-case slug that the
proposal's `dedup_key` would carry (e.g. `piebald-realignment-target.md`). This
allows future runs to match a candidate by key against filenames without parsing
bodies.

**Body sections (all five required):**

### Refused request
What was proposed. One paragraph, enough for a future run to recognize a
conceptually equivalent re-proposal even under a different dedup key.

### Why out of scope
The *principle* behind the refusal, not just "we said no." A principle
generalizes: a future run that spots a related-but-distinct candidate must be
able to apply this reasoning to decide whether it is also covered.

### Bar to revisit
The condition under which this refusal would no longer hold — the field the
loop keys on (it re-proposes only if the bar is *met*). State it as an
observable change in the world (e.g. "the leaf owner ships X", "ADR NNNN is
superseded"), not "if we change our mind." `none` is a valid value for a
permanent refusal.

### Escape hatches / alternatives
What *does* cover the underlying need (an existing skill, an ADR, a leaf-owner
decision, etc.), so the run can route a valid version of the ask instead of
re-proposing a refused shape.

### Citations
Issue numbers and any other references that raised or settled this refusal.
Format: `- #NNN — <one-line summary>`

---

## Standing convention

When a `source:agent-research` proposal is closed as `wontfix`:

1. Add a file here using the format above.
2. The `wontfix` label on the issue remains; this file is the *durable,
   structured* form the loop can read directly.
3. Use the proposal's `dedup_key` as the filename slug where one was embedded in
   the issue body (`<!-- dedup-key: … -->`); otherwise derive a slug that a
   future run would naturally produce for the same capability.

Files here are append-only by convention. If a bar-to-revisit is later met and
the capability is adopted, remove the file and note the resolving issue in the
relevant ADR or CLAUDE.md entry.
