# tweakcc-maint

Maintenance control plane for the Claude Code fork ecosystem. This glossary
defines the vocabulary of *keeping the fork current and proven* as Claude Code
ships new versions. It is a glossary, not a spec — no implementation detail.

Companion domain models this repo defers to:
- `tweakcc-fixed` → `skills/showtime/SKILL.md` + `REFERENCE.md` — the patcher's
  owner-canonical pipeline + bug-class catalog (**Showtime**, tracked since
  `tf@c5fabdf`; the repo's CLAUDE.md/AGENTS.md are untracked per-machine files
  since `tf@afafd6a` — index §1.1).
- `lobotomized-claude-code` → `CLAUDE.md` — the prompt-override side: repo goal, the
  per-claim decision rule, the three valid override outcomes (no override / trimmed /
  full-wiped), the sibling-check protocol (`lcc@411f5e6`; index §2.1).
- `~/repos/skills/CONTEXT.md` — the skills/run-book/loop vocabulary this repo reuses verbatim
  (**Run-book**, **Autonomous/Proposal loop**, **Guard hook**, **Convention**, **Workflow envelope**).

## Language

**Control plane**:
This repo (`tweakcc-maint`). Owns *cross-repo* orchestration of release
adoption — the work no single leaf repo can do alone. Deliberately thin: it
does not absorb checks that have a natural home in a leaf repo
([ADR 0001](./docs/adr/0001-verification-gate-split-by-altitude.md)). A
**contributor cockpit**, not an owner's console: the maintainer (`dividedby`)
contributes to leaf repos owned by a *separate* maintainer (`skrabe`) via PR, so
the control plane **prepares verified PRs** — it never assumes direct-push
authority over a leaf. A green **Four-zeros bar** is the evidence attached to a PR.
_Avoid_: monorepo, hub, umbrella.

