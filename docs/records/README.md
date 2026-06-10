# Adoption records — the on-disk adoption history

One file per green Integration-gate run, saved verbatim as the gate emits it
(`pnpm tsx src/cli.ts` stdout): `adoption-record-<cc-version>.json`. This is the
durable Support-matrix surface (CONTEXT.md → "Adoption record"): a CC version is
*in* the matrix when a green record for it lives here. `src/adoption-history.ts`
(`summarizeHistory`/`renderHistory`) aggregates these records into the auditable
adoption history / PR evidence.

Records are saved as emitted — no extra fields. Run context that the JSON cannot
carry goes in the per-record notes below.

## Run-context notes

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
