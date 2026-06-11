---
name: release-adoption
description: Walk a maintainer through a full Release adoption of a newly-shipped Claude Code version across the fork's leaf repos — extract, sync prompts, realign overrides, patch, build, apply, boot-verify, prove value — verifying with the shipped Integration gate and preparing verified PRs to the leaves. Use when a new Claude Code version ships and the fork must be made current and proven, when adopting/bumping a CC version, or when an "adopt CC X.Y.Z" proposal issue is picked up.
---

# Release adoption

Drives the recurring **Release adoption** (CONTEXT.md): making the fork *current and
proven* on a newly-shipped Claude Code version. This is the whole task — not the
`ccVersion:` version-string edit (that is one step inside it).

## The guardrail — read first

This repo (`tweakcc-maint`) is the **control plane** / contributor cockpit. The leaf
repos (`tweakcc-fixed`, `lobotomized-claude-code`) are owned by a *separate* maintainer
(`skrabe`).

- **NEVER direct-push, merge, or otherwise mutate a leaf.** You prepare **verified PRs**
  with a green **Four-zeros bar** as the attached evidence.
- All changes to a leaf land on a branch in your fork → PR. The Integration gate's
  **Adoption record** is the PR evidence.
- This skill orchestrates the leaves; it does not own their internals. If a step seems to
  need a direct leaf mutation outside a PR, STOP and surface it.

## Execution model

Local-first ([ADR 0003](../../../docs/adr/0003-gate-runs-local-first-then-github-hosted-ci.md)):
a human runs this on the Mac or the VPS. CI is a later slice (#10) — do not assume it here.

The **Verification gate** splits by altitude ([ADR 0001](../../../docs/adr/0001-verification-gate-split-by-altitude.md)):
**leaf checks** (unit + golden-snapshot tests) live in the leaf repos and run as each
leaf's own `pnpm test`; the **Integration gate** (real apply → Boot-verify → Orphan-variable
validation across the **Support matrix**) is owned here and is what the verify step below
invokes. Do not reimplement either altitude's checks in this skill.

## The sequence

Map work to the CONTEXT.md Release-adoption steps in order. Steps 1–6 are leaf authoring
work (prepared on fork branches); step 7 is this repo's gate; step 8 is optional.

1. **Extract** — pull the new CC version's system prompts / templates with `tweakcc-fixed`'s
   extractor against the newly-shipped binary. This feeds everything downstream.
2. **Sync prompts** — reconcile the extracted prompts against the prior version; surface
   added / removed / changed prompts. Value-regression (prompt-count vs previous, our
   extractor vs Piebald) is a *leaf golden-snapshot check* in `tweakcc-fixed`, not this
   skill's job — run the leaf's `pnpm test`.
3. **Realign overrides** — realignment is not one edit; it's a **per-override classification**
   into one of skrabe's four fates (use his exact terms — see leaf commit `411f5e6`,
   the 2.1.169 realignment):
   - **RETRIM** — a curated (trimmed) override sits on a pristine Anthropic *rewrote*. Re-do the
     trim onto the new pristine and fold in terminology renames, **new/renamed variable slots**,
     and new rules. (e.g. `agent-prompt-worker-fork` gained `${AGENT_TOOL_NAME}`; `..._VAR_0` →
     `SHOULD_PERSIST_APPROVAL_CONTEXT_FN`.) Validate `${VAR}`s against the leaf's OWN bundled
     `prompts-X.Y.Z.json` identifierMap, not Piebald's.
   - **RESYNC** — a near-verbatim passthrough that upstream wholesale-rewrote. Drop the stale
     copy, adopt the new pristine.
   - **KEEP_SUPPRESSED** — an empty-body suppression that still holds. Leave it.
   - **NET-NEW** — upstream shipped new prompts. Add pristine off-the-shelf stubs — **even for
     off-by-default gated features** (the pristine is still captured).

   Two directions of slot drift, both live here: *additive* (new/renamed slots to fold in) and
   *vanished* — an **Orphan variable**, a `${VAR}` that no longer exists in the patched binary's
   runtime scope. The patcher owns authoritative orphan detection
   ([ADR 0005](../../../docs/adr/0005-orphan-detection-belongs-to-the-patcher.md)); the gate's
   Boot-verify catches runtime-scope orphans. Skip this whole step if the prompt diff (step 2)
   moved nothing under the overrides.
4. **Patch** — realign `tweakcc-fixed`'s code patches (match-methods) to the new CC shape.
   Never delete an old match-method while its CC shape is still in the **Support matrix**.
   To add a *new* patch, see [the add-a-patch sub-flow](references/add-a-patch.md).