**Leaf repo**:
A repo the control plane orchestrates but does not own:
[`tweakcc-fixed`](https://github.com/skrabe/tweakcc-fixed) (the patcher),
[`lobotomized-claude-code`](https://github.com/skrabe/lobotomized-claude-code)
(the prompt overrides), `~/repos/bench` (the benchmark harness), and
`~/repos/skills` (run-books / onboarding). Leaf-level checks live in the leaf.
_Avoid_: submodule, dependency, child repo.

**Release adoption**:
The recurring end-to-end unit of work this control plane exists to de-risk:
making the fork *current and proven* on a newly-shipped Claude Code version —
extract → sync prompts → realign overrides → patch → build → apply →
boot-verify → (prove value). The whole task, not the version-string edit.
_Avoid_: upgrade, sync, merge. skrabe's name for the leaf-altitude pipeline is
**Showtime**; his docs also say "CC version bump" for the *whole* pipeline,
never just the version-string edit (index §1.1, `tf@c5fabdf`). In control-plane
docs say **Release adoption**; translate when reading leaf docs.

**Verification gate**:
The deterministic pass/fail decision that a **Release adoption** is complete and
not broken. Two altitudes ([ADR 0001](./docs/adr/0001-verification-gate-split-by-altitude.md)):
**leaf checks** (unit + golden-snapshot tests inside the leaf repos) and the
**Integration gate** (owned here).
_Avoid_: test suite, CI, validation.

**Integration gate**:
The cross-repo slice of the **Verification gate** that `tweakcc-maint` owns
because it spans both leaf repos plus a real CC binary: real `--apply` against a
real Claude Code install → **Boot-verify** → **Orphan variable** detection (the
patcher's **Orphan report** statically, **Boot-verify** at runtime). This is the
layer that catches what unit tests structurally
cannot — runtime-only breakage. Its pass-bar is the **Four-zeros bar**, asserted across the
**Support matrix** and bracketed by a **Restore drill**; each run emits an
**Adoption record**.
_Avoid_: e2e test, smoke test, integration test.

**Support matrix**:
The set of Claude Code versions the fork claims to support (the VPS HOSTS run
several at once, not just the latest). The **Integration gate** asserts the
**Four-zeros bar** *per version*; a **Release adoption** passes only if **every**
matrix version passes. This is why old patch match-methods are never deleted
while their CC shape is still in the matrix.
_Avoid_: version list, targets, supported set.

**Restore drill**:
The gate phase that proves the escape hatch: confirm a backup exists → `--apply`
→ **Four-zeros bar** → `--restore` → verify the install returns to clean stock.
Guards against a bad adoption bricking an install with no proven way back.
_Avoid_: rollback test, revert check.

**Adoption record**:
The structured artifact the gate emits per run — CC version(s), per-version
**Four-zeros** result, **Restore drill** result, **Behavioral A/B** verdict, and
date. Aggregated into an auditable adoption history (the control plane's reporting
surface) and reusable as PR evidence.
_Avoid_: log, report, result.

**Four-zeros bar**:
The **Integration gate**'s pass condition after a real `--apply`: **0** failed
patches (no `patch: <name>: failed to find …`), **0** missing system prompts (no
`Could not find system prompt 'X'`), **0** **Orphan variables**, a passing
**Boot-verify** — and, when the **Mis-bind** audit ran, `auditMisbinds=0`.
The bar is *skrabe's*, not ours — **Showtime** SKILL.md §10 / REFERENCE.md §1
(`tf@c5fabdf`; index §1.1) defines his FOUR ZEROS as (1) smoke, (2) apply
hygiene (0 `✗` / `failed to find` / `Could not find` / `Conflicts detected`),
(3) no *orphan overrides* (the version-bump report's `prompt overrides not in
JSON: 0` — an orphan *override* is a file with no live prompt id, distinct from
our **Orphan variable**), and (4) no latent var breakage (`UNKNOWN_N: 0`,
`unbound labels: 0`, **mis-bind audit exits 0**). The gate sources these zeros
from the **Driver** ([ADR 0005 addendum](./docs/adr/0005-orphan-detection-belongs-to-the-patcher.md))
and is also his stated merge bar for prepared leaf PRs (tf PR #7 test plan;
index §1.3). Pure breakage detection — value-regression checks (prompt count
vs previous, our extractor vs Piebald) are *leaf* golden-snapshot checks in
`tweakcc-fixed`, not part of this bar ([ADR 0001](./docs/adr/0001-verification-gate-split-by-altitude.md)).
_Avoid_: green build, all-clear, health check.

**Boot-verify**:
Running `claude -p "<prompt>"` against a patched binary to prove it actually
*starts and runs* the patched path. The non-negotiable real test, because
`claude --version` does not exercise patched template literals — broken prompt
overrides only fail at runtime. skrabe's **Showtime** "smoke" (his zero #1) is
the leaf-altitude counterpart; the **Driver**'s smoke step is
inconclusive-tolerant, so Boot-verify stays the control plane's own
authoritative runtime check ([ADR 0005 addendum](./docs/adr/0005-orphan-detection-belongs-to-the-patcher.md)).
_Avoid_: smoke test, version check, sanity check.

**Behavioral A/B benchmark** (a.k.a. vs-vanilla benchmark):
The value-proving track (separate from the **Verification gate**'s
correctness track): a head-to-head of **stock CC** vs **lobotomized-CC** on the
*same* model + effort + prompt, judged on the behaviors the **Lobotomy** targets,
with a **Correctness guardrail**. Reuses `~/repos/bench`'s run/judge/aggregate
*mechanics* as primitives; the tweakcc-specific fixtures, rubric, and A/B driver
live here ([ADR 0002](./docs/adr/0002-vs-vanilla-measures-targeted-behavior.md)).
Outputs evidence for the fork's claims, not a pass/fail gate.
_Avoid_: eval, quality test, regression.

**Lobotomy**:
The intent of the `lobotomized-claude-code` override set: stripping Claude
Code's default assistant personality (sycophancy, hedging, unsolicited
"would you like me to…" offers, verbosity) toward terse directness. It targets
*behavior*, not *capability* — so the **Behavioral A/B benchmark** measures the
behavioral axes, not generic task success.
_Avoid_: jailbreak, tuning, customization.

**Stock CC** / **lobotomized-CC**:
The two binaries the **Behavioral A/B benchmark** compares: an unpatched Claude
Code install vs. one with the `lobotomized-claude-code` overrides applied via
`tweakcc-fixed --apply`. Same version, same model/effort — only the overrides differ.
_Avoid_: vanilla/patched, control/treatment (use these exact names).

**Correctness guardrail**:
The check, inside the **Behavioral A/B benchmark**, that the **Lobotomy** wins on
behavioral axes *without* regressing task correctness. Distinguishes "more direct"
from "more direct but wrong."
_Avoid_: sanity check, baseline.

**Orphan variable**:
A `${VAR}` interpolation that survives into the *applied* prompt but no longer
exists in the patched binary's runtime scope (Anthropic renamed or inlined it).
Crashes CC with `ReferenceError: VAR is not defined` at runtime. Detected at
runtime by **Boot-verify** and statically by the patcher's **Orphan report**
(both consumed by the **Integration gate**'s **Four-zeros bar**); a thin static
**authoring-drift pre-check** flags only the narrower authoring-time case — a
declared backing variable upstream renamed or inlined — and cannot see runtime
scope.
_Avoid_: dangling var, bad placeholder, missing token.

**Orphan report**:
The authoritative *static* enumeration of **Orphan variables**: the surviving,
evaluated-position placeholders the patcher emits from its *own* apply-time
resolution — which alone knows both the `identifierMap` slots it left unfilled
*and* the splice context that makes them crash-class. Complete across *all*
prompts (including lazy paths a single **Boot-verify** never runs), but blind to
the *filled-but-stale* class — a slot resolved to a real identifier no longer in
runtime scope — that only **Boot-verify** catches. The two are complementary
altitudes, neither a superset; the **Four-zeros bar** needs both. Consumed by the
**Integration gate**, replacing the thin static **authoring-drift pre-check**
([ADR 0005](./docs/adr/0005-orphan-detection-belongs-to-the-patcher.md)).
_Avoid_: orphan list, placeholder dump.

**Showtime**:
skrabe's owner-canonical, leaf-altitude pipeline for bringing the fork up to a
new CC version — published as `skills/showtime/` in `tweakcc-fixed`
(`tf@c5fabdf`; index §1.1): `SKILL.md` (the pipeline phases + the **Four-zeros
bar** + the gotchas catalog), `REFERENCE.md` (the bug-class "why" catalog), and
the **Driver**. The control plane defers to it and never reinvents it
([ADR 0007](./docs/adr/0007-defer-to-skrabes-canonical-verification-pieces.md));
a **Release adoption** is the cross-repo envelope around a Showtime run.
_Avoid_: bump runbook, version-bump skill, his runbook.

**Driver**:
`skills/showtime/driver.mjs` — the canonical verification seam the **Integration
gate** shells to when present in the configured checkout
(`src/driver-verification.ts`, #80): `check` (zeros 1–2: smoke + apply hygiene),
`report` (zero 3 + the `UNKNOWN_N` count), beside `tools/auditMisbinds.mjs`
(the **Mis-bind** audit). The gate keys on its exit codes and never re-parses
its prose (the #58 drift class); driver-absent falls back to the hand-rolled
path ([ADR 0005 addendum](./docs/adr/0005-orphan-detection-belongs-to-the-patcher.md)).
_Avoid_: verification script, harness wrapper, four-zeros tool.

**Mis-bind**:
An override placeholder that resolves to a *wrong-but-valid* identifier — its
`${NAME}` sits at a different `identifierMap` slot than upstream's complete map,
so the prompt renders wrong content with **no crash**: invisible to the other
zeros, to smoke, and to **Boot-verify** (proven by the croncreate catch:
`${CANCEL_TIMEFRAME_DAYS}` bound to a function and booted clean —
lobotomized PR #4, fixed at `tf@50e1ff0` + `lcc@54e0d34`; index §2.3). Detected
only by the leaf's mis-bind audit (`tools/auditMisbinds.mjs`, `tf@4e1b245`);
`auditMisbinds=0` is part of the **Four-zeros bar**.
_Avoid_: wrong-capture binding, slot mismatch, misbinding.

**Three override surfaces**:
The three distinct mechanisms by which lobotomized overrides reach the binary
(Showtime REFERENCE.md; index §2.1): **named-prompt** (the `system-prompts-*`
dirs, keyed to the prompts-JSON `identifierMap`), **inline-blob** (`inline-*`
files: positional remapping of minified identifiers, *not* in the prompts JSON —
never check them against the `identifierMap`), and **system-reminders**
(`system-reminders/`, paired with the patcher's `systemReminderOverrides.ts`).
Validators and realigns are surface-specific; conflating surfaces yields false
orphan flags.
_Avoid_: override types, override categories, override kinds.

**Extractor-canonical upstream policy**:
`tweakcc-fixed`'s relationship to upstream (Piebald's tweakcc): diverged at
tweakcc v4.0.14 and fetch-only since (`tf@7e4a5c2`); the prompt JSONs are the
fork's *own extraction* (since 2.1.161, `tf@0ea49c2`), superseding upstream's
prompt-JSON drops — while the extractor *adopts upstream's `identifierMap`
vocabulary for shared prompts* (`tf@38daf92`, the convergence that made
**Mis-binds** structurally impossible for shared prompts; index §1.2).
Consequences: realigns target the leaf's own bundled JSON, and "merge from
upstream" is never a **Release adoption** step.
_Avoid_: upstream sync, merge from Piebald, rebase on upstream.

**Private overlay**:
The third layer of the fork ecosystem, above the two public leaves: skrabe's
private `skrabes-claude-code` repo + a "bake-once" personal override overlay,
revealed when `scripts/` was scrubbed from the public repo (`tf@91df974`;
index §1.2). The lineage model is **two public lineages + one private overlay
we can't see** — the public override set is not the complete effective set.
_Avoid_: private fork, hidden repo, third lineage.

**Publish-hygiene rule**:
The hard constraint the **Private overlay** imposes on every prepared leaf PR:
the public fork must never carry personal infra — host names, fork URLs, model
sets, the `~/.tweakcc/config.json` push, private-overlay references
(`tf@91df974`, `tf@8cbeaf7`; index §1.2).
_Avoid_: privacy rule, no-secrets rule.
