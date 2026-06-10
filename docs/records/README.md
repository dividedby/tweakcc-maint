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

- **2.1.170 — DRAFT / PRE-STAGED** (2026-06-10, local run; leaves pinned at the **open
  PR pair**: tweakcc-fixed PR 7 head `e096008`, lobotomized PR 6 head `07e75b9`, via
  detached worktrees) — anticipation pre-stage (#94, backlog L2): green Four-zeros +
  Boot-verify + clean Restore drill, **not** a Support-matrix add. Finalize by re-running
  against the merged leaf mains (the `e335fb9` merge-time-regen lesson) and saving the
  suffix-less record. Overrides isolated (same discipline as 2.1.169; the #26 offender
  would red any full-override run). First run came back red on `driver-check`: the
  driver's backup-vintage guard correctly refused while `native-binary.backup` still held
  2.1.169 bytes against the live 2.1.170 install — the gate's own apply refreshed the
  backup (tweakcc-fixed startupCheck), and the re-run was green. New advisory orphan
  `JSON` vs 2.1.169 is static-scan noise: `${JSON.stringify(…)}` JS template literals in
  `workflow-script-*` / `skill-design-sync-*` overrides (present in both fable-5 and
  opus-4-8 sets) — backtick-delimiter class, relevant to #96. Mis-bind audit: **executed**
  (no longer SKIPPED) against the Piebald upstream dump `prompts-2.1.170.json` (346 prompts)
  present on the box, vs lcc PR 6 head `07e75b9` × tf PR 7 head `e096008` →
  `auditMisbindsPassed: true`, **0** across all three override surfaces (system-prompts-fable-5,
  -opus-4-7, -opus-4-8; fable-5: 89 prompts compared, 277 placeholder→slot comparisons, all
  at upstream slot). Closes the SKIPPED gap from the prior steps-1–2 record (#94/#95).

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