5. **Build** — there is no bundler in this control plane (ADR 0004); "build" here means the
   leaves' own build/prep. Run each touched leaf's build + `pnpm test` (leaf checks) and get
   them green before applying.
6. **Apply** — applying is exercised by the gate against a real CC install, bracketed by the
   **Restore drill**. Do NOT hand-run `--apply`/`--restore` as a separate check — the gate
   below owns that (Four-zeros + Restore drill). Just confirm a backup exists.
7. **Boot-verify (run the Integration gate)** — the verify step. See below.
8. **Prove value (optional)** — the **Behavioral A/B benchmark** (stock CC vs lobotomized-CC).
   Out of scope for this skill beyond noting it (#11); not required to ship the adoption.

## Verify step — run the shipped Integration gate

Do **not** reimplement Four-zeros, Boot-verify, or Restore-drill logic here. Invoke the
shipped gate CLI:

```bash
pnpm tsx src/cli.ts
```

It builds the **Support matrix** from the environment, runs a real `--apply` →
**Boot-verify** → **Orphan-variable** validation, brackets it with the **Restore drill**,
prints the **Adoption record** as JSON to stdout, and exits with the gate's code.

Before running:
- Leaf clones default to siblings under `~/repos`; override with `TWEAKCC_FIXED_DIR` /
  `LOBOTOMIZED_DIR` if elsewhere.
- Credentials must be in the environment (`CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`)
  — Boot-verify runs a real `claude -p`. Nothing is committed.
- A backup must exist: the gate runs a real `--restore`. If the record reports a failed or
  dirty restore, restore manually with `tweakcc-fixed --restore`.

Interpret the result — this is the pass/fail decision:

| Exit code | Meaning | Action |
|---|---|---|
| `0` | `pass: true` — every matrix version cleared its **Four-zeros bar** AND **Restore drill** | Adoption verified. Proceed to PR. |
| `1` | A breach — some version failed Four-zeros or the Restore drill | **BLOCKING.** Read the per-version `AdoptionRecord`, fix the offending leaf step, re-run. Do not open a PR. |
| `2` | No credentials | Set `CLAUDE_CODE_OAUTH_TOKEN` / `ANTHROPIC_API_KEY` and re-run. |

A non-zero exit or `pass: false` is a **blocking failure**: the adoption is not done. Never
prepare a PR on a red gate.

## Prepare verified PRs to the leaves

Only after the gate is green (`pass: true`, exit `0`):

- Open one PR per touched leaf repo from your fork branch — never direct-push.
- **Body the PR with the standard evidence body** (#215). Don't hand-roll prose: every realign/
  adoption leaf PR carries the same three halves, composed by `renderLeafPrEvidence`
  (`src/leaf-pr-evidence.ts`) into one markdown body —
  1. the **Adoption record** for this version, mapped onto the **Four-zeros bar** (the four zeros
     spelled out: 0 failed patches · 0 missing system prompts · 0 **Orphan variables** ·
     **Boot-verify**; plus `auditMisbinds=0` when the **Mis-bind** audit ran);
  2. the Behavioral A/B **prove-value** result (`renderProveValueResult`, #214) — the fork's value
     evidence, explicitly NOT part of the bar (ADR 0002/0003: a vs-vanilla benchmark, evidence not
     a gate);
  3. the **pristine** extract provenance (the `npm pack` source the realign was diagnosed against,
     never a patched tree — #211/#213).
  The producer throws if the three halves disagree on the CC version, so mismatched evidence can
  never silently body a PR. It lives HERE and only *prepares* a body — it opens no leaf PR.
- If an "adopt CC X.Y.Z" proposal issue exists (from the release detector), link the PRs to it.
- Save the Adoption record + the prove-value artifact — they aggregate into the auditable adoption
  history (slice-6 reporting surface).

## Checklist

- [ ] Extracted the new version's prompts (step 1).
- [ ] Synced prompts; leaf golden-snapshot checks green (steps 2, 5).
- [ ] Realigned overrides; no authoring-drift orphans flagged (step 3).
- [ ] Patched / added match-methods; old in-matrix methods preserved (step 4).
- [ ] Each touched leaf's `pnpm test` is green (leaf checks, ADR 0001).
- [ ] Backup exists for every Support-matrix version.
- [ ] `pnpm tsx src/cli.ts` exited `0` with `pass: true` (Integration gate).
- [ ] One verified PR per touched leaf, Adoption record attached. No direct-push.
