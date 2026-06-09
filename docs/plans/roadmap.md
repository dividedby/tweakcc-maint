# tweakcc-maint — Execution Roadmap (source of record)

> **Status:** active · **Owner:** maintainer + agents
>
> The authoritative execution roadmap. Every issue appears in the master
> census below (closed issues are kept as `Done` rows — the census is the full
> record), and this is the single place to go to pick the next thing to
> work on. **This document self-updates:** every PR that opens, advances, or
> closes an issue updates that issue's row in the same branch — a PreToolUse hook
> (`.claude/hooks/roadmap-guard.py`) enforces it. Out-of-band drift (issues
> changed via `gh`/web between sessions) is caught by a SessionStart nudge
> (`.claude/hooks/roadmap-drift-nudge.py`) and repaired with `/doc-regen`.

## How to use this doc (read this as your instructions)

You have been pointed here to work the backlog. This section *is* the prompt —
no other guidance is needed. Follow it top to bottom:

1. **Pick the work.** From the top priority wave, take the earliest row whose
   `Status` is `Next` and whose `Deps` are all satisfied (closed). If the top
   wave has no unblocked `Next`, drop to the next wave. Ties break by row order.
2. **Read the issue in full — body *and* every comment.** Open the linked issue
   (`gh issue view <#> --comments`). The **issue body is authoritative** for
   scope and acceptance criteria; the **comments carry live guidance** —
   unblock notes, routing, and sequencing that `/doc-regen` writes back as the
   roadmap reconciles. Do not act on the body alone; a comment may have changed
   the plan. This census row only *routes and orders* — it never restates scope.
3. **Invoke the routed skill.** Use the skill(s) named in the row's `Skill(s)`
   cell as your method; honor the `Notes` cell for any roadmap-only sequencing.
4. **Update this doc's row in your branch before you commit** (the guard hook
   blocks an issue-referencing commit otherwise): set `Status`, and update
   `Deps` on anything your change unblocks.

## Priority waves
| Wave | Theme | Issues | Gate to enter |
| ---- | ----- | ------ | ------------- |
| **W1** | 2.1.169 adoption + 2.1.168 orphan/boot correctness | #58 #45 #43 #26 | none — active now |
| **W2** | Verdict-signal trust (triage decisions) | #62 | none — triage anytime |
| **—**  | Cross-cutting / later | #11 #8 #51 #52 #53 | n/a |

## Master census (all issues)

