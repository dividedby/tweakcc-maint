# 0007 — Defer to skrabe's canonical pieces (Showtime, the Driver, the Four-zeros bar, auditMisbinds); the control plane wraps, never reinvents

Status: Accepted (2026-06-09)

## Context

Phase B of the maintenance-machine epic (#81 → #84). The Phase A index
(`docs/index/leaf-repos.md`, anchored at `tf@1304bda` / `lcc@411f5e6`) shows the
leaf owner has published an owner-canonical verification stack in
`tweakcc-fixed`. Every time the control plane reconstructed a piece of it by
hand, the reconstruction was the defect (the #58 output-format drift; the
hand-rolled orphan validator demoted by ADR 0005). This ADR records the
defer-vs-reinvent call for each canonical piece **once**, with evidence, so it
is never re-litigated.

## Decision

For each piece: the verdict, the evidence, and the boundary.

### 1. `showtime` skill — DEFER

`skills/showtime/` (`tf@c5fabdf`; index §1.1) is the owner-canonical
leaf-altitude pipeline: SKILL.md (phases + the FOUR ZEROS + gotchas catalog),
REFERENCE.md (bug-class catalog). It encodes battle scars (stale-backup
downgrade, quote-vs-backtick escape rule, fuzzy-carryover, the three override
surfaces) the control plane learned the hard way one PR at a time. Reinventing
it guarantees lag and drift.

**The `release-adoption`-vs-`showtime` decision:** our `release-adoption` skill
(it lives in `~/repos/skills`, outside this repo) keeps only the
**control-plane envelope** — Support matrix iteration, Restore drill,
Boot-verify (with the cost-ledger wiring), the Four-zeros verdict + Adoption
record/history, and leaf-PR preparation under the contributor-cockpit rules.
For the leaf-altitude pipeline steps (extract → sync → realign → patch → build
→ apply → smoke) it defers to Showtime — shell to the leaf's published skill
and Driver rather than paralleling the steps. *This ADR records the decision
only;* editing the skill source is follow-up work outside this repo (#84 brief,
out-of-scope clause).

### 2. `driver.mjs` — DEFER (already wired)

The Driver is the canonical verification seam; the gate shells to it and keys
on exit codes, never re-parsing his prose. Decided and implemented in #80
(`src/driver-verification.ts`), recorded as the
[ADR 0005 addendum](./0005-orphan-detection-belongs-to-the-patcher.md). This
ADR consolidates the verdict; nothing is narrowed or reopened.

### 3. The Four-zeros bar — DEFER to *his* definition

The bar is skrabe's, defined verbatim in Showtime SKILL.md §10 / REFERENCE.md
§1 (`tf@c5fabdf`): smoke · apply hygiene · no orphan overrides · no latent var
breakage (`UNKNOWN_N: 0` + `unbound labels: 0` + mis-bind audit exit 0). It is
also his stated merge bar for leaf PRs — his own tf PR #7 test plan asserts
"clean Four-zeros bar + `auditMisbinds` 0" (index §1.3). The control plane's
CONTEXT.md **Four-zeros bar** entry records his definition and the gate's
mapping onto it; the gate adds control-plane-only signals (Boot-verify, the
Restore drill bracket) but never redefines the bar.

### 4. `auditMisbinds.mjs` — DEFER, never duplicate

`tools/auditMisbinds.mjs` (`tf@4e1b245`; index §1.1) is the only detector for
the Mis-bind class (wrong-but-valid binding — boots clean, wrong content;
proven by the croncreate catch, lcc PR #4, index §2.3). It is sourced as a
first-class verdict input (#80), exit-code-keyed. Two standing corollaries:
no parallel per-override harness in the data-only lobotomized repo (the #8
resolution; ADR 0001 — don't duplicate leaf checks), and no reimplementation
of the slot-resolution logic in the control plane.

### The divergence boundary (where the control plane does NOT defer)

Control-plane-only concerns with no leaf equivalent stay ours: **Boot-verify**
(the Driver's smoke is deliberately inconclusive-tolerant; ours carries the
cost ledger), the **Restore drill**, the **Support matrix**, the **Adoption
record / adoption history**, the **Behavioral A/B benchmark** (ADR 0002), and
leaf-PR preparation under the contributor-cockpit + publish-hygiene rules.

### The coordination filter (his review bar)

Every "lead" proposal (Phase C, #85) is filtered through the review bar skrabe
stated verbatim on tf PR #6 (index §1.3): **keep** version-independent helper
units; **reject** coverage redundant with a gate he already runs (showtime
no-regression + auditMisbinds + capture/read-consistency); **root-cause** a
quirk rather than snapshot it. Plus the standing PR rules: draft + intent ping,
his bar (Four-zeros incl. `auditMisbinds=0`), publish hygiene.

## Alternatives considered

- **Vendor the Driver / pipeline into the control plane.** Rejected: a copy
  silently goes stale on his next commit — the exact #58/#0005 drift class this
  decision exists to kill.
- **Parallel verification harnesses per leaf.** Rejected: duplicates gates he
  already runs, which his PR #6 review explicitly rejected (index §1.3), and
  violates ADR 0001's altitude split.
- **Treat his bar as advisory and keep our own pass condition.** Rejected: the
  leaf PRs the control plane prepares are merged against *his* bar; a private
  bar that diverges from the merge bar produces green-here/red-there PRs.

## Consequences

- CONTEXT.md gains the deferred vocabulary as first-class terms (**Showtime**,
  **Driver**, **Mis-bind**, **Three override surfaces**, **Extractor-canonical
  upstream policy**, **Private overlay**, **Publish-hygiene rule**) — the
  no-synonyms rule now covers skrabe's words.
- The `release-adoption` skill change (shell to Showtime for leaf-altitude
  steps) is recorded but unimplemented; it is follow-up work in the skills
  repo, eligible for the #85 backlog.
- Re-litigating any of the four verdicts requires superseding this ADR, not a
  fresh debate in an issue thread.
