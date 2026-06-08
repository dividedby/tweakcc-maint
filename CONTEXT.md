# tweakcc-maint

Maintenance control plane for the Claude Code fork ecosystem. This glossary
defines the vocabulary of *keeping the fork current and proven* as Claude Code
ships new versions. It is a glossary, not a spec — no implementation detail.

Companion domain models this repo defers to:
- `~/dev/tweakcc-fixed/CLAUDE.md` — the patcher (code patches + prompt overrides, bug classes).
- `~/.tweakcc/lobotomized-claude-code/CLAUDE.md` — the prompt-override side + the orphan-variable validator.
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
_Avoid_: upgrade, sync, merge. (Reserve **version bump** for the literal
`ccVersion:` / README version-string edit, one step inside a release adoption.)

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
`Could not find system prompt 'X'`), **0** **Orphan variables**, and a passing
**Boot-verify**. Pure breakage detection — value-regression checks (prompt count
vs previous, our extractor vs Piebald) are *leaf* golden-snapshot checks in
`tweakcc-fixed`, not part of this bar ([ADR 0001](./docs/adr/0001-verification-gate-split-by-altitude.md)).
_Avoid_: green build, all-clear, health check.

**Boot-verify**:
Running `claude -p "<prompt>"` against a patched binary to prove it actually
*starts and runs* the patched path. The non-negotiable real test, because
`claude --version` does not exercise patched template literals — broken prompt
overrides only fail at runtime.
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