### Open
| # | Issue | Wave | Status | Owner | Skill(s) | Deps | Notes |
| - | ----- | ---- | ------ | ----- | -------- | ---- | ----- |
| 58 | Adopt CC 2.1.169 | W1 | Blocked | human | `/release-adoption` | #26 | **Patcher half MERGED** → skrabe/tweakcc-fixed#5 (prompts + extractor). skrabe adopted the extractor as-is; verified independently (same 6 gaps / 2 `@internal` excludes) and on merge **regenerated the JSON via the canonical pipeline** (`e335fb9`, `TWEAKCC_UPSTREAM_JSON` set) — fixing an `agent-prompt-worker-fork` mis-bind (`WORKER_DIRECTIVE`/`ADDITIONAL_CONTEXT` slot-shift from inserted `AGENT_TOOL_NAME`) the carryover JSON had. **Lesson:** our seed-from-prior-JSON (no `TWEAKCC_UPSTREAM_JSON`) yields valid-but-wrong slot binds the union/skip guards miss — validate overrides vs **canonical main** JSON, not the adopt branch. Control-plane carries no parallel JSON, so nothing to regen our side. Lobotomized half still blocked on #26. |
| 45 | Swap tweakcc-fixed#4 detector to the identifierMap-union check | W1 | Blocked | human | `/tdd` | — | agent work **done** (commit `bc60baa` on leaf PR #4); owner now human — remaining is HITL boot-verify vs stock 2.1.168 + skrabe merge (both his), relabeled `ready-for-human`. Not agent-pickable. Re-verified 2026-06-09: `pnpm build` + `pnpm test` green (275 pass), commit on the fork branch, skrabe notified — awaiting his merge |
| 43 | Patcher `--report-orphans` (producer, leaf PR to skrabe) | W1 | Backlog | human | `/release-adoption` | — | skrabe-facing PR + merge timing not ours. On landing, also wire `RealAdoptionEnvironment.adopt` to call the flag and populate `orphanReport` — the consumer is ready (#31), the env just omits the call until the flag exists. **Fresh-eyes 2026-06-09:** confirmed NOT superseded — auditMisbinds checks slot *correctness* (pre-apply) and versionBumpReport scans the JSON for `UNKNOWN_*` (build-time); neither emits the **apply-time surviving-placeholder** set this asks for. Reframe the ask as an **extension of `auditMisbinds` output** (skrabe's architecture; he's already extending that file) rather than a standalone flag, and open it **draft + intent ping** per the leaf-PR coordination rule (it's a feature ask into his patcher, a real imposition) |
| 26 | Leaf finding: lobotomized breaks CC 2.1.168 (evidence) | W1 | Backlog | human | — | — | **Un-parked** — live blocker for #58's lobotomized half. Pre-existing & version-independent: overrides ref slot names absent from the canonical identifierMap → guard-skip (override silently inert) or boot `ReferenceError`. **opus-4-7 vocab alignment shipped** → skrabe/lobotomized-claude-code#5 (4-7 lagged: `767011b` converged only 4-8 onto upstream vocab): memory-synthesis `OPTIONAL_TAIL_NOTE`→`EMPTY_STRING`, enterplanmode →`CONDITIONAL_WHAT_HAPPENS_NOTE_FN()`, workflow 5-slot rename — all 3 confirmed correct by skrabe vs committed `prompts-2.1.169.json`. Validated vs **canonical** tweakcc-fixed `main` JSON (post `e335fb9` regen — NOT the pre-regen adopt branch; that flipped my first memory-synthesis edit, reverted). **2026-06-09 correction:** the 2 opus-4-8 `\${VERSION}`/`\${GITHUB_TOKEN}`/`\${DATADOG_*}` escapes also in PR #5 were **wrong and rejected by skrabe** — `data-anthropic-cli`/`skill-cowork-…mcp-discovery` are stored under quote (not backtick) delimiters in `cli.js`, so `${VAR}` is inert literal text and the patcher's backslash-doubling makes escaping corrupt the rendered output. Escape-or-not is decided by quote-vs-backtick delimiter, not "looks like a doc example." **Remainder open (`ready-for-human`):** croncreate-4-7 (expression-form `${CRON_DURABLE_FLAG?…}`→bundle-owned `CRON_DURABILITY_SECTION`, real restructure) + inline-blob minified ids (`inline-*`, both 4-7/4-8 — need re-extraction). Static pre-check only; HITL boot-verify is authority |
| 62 | Orphan-validator false-clean: `SYNTHETIC_POSITIONAL` hides boot-crashing `_VAR_<n>` | W2 | Backlog | agent | `/tdd` | — | filed from the #58 gate run. Validator excludes `_VAR_<n>` (`orphan-validator.ts:75`) assuming positional binding, but the patcher leaked `${PROMPT_VAR_0}` → boot `ReferenceError`. **Re-triaged 2026-06-09 (fresh-eyes):** the layer contract it was parked on is now settled — `tools/auditMisbinds.mjs` (patcher altitude) owns slot-binding correctness and Boot-verify is the runtime authority (ADR 0005), so the control-plane validator is **advisory-only**. Scope narrows to option-b: make the advisory honest (stop excluding `_VAR_<n>` so the pre-check doesn't read false-clean) with unit tests — explicitly NOT a correctness authority. **Decoupled from #43** (no longer blocked; the patcher-vs-validator ownership is resolved). `ready-for-agent` |
| 11 | Roadmap: behavioral A/B benchmark (stock vs lobotomized) | — | Parked | human | — | — | roadmap item |
| 8 | Roadmap: leaf test broadening (tweakcc-fixed + lobotomized) | — | Blocked | human | `/tdd` | — | **Agent work DONE (2026-06-09)** — gap inventory posted (issue comment, grouped per leaf, ranked); tweakcc-fixed test PR prepared → skrabe/tweakcc-fixed#6 (escape/identifier customization units + pinned 2.1.169 golden digest; +17 tests, full suite + lint green). Lobotomized per-override coverage resolved as **already covered by `tools/auditMisbinds.mjs`** (the slot-binding gate, confirmed by skrabe on lobotomized#5) — no parallel harness in the data-only repo (ADR 0001); the only residual (gate-ify auditMisbinds + a quote-context escape check) is patcher-altitude and skrabe-owned, not a lobotomized PR. Remaining: per the leaf-PR coordination rule, #6 was set to **draft + intent ping** — awaiting skrabe's call on whether he wants the tests and in what shape (he may want the version-pinned golden dropped, keeping only the maintenance-free helper units). Not a plain merge-wait. Relabeled `ready-for-human`, owner→human |
| 51 | Onboard as an apply-agent-research Consumer loop | — | Backlog | mixed | `/apply-agent-research` | — | **`ready-for-agent` (triage 2026-06-09)** — agent vendors the propose-only workflow PR per the onboarding docs (Parameters filled for this repo, cost-ledger line wired); human-only secret/PAT steps (`SKILLS_TRACKER_TOKEN`, cost-ledger PAT, `CLAUDE_CODE_OAUTH_TOKEN`) documented in the brief |
| 52 | Onboard to the architecture-review loop | — | Backlog | mixed | `/improve-codebase-architecture` | — | **`ready-for-agent` (triage 2026-06-09)** — agent vendors the workflow + load-bearing `.github/arch-review-context.md` (skill source is `mattpocock/skills`); human-only step: confirm `CLAUDE_CODE_OAUTH_TOKEN` exists |
| 53 | Onboard to the staleness-review loop | — | Backlog | mixed | `/staleness-audit` | — | **`ready-for-agent` (triage 2026-06-09)** — agent vendors the monthly report-only workflow (grant `WebSearch`+`WebFetch`); human-only step: confirm `CLAUDE_CODE_OAUTH_TOKEN` exists |

### Done (closed — kept as full record, newest first)
| # | Issue | Wave | Status | Owner | Skill(s) | Deps | Notes |
| - | ----- | ---- | ------ | ----- | -------- | ---- | ----- |
| 31 | Gate consumes the patcher orphan report (consumer half) | W1 | Done | agent | `/tdd` | _#43_ | consumer half **shipped**: `orphan-report.ts` pure parser + Four-zeros now treats the patcher report as the authoritative orphan input, static authoring-drift check demoted to advisory (ADR 0005), dedup + source-attribution `patcher-report`/`boot-verify-fallback` (folds #41's residuals), Boot-verify fallback when the flag is unsupported. Real-env `--report-orphans` shell-out wiring deferred to #43 (flag doesn't exist until the producer lands; env omits the call → fallback) |
| 46 | Authoring-drift pre-check validates vs the leaf's OWN identifierMap | W1 | Done | mixed | `/triage` | — | closed as **overtaken** — skrabe solved mis-binds at the patcher altitude (`38daf92` extractor adopts upstream's authoritative identifierMap → mis-bind structurally impossible for shared prompts; `4e1b245` audit gate; `322ba20` capture/read-consistency test), so the wrong-lineage fixture can no longer reproduce and a control-plane pre-check is redundant. The leaf-own-JSON validation rule survives (self-correcting; in CONTEXT notes); Boot-verify stays the Four-zeros authority (ADR 0005) |
| 41 | orphanVariables double-sourced / not trustworthy as authority | W2 | Done | mixed | `/triage` | — | triaged → **closed as superseded-by-#31**: headline double-sourcing premise overtaken (verdict single-sources the static validator, `four-zeros-verdict.ts:55`); two real residuals (static list is a hard input vs ADR 0005's advisory; no dedup + static/runtime `ReferenceError` signature collision) folded into #31's acceptance — same `validator`/`FourZerosVerdict` seam #31 rewires |
| 47 | Partial-identifierMap wrong-capture binding boots clean | W2 | Done | mixed | `/triage` | — | resolved by skrabe at the patcher altitude, verified vs tweakcc-fixed main `322ba20`: croncreate 7-slot fill (`50e1ff0` — `CANCEL_TIMEFRAME_DAYS` now at correct slot) + mis-bind audit gate (`4e1b245`) + extractor adopts upstream's authoritative identifierMap (`38daf92`); override realigned (lobotomized `54e0d34`). Boot-verify remains the Four-zeros authority (ADR 0005) |
| 42 | cli.ts hasCredentials() false-negative on stored OAuth | W1 | Done | agent | `/tdd` | — | stored-OAuth probe seam; warn-and-proceed, Boot-verify is authority — unblocks real local gate runs |
| 30 | Re-scope orphan check to authoring-drift pre-check; defer prompts-source to patcher | — | Done | agent | — | — | foundation refined by #45/#46 |
| 27 | Orphan validator: align identifierMap source with applied overrides | — | Done | agent | — | — | — |
| 23 | RealAdoptionEnvironment Restore drill (HITL) | — | Done | human | — | — | — |
| 22 | RealAdoptionEnvironment adopt path — real --apply / boot-verify (HITL) | — | Done | human | — | — | — |
| 21 | listMatrix() seam — environment supplies the Support matrix | — | Done | agent | — | — | — |
| 20 | PRD: RealAdoptionEnvironment — shell-out adapter behind gate seam (HITL) | — | Done | human | — | — | — |
| 13 | Parse apply/boot/validator output into a Four-zeros verdict | — | Done | agent | — | — | — |
| 12 | Adoption-history reporting over Adoption records | — | Done | agent | — | — | — |
| 10 | GitHub-hosted CI running the gate on the fork PR branch | — | Done | human | — | — | harness guards landed here (ADR 0006) |
| 9 | Rebuild the release-adoption skill (ex-/showtime) | — | Done | agent | — | — | — |
| 7 | TB4: real adoption-environment adapter (HITL) | — | Done | agent | — | — | — |
| 6 | TB5: propose-only release-detector run-book | — | Done | agent | — | — | — |
| 5 | TB3: Restore-drill bracketing the gate | — | Done | agent | — | — | — |
| 4 | TB2: Support-matrix iteration — every version must pass | — | Done | agent | — | — | — |
| 3 | TB1: walking-skeleton integration gate → Four-zeros verdict | — | Done | agent | — | — | — |
| 2 | PRD: release-adoption control plane | — | Done | mixed | — | — | — |

## Legend
- **Status** — `Next` (do now) · `Backlog` (ready, unstarted) · `Blocked`
  (waiting on a dep) · `Parked` (deferred/needs-design/wontfix) · `Tracking`
  (epic/PRD parent) · `Done` (closed).
- **Owner** — `agent` · `human` · `mixed`.
- **Deps** — blocking issues; _italic_ = already closed (satisfied).
- **Notes** — roadmap-only sequencing guidance. Scope/AC live in the issue, not here.

## Self-update protocol
Any PR that opens/advances/closes an issue updates that issue's census row
(minimally `Status`, plus `Deps` on anything it unblocks). Closed → `Status: Done`
(keep the row). Enforced by `roadmap-guard.py`; out-of-band drift repaired by `/doc-regen`.
