# Adoption records — the on-disk adoption history

One file per green Integration-gate run, saved verbatim as the gate emits it
(`pnpm tsx src/cli.ts` stdout): `adoption-record-<cc-version>.json`. This is the
durable Support-matrix surface (CONTEXT.md → "Adoption record"): a CC version is
*in* the matrix when a green record for it lives here. `src/adoption-history.ts`
(`summarizeHistory`/`renderHistory`) aggregates these records into the auditable
adoption history / PR evidence.

Records are saved as emitted — no extra fields. Run context that the JSON cannot
carry goes in the per-record notes below.

Draft records (`adoption-record-<cc-version>.draft.json`) are **pre-staged** runs
against not-yet-merged leaf refs — evidence, not matrix membership. A version
enters the matrix only when the suffix-less record (a merge-day re-run against
the merged leaf mains) lands.

## Run-context notes

- **2.1.177 — DRAFT / NOT a matrix member** (re-confirmed 2026-06-15, local run,
  **overrides isolated**, against skrabe's now-**merged** tweakcc-fixed `main` @`a8ae557`
  — he shipped 2.1.177 himself: release 2.0.3 `4b4d445` / prompts-2.1.177 `006c070` /
  `user-sent-new-message` anchor `c4bae1f`; our pre-merge **tweakcc-fixed** PRs #11/#10
  closed superseded). Green Four-zeros (`failedPatches` / `missingSystemPrompts` /
  `orphanVariables` / `misbinds` all empty) + Boot-verify + clean Restore drill —
  validates the **patcher + prompts** only. `auditMisbinds`: **not-run** (moot under
  isolation — empty override surface).
  **Matrix finalize is blocked** — not on the patcher, but on the lobotomized override
  surface being clean at 2.1.177. The matrix bar is `auditMisbinds=0` against the *real*
  override surfaces (per the 2.1.170 finalized precedent below); a full-override run reds
  on orphans this gate surfaced:
  - **claude-code-guide** (active `opus-4-8` + `opus-4-7`): 2.1.177 renamed slot 0 of
    `Agent Prompt: claude-code-guide` (`AGENT_PROMPT_CLAUDE_CODE_GUIDE_VAR_0` →
    `SEND_MESSAGE_TOOL_NAME`); the override stayed pinned `ccVersion: 2.1.141` and is now
    orphaned — skrabe's `85ef3bd` realign batch missed it. Realign prepared as
    **lobotomized draft PR #10** (dividedby → skrabe), opus-4-8 + opus-4-7 only.
  - **fable-5** (dormant): `system-prompt-autonomous-loop-tick-dynamic` (4 slots renamed)
    + the claude-code-guide copy, orphaned at 2.1.177; skrabe marked fable-5 dormant in
    `85ef3bd`, so left untouched (his call).
  - The patcher-report orphan list also named `WORKFLOW_*` / `EMPTY_STRING`, which the
    control-plane orphan producer does not reproduce at HEAD — a detector mismatch flagged
    for separate reconciliation, not confirmed drift.
  Finalize once skrabe's lobotomized `main` is clean at 2.1.177 (lobotomized PR #10 merged
  + fable-5 resolved/excluded), via a merge-day re-run with `auditMisbinds` executed.

- **2.1.170 — FINALIZED / MATRIX MEMBER** (2026-06-10, merge-day re-run against the
  **merged leaf mains**: tweakcc-fixed@`7d9b30b` × lobotomized@`f1db0de` — the merged
  mains that carry tf PR #7 / lcc PR #6, via detached worktrees) — the suffix-less record
  is now the 2.1.170 Support-matrix add (#94 step 3). Re-run vs the merged mains per the
  `e335fb9` merge-time-regen lesson (do **not** reuse the pre-merge PR-head run): green
  Four-zeros (`failedPatches` / `missingSystemPrompts` / `orphanVariables` / `misbinds`
  all empty) + Boot-verify + executed `auditMisbindsPassed: true` + clean Restore drill
  (byte-identical clean stock). Overrides isolated (same discipline as 2.1.169; the #26
  offender would red any full-override run) — the gate's runtime writes landed in a
  throwaway dir, the work clone untouched. Advisory orphan `JSON` vs 2.1.169 is static-scan
  noise: `${JSON.stringify(…)}` JS template literals in `workflow-script-*` /
  `skill-design-sync-*` overrides (present in both fable-5 and opus-4-8 sets) —
  backtick-delimiter class, relevant to #96. Mis-bind audit: **executed** (not SKIPPED)
  against the Piebald upstream dump `/tmp/pieb-2.1.170.json` (346 prompts) present on the
  box, vs the merged mains' `prompts-2.1.170.json` × each override surface →
  `auditMisbindsPassed: true`, **0** across all three surfaces (`system-prompts-fable-5`,
  `-opus-4-7`, `-opus-4-8`; each: "mis-bind audit: 0 — every used placeholder sits at the
  upstream slot"). The pre-merge PR-pair draft (tf PR 7 head `e096008` × lcc PR 6 head
  `07e75b9`) it supersedes was identical green; this finalizes it against the merged mains.

- **2.1.169** (2026-06-10, local run; leaves: tweakcc-fixed@1304bda, lobotomized@411f5e6)
  — gate run with **overrides isolated** (`~/.tweakcc/system-prompts` → empty dir), the
  precedented discipline for a clean patcher-adoption record. The full opus-4-8 override
  run at lobotomized@411f5e6 boot-crashes (`IS_TRUTHY_FN is not defined`) on a
  **pre-existing #26-class** offender: `tool-description-agent-usage-notes.md` (pinned
  `ccVersion: 2.1.160`, untouched by the realign) interpolates
  `IS_TRUTHY_FN(PROCESS_OBJECT.env…)` — both names undeclared in its frontmatter and
  absent from that prompt's 2.1.169 `identifierMap`. Removing that one file → boot READY.
  The record's `advisoryOrphans` (incl. `IS_TRUTHY_FN`, `PROCESS_OBJECT`) corroborate;
  evidence filed on #26. Boot-verify cost: $0.028 (cost ledger sidecar).
