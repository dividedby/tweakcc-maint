# Leaf-repo index — skrabe/tweakcc-fixed + skrabe/lobotomized-claude-code

**Phase A artifact of the maintenance-machine epic (#81), produced for #83.**
A read-only, ref-anchored raw map of both leaf repos × {tree, history, PRs/issues}.
No synthesis or judgment — that is Phase B (#84). Every entry carries a
`repo@sha:path` or PR ref. Stated reasons in the PR axis are skrabe's own words
(recorded fact), not our assessment.

**Snapshot refs (2026-06-09, `origin/main` of each leaf):**
- `tweakcc-fixed@1304bda2272cad8f411865ba7762d0f361004755` (713 commits total)
- `lobotomized-claude-code@411f5e637da1f696bec13d2411e8c7ab3838199c` (12 commits total)

Short SHAs below resolve against these heads. "tf" = tweakcc-fixed (the patcher),
"lcc" = lobotomized-claude-code (the prompt overrides).

---

## 1. skrabe/tweakcc-fixed (the patcher)

### 1.1 Tree (at `tf@1304bda`)

| Path | What it is (factual) |
| ---- | -------------------- |
| `skills/showtime/SKILL.md` | The CC version-bump ("showtime") pipeline run-book — brings the patcher + the overrides repo (lobotomized-claude-code by default) up to a new CC version end-to-end to a green smoke test. Triggers: "showtime", "support CC X.Y.Z", "realign overrides". Added in `c5fabdf`; an earlier private form existed at `9d77ea6` ("Add /showtime skill"). |
| `skills/showtime/REFERENCE.md` | The "why" / bug-class catalog companion to SKILL.md. |
| `skills/showtime/driver.mjs` | The mechanical + verification harness. Subcommands visible in source: `versions`, `extract`, `report`, `check` (`driver.mjs:125-269`). Reads CC binary, `~/.tweakcc`, `data/prompts/` versions. |
| `tools/promptExtractor.js` | The prompt extractor (`NEW_PROMPT_ASSIGNMENTS` lives here — see history axis). |
| `tools/auditMisbinds.mjs` | Per-override slot-resolution validator (the mis-bind audit gate). Added in `4e1b245`; graceful-skip when upstream reference missing in `bd0c6d0`. |
| `tools/versionBumpReport.js` | Version-bump report (workflow added in `efd21b6`). |
| `tools/set_version.py`, `tools/package.json`, `tools/package-lock.json` | Tooling support files. |
| `src/patches/` | 68 files: 52 patch modules + 14 colocated `*.test.ts` + `helpers.ts` + `index.ts`. Prompt-relevant modules: `systemPrompts.ts`, `systemReminders.ts`, `systemReminderOverrides.ts`, `inlineBlobOverrides.ts`. |
| `src/` (top) | Pipeline modules incl. `systemPromptSync.ts`, `systemPromptDownload.ts`, `systemPromptHashIndex.ts`, `systemReminderSync.ts`, `safeRegexMatch.ts`, `installationBackup.ts`, `nativeInstallation*.ts`. |
| `data/prompts/` | 201 `prompts-<ccVersion>.json` files, `2.0.14` → `2.1.169` (latest at this head: `prompts-2.1.169.json`). |
| `CLAUDE.md` / `AGENTS.md` | **Not tracked** at this head. Tracked → untracked (`340a230`) → AGENTS.md re-tracked with the mis-mapped-slot bug class (`f7073fd`) → both gitignored again, "local per-machine; durable record in memory" (`afafd6a`). |
| `scripts/` | **Absent** — removed in `91df974` (see history axis). |
| `.github`, `vitest.config.ts`, `eslint.config.js`, `pnpm-*` | CI/test/lint scaffolding; README is a standalone fork doc since `a4f26b0`. |

### 1.2 History — the decision trail (newest first, all on `tf` main)

**Upstream relationship**
- `7e4a5c2` — stop merging upstream; Piebald diverged at tweakcc v4.0.14 (fetch-only since).
- `a4f26b0` — README rewritten as a standalone fork doc (drops verbatim upstream README).
- `5a2d8fe` — corrects the upstream-divergence rationale ("it was overstated").
- Upstream "Prompts for 2.1.1xx (#7xx)" merges continue to appear through ~`cf9ade4` (2.1.160), then stop; from `0ea49c2` (2.1.161) the prompt JSONs are "our extraction".

**identifierMap convergence onto upstream**
- `4e1b245` — corrects 3 mislabeled identifierMaps + adds the mis-bind audit gate (`tools/auditMisbinds.mjs`).
- `38daf92` — extractor adopts **upstream's identifierMap for shared prompts** (the convergence commit; flipped the control plane's "two lineages" realign premise).
- `322ba20` — test guard: regex capture/read consistency across all patches.
- `bc60baa` — unresolved-placeholder detection via the **identifierMap union** (landed on our PR #4).

**NEW_PROMPT_ASSIGNMENTS / extractor evolution** (commits touching the constant, `git log -S NEW_PROMPT_ASSIGNMENTS`)
- `e17209d` — support CC 2.1.150 + name 7 code-review identifierMap slots.
- `efd21b6` — version-bump report workflow added.
- `57a860a` — extract CC 2.1.156 + "never emit empty identifierMap".
- `d272760` — README target 2.1.168 (touches the assignments file).
- `340a230` / `f7073fd` / `afafd6a` — CLAUDE.md/AGENTS.md tracking changes (assignments referenced in agent docs).
- `c5fabdf` — showtime skill (the assignments are part of the published pipeline).
- Related extractor lineage: `0312454` (unescape pass, fuzzy merge, markdown rule, ~75 include rules), `813d5dc` (raw source bytes for StringLiteral pieces), `cec8d78` (2.1.142, +16 prompts), `c11d471` (names the 11 /code-review skill fragments, 2.1.148), `c4fae01` (names 6 new/restructured 2.1.169 prompts, excludes 2 `@internal` comments).

**Escape / placeholder rules**
- `ca03256` — inline `\${...}` interpolations in pieces treated as wildcards.
- `6ab82fa` — skip auto-creating override files for prompts with empty name or incomplete identifierMap.
- `d8884b7` — skip prompts with unresolved placeholders instead of emitting invalid JS (our PR #4).
- `74a4511` — don't flag backslash-escaped placeholders as unresolved.

**Bug-class fixes (sample of the recurring per-bump adaptation class)**
- `50e1ff0` — croncreate: name all 7 identifierMap slots so the override binds correctly (the partial-map wrong-capture class; control-plane issue #47).
- `10c89f0` — themes: preserve the theme-map assignment prefix (fixes /config crash).
- `856144c` — systemReminders: discover the reminder delta-param instead of hardcoding `H` (linux-arm64).
- `492b88e` — userMessageDisplay enabled on native installs.
- `ce54a81` — survive regex-compile stack overflow on Windows; `af0d897` — normalize CRLF prompt overrides (merged from PR #3).
- `07fcf74` / `79a88aa` / `a0a7f9c` / `8de19b8` / `0841330` — per-version patch-shape adaptations (autoModeClassifierModel, maxEffortDefault, effort-tier maps, sessionMemory/showMoreItems, thinking-reminder no-op).

**The 2.1.16x adoption series**
- `f1748fb` (2.1.159, 362 named) → `68fe8a1` (2.1.160, 370) → `0ea49c2` (2.1.161, 370) → `a72ae48` (2.1.162, 374) → `290b825` (2.1.165, 381) → `cf63177`+`07fcf74` (2.1.167) → `d272760` (2.1.168 README) → 2.1.169 via our PR #5: `c4fae01` + `bc60baa` + `e335fb9` (skrabe regenerated the JSON via the canonical upstream-adoption pipeline on merge) + `7a1dfb1` (user-sent-new-message anchor adapted to the 2.1.169 case shape) + `e3c2f4f` (README → 2.1.169).

**The scripts/ scrub and the private overlay**
- `e249fb1` — adds `scripts/bootstrap-vps.sh` + `sync-skrabe.sh` (multi-box setup).
- `91df974` — removes `scripts/` from the public repo. Commit message states: the scripts referenced personal infra — VPS hostnames, **the private skrabe overlay**, the `~/.tweakcc/config.json` push, fork URLs, the opus-4-8 model set; "the canonical, hardened sync-skrabe.sh now lives in the **private skrabe repo**"; adding a box is now a documented manual recipe.
- `8cbeaf7` — stop tracking `.claude/` ("personal config + skills").

### 1.3 PRs + issues (`gh`, repo `skrabe/tweakcc-fixed` — **issues are disabled** on this repo)

| PR | Author | State | Content + skrabe's stated response |
| -- | ------ | ----- | ---------------------------------- |
| #7 | skrabe | OPEN (2026-06-09) | **Support CC 2.1.170 (Fable 5 release).** `prompts-2.1.170.json` (389 named vs Piebald's 346; corpus structurally identical to 2.1.169; 12 `data-*` docs pick up Fable 5 / Mythos 5); new `autoModeClassifierModel` match method for the 2.1.170 resolver shape (Fable branch falls back to default Opus) + regression test on the real minified fixture; extractor names 3 partial-map code-review slots (`VERIFY_VOTE_DEFINITIONS`, `RECALL_BIASED_RUBRIC`, `SWEEP_MISS_CATEGORIES`) that rendered `${UNKNOWN_N}`. Test plan: lint/test/build, `--apply` on pristine 2.1.170 = clean **Four-zeros bar** + `auditMisbinds` 0, smoke READY. |
| #6 | dividedby | OPEN (un-drafted, merge-wait) | Leaf test broadening. skrabe's review (verbatim trail on the PR): **keep** `systemPromptCustomization.test.ts` (version-independent pipeline-helper units, "exactly the shape I want"); **drop** `promptsGolden.test.ts` + 2.1.169 snapshot — (a) duplicates gates he already runs (showtime no-regression + `auditMisbinds` + capture/read-consistency), (b) pinned snapshot = regen-every-bump friction with a narrow catch-window, (c) it snapshots quirks instead of root-causing them — he wants to fix, not lock in, the 4× duplicate-id / `system-reminder-cross-session-peer-message-authority-warning` 2.1.167↔2.1.169 sync flip-flop the snapshot surfaced. Golden dropped at `e835b4f`. |
| #5 | dividedby | MERGED (`668bd83`) | Adopt CC 2.1.169 (prompt extraction + extractor). On merge skrabe **regenerated the JSON via the canonical pipeline** (`e335fb9`), fixing an `agent-prompt-worker-fork` mis-bind the carryover JSON had. |
| #4 | dividedby | MERGED (`1304bda`) | systemPrompts: skip prompts with unresolved placeholders instead of emitting invalid JS (`d8884b7`), plus the identifierMap-union detector (`bc60baa`). |
| #3 | skrabe | MERGED | Normalize CRLF prompt overrides (`af0d897`). |
| #2 | tenequm | CLOSED | Default `claudemdContextOncePerConversation` OFF. Stated reason: **superseded** by `1459a2c` on main — proper persistence fix (sysRem marker detection + `H.unshift`), so the default-OFF workaround is no longer needed. |
| #1 | tenequm | CLOSED | Skip prompts with empty id when loading replacements. Stated reason: **superseded** by `6f50366` on main — silences the empty-id ENOENT plus three other `--apply` warning-noise classes. |

---

## 2. skrabe/lobotomized-claude-code (the prompt overrides)

### 2.1 Tree (at `lcc@411f5e6`)

| Path | What it is (factual) |
| ---- | -------------------- |
| `CLAUDE.md` | Tracked agent guide. States the repo goal ("remove useless shit and dumb guardrails… clean agentic coding harness", the "~60% leaner per coding turn" bar), the per-claim decision rule (conveyed elsewhere / 4.7 default / unused feature → cut), the three valid outcomes (no override / trimmed / **full-wiped** — empty body with `ccVersion:` frontmatter suppresses the pristine; precedent: all `data-managed-agents-*`), and a mandatory sibling-check protocol. |
| `system-prompts-opus-4-7/` | 377 override files. |
| `system-prompts-opus-4-8/` | 405 override files. |
| `system-reminders/` | 40 override files (e.g. `user-sent-new-message` class, `mcp-*`, `plan-mode-exit`, `compact-file-reference`). |
| `README.md`, `assets/banner.png`, `.gitignore` | `.claude/` gitignored ("local agent session memory, never tracked", `19d8280`). |

Override-surface naming classes inside `system-prompts-opus-4-8/` (filename-prefix counts at this head): 159 `system-prompt-*`/other, 85 `tool-description-*`, 48 `inline-*`, 44 `data-*`, 42 `agent-prompt-*`, 27 `system-reminder-*`. (Per tf's CLAUDE.md lineage, `inline-*` are the inline-blob overrides handled by `tf:src/patches/inlineBlobOverrides.ts`; `system-reminders/` pairs with `tf:src/patches/systemReminderOverrides.ts`.)

### 2.2 History — complete (the repo has 12 commits total)

| SHA | Commit |
| --- | ------ |
| `411f5e6` | overrides: realign opus-4-8 to CC 2.1.169 (head; skrabe's half of the 2.1.169 Release adoption). |
| `593d3cb` | Merge our PR #5. |
| `cb08b73` | drop the 2 opus-4-8 escapes (**quote-context corruption** — the escape-rule reversal; see PR #5 row). |
| `5940fb0` | complete opus-4-7 vocab alignment (memory-synthesis, workflow). |
| `c2e3718` | revert memory-synthesis — `EMPTY_STRING` is the canonical slot (reversal of an earlier realign edit made against pre-regen adopt-branch JSON). |
| `e2bb2d6` | realign 2 orphaned slots + escape 2 latent-crash examples (the escapes later reverted in `cb08b73`). |
| `fa9859c` | own-resource instructions win over caution in browser + action-safety (4.8) — a Lobotomy content decision. |
| `767011b` | refactor: use **upstream's identifier vocabulary** (the lcc-side convergence commit; covered opus-4-8 only — 4-7 lagged until `5940fb0`). |
| `6514464` | refresh variables frontmatter for 3 realigned identifierMaps. |
| `54e0d34` | croncreate: realign override to the corrected 7-slot vocabulary (pairs with `tf@50e1ff0`). |
| `33b748e` | docs: add the mis-bind audit to the override-realignment workflow. |
| `19d8280` | gitignore `.claude/`. |

### 2.3 PRs + issues (`gh`, repo `skrabe/lobotomized-claude-code`)

| Ref | Author | State | Content + skrabe's stated response |
| --- | ------ | ----- | ---------------------------------- |
| PR #6 | skrabe | OPEN (2026-06-09) | **Fable 5 override set for CC 2.1.170** (companion to tf PR #7). |
| PR #5 | dividedby | MERGED (`593d3cb`) | Align opus-4-7 overrides to upstream vocab (CC 2.1.169) + escape literal examples. skrabe merged the vocab alignment but **reverted the 2 escapes** post-merge (`cb08b73`): `data-anthropic-cli` / `skill-cowork-…mcp-discovery` are stored under **quote** (not backtick) delimiters in `cli.js`, so `${VAR}` there is inert literal text and the patcher's backslash-doubling makes escaping corrupt the rendered output — escape-or-not is decided by the quote-vs-backtick delimiter. |
| PR #4 | dividedby | CLOSED | Realign overrides to CC 2.1.168 vocabulary. Stated reason (skrabe, verbatim on the PR): every name in the diff matched **Piebald's** identifierMap, not tf's own; tf's dictionary still used `PROMPT_VAR_0` where upstream renamed to `GLOB_TOOL_NAME`, so 4 of 5 renames would leave slots unresolved → `${…}` spliced into a template literal → the exact ReferenceError (**Orphan variable** class) being prevented. **croncreate was the real catch** — tf's identifierMap named only 3 of 7 slots, `${CANCEL_TIMEFRAME_DAYS}` bound to the wrong capture (resolved to the `IS_MONITOR_TOOL_ENABLED` function), boots clean so it slipped past apply + smoke; he took the fix on his side (`tf@50e1ff0` + `lcc@54e0d34`) crediting the report. |
| issue #3 | prismarine1337 | CLOSED | Windows native CC binary crashes with Bun after applying the overrides. |
| issue #2 | tenequm | CLOSED | Empty security-monitor override files break auto mode. |
| issue #1 | kurushimee | CLOSED | npx points to a different fork. |

---

## 3. Index coverage notes (method facts, not findings)

- Produced read-only: `git fetch` + `git ls-tree`/`git log`/`git show` against each
  leaf's `origin/main`, plus read-only `gh pr/issue list/view`. **No writes to either leaf.**
- Local clone branches (`tf: test/broaden-leaf-coverage`, `lcc: fix/realign-overrides-26`)
  were not used as index sources; everything above is anchored to the fetched
  `origin/main` snapshot refs at the top.
- tf history axis covers the most recent ~80 commits of 713 (the post-divergence,
  decision-bearing span back through the 2.1.14x series) plus targeted `-S`/`--grep`
  sweeps over the full history for `NEW_PROMPT_ASSIGNMENTS`, escape rules, and
  upstream-relationship commits. lcc history is complete (12/12).
- PR/issue axis is complete: tf 7/7 PRs (issues disabled on that repo), lcc 6/6 PRs + 3/3 issues.
