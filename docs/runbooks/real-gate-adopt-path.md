# Runbook — running the real gate (adopt path, #22)

HITL verification of `RealAdoptionEnvironment`'s adopt path (PRD #20 → #22). The unit
tests prove the gate's orchestration; this runbook is the one layer the fakes can't
exercise — a human running the real gate against a real Claude Code install.

> ℹ️ **The Restore drill is real (#23).** The gate confirms a backup before apply, runs a real
> `tweakcc-fixed --restore` after, and verifies clean stock — so each version's flow is
> backup → apply → Four-zeros → restore → verify-clean. If the record reports a failed or
> dirty restore, restore manually (step 4). Ensure a backup exists before running.

## Prerequisites

1. **Leaf clones** (siblings under `~/repos`, or set `TWEAKCC_FIXED_DIR` / `LOBOTOMIZED_DIR`):
   ```bash
   git clone https://github.com/skrabe/tweakcc-fixed ~/repos/tweakcc-fixed
   git clone https://github.com/skrabe/lobotomized-claude-code ~/repos/lobotomized-claude-code
   ```
2. **Build tweakcc-fixed** (it has a build step; the gate runs `dist/index.mjs`):
   ```bash
   cd ~/repos/tweakcc-fixed && pnpm install && pnpm build
   ```
3. **Seed the prompt-data cache** — one `--apply` populates `~/.tweakcc/prompt-data-cache/`
   with `prompts-<version>.json` (the orphan validator's `identifierMap` source; the
   bundled `tweakcc-fixed/data/prompts/` is used first when present):
   ```bash
   node ~/repos/tweakcc-fixed/dist/index.mjs --apply
   ```
4. **A real Claude Code install + a backup** of it.
5. **Credentials in the environment** (read at run time; nothing committed — ADR 0003):
   ```bash
   export CLAUDE_CODE_OAUTH_TOKEN=...     # or ANTHROPIC_API_KEY=...
   ```

## 1. Run the gate on the installed (known-good) version

```bash
cd ~/repos/tweakcc-maint
pnpm tsx src/cli.ts
```

The matrix is **installed-version-only** (#22): `listMatrix()` reads `claude --version`.
Expect a `pass: true` Adoption record on stdout and exit 0. Diagnostics (the matrix, the
safety warning) go to stderr; the JSON record is the only thing on stdout.

## 2. Inspect the record

- `versions[0].fourZeros.pass === true`, with empty `failedPatches` / `missingSystemPrompts`
  / `orphanVariables` and `bootVerifyPassed: true`.
- `versions[0].restoreDrill` is a placeholder this slice — ignore it until #23.

## 3. Break a bump on purpose → expect a real non-zero verdict

The point of the real env: it *discovers* breakage the Fake only *simulates*. Pick one:

- **Failed patch / missing prompt** — perturb a patch anchor or a system-prompt override so
  `--apply` misfires; expect `failedPatches` / `missingSystemPrompts` populated.
- **Orphan variable** — add a bogus `${NOT_A_REAL_VAR}` to an override's `variables:` list;
  expect it in `orphanVariables`.
- **Boot crash** — break a patched template literal; expect `bootVerifyPassed: false`.

Re-run step 1: expect `pass: false` and a non-zero exit, with the record naming the breach.

## 4. Restore manually — only if the record reports a failed/dirty restore

The gate restores automatically (#23). Restore by hand only if `restoreDrill.status` is
`restore-failed` or `dirty-restore`:

```bash
node ~/repos/tweakcc-fixed/dist/index.mjs --restore
```

## Known limitations

- **Clean-stock check is a byte-for-byte sha256** of the installed `claude` file (the launcher
  resolved through symlinks to its real target) against tweakcc-fixed's stock backup under
  `~/.tweakcc`. This replaced the `config.json` `changesApplied` flag, which `--restore` resets
  to clean on every successful exit and so could not distinguish a faithful restore from a dirty
  one (#23 HITL finding). A dirty restore — restore exits 0 but the bytes differ — is now caught
  as `dirty-restore`; a missing/unreadable install or backup also fails closed (not clean).
- **Orphan validator covers the `identifierMap` variable class.** It cross-references each
  override's declared `variables:` against the target version's `prompts-<version>.json`
  `identifierMap` (positional `…_VAR_<n>` names included since #62). It does **not**
  model the fork's other backing classes (e.g. `_FN` functions, `_OBJECT`s), so it can
  over-report those — adjudicate flagged orphans against `tweakcc-fixed`'s own apply output.
  It is advisory only (ADR 0005): `apply` and `boot-verify` are the load-bearing real signals.
- **When skrabe's Driver is present** (`skills/showtime/driver.mjs` in the checkout, since
  #80) the gate sources its apply / orphan / mis-bind signals from `driver.mjs check` +
  `report` + `tools/auditMisbinds.mjs` instead of the hand-rolled parse — see the
  ADR 0005 addendum. Driver-absent checkouts use the flow above unchanged.
