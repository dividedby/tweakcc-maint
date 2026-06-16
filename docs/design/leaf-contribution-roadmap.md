# Leaf-contribution roadmap (audit synthesis, 2026-06-16)

Output of a directed `repo-audit` pass. Lens: **what limits this control plane's
ability to prepare verified, accepted PRs into the two skrabe leaves**
(`tweakcc-fixed`, `lobotomized-claude-code`) — not generic repo health.

Status: **draft for review.** Nothing filed yet. On approval the ranked items
below become triaged GitHub issues under epics A–D.

## Strategic frame — stop racing, start proving

Fresh alignment preflight (verified directly against leaf `origin/main`):

| | leaf HEAD | our state |
|---|---|---|
| `tweakcc-fixed` | `5c74a97` — CC **2.1.178** (#14) | matrix seed `['2.1.176']` |
| `lobotomized-claude-code` | `58a0eca` — CC **2.1.178** (#11) | 2.1.177 = draft record, blocked by #302 |

skrabe ships version-adoption faster than we can, solo, and owns the repos. Our
last two pre-merge adoption PRs (`tf#10`, `tf#11`) were **closed because he
shipped those versions himself**. Both leaves are now ~2 versions ahead of our
matrix baseline.

The conclusion is the one CONTEXT/ADR 0007 already encodes: **a faster
version-adoption pipeline is not a meaningful contribution** — it's a race we
lose. Meaningful contribution = the work he does *not* do himself:

1. **Prove-value evidence** — a Behavioral A/B artifact showing a fork override
   measurably changes Claude's behavior vs stock. He has no bench; this is our
   only durable differentiator (and the gate for offering `bench-core` v1.0.0,
   idea-inbox #99).
2. **Durable, version-independent helper units** that clear his review bar — but
   *only* where a genuine gap exists (he already ships `auditMisbinds`, Showtime,
   the Driver; ADR 0007 forbids reinventing those).
3. **Root-caused quirk analyses**, not version snapshots (his stated review bar).

This roadmap therefore weights **prove-value (Epic A)** and **verification
correctness (Epic B)** over throughput. The adoption pipeline matters as a
*verification instrument we can trust*, not as a speed play.

---

## Epic A — Prove-value produces attachable, reproducible evidence

The run path is wired end-to-end (`behavioral-ab-cli.ts:134` → `provisionVariants`
→ real variant runner; #178–#180 closed). Two things stop it from yielding an
artifact we'd attach to a leaf PR.

| id | item | why it blocks contribution | evidence | effort |
|---|---|---|---|---|
| **A1** | Judge panel + correctness judge **degrade-to-partial** instead of throwing when a single backend defers | One persona/model hiccup currently voids an entire run → no reproducible verdict | `real-judge-panel.ts:112`, `real-correctness-judge.ts:50` | M |
| **A2** | **Evidence-rendering CLI** — compose `{adoption-record, ProveValueResult, pristine-provenance}` into a leaf-PR-ready markdown artifact | `renderLeafPrEvidence` is tested but has **no CLI caller**; the artifact a draft PR needs is assembled by hand today | `leaf-pr-evidence.ts:118` (no caller) | M |
| **A3** | `provisionVariants` **preflight/diagnostic** (overrides resolved? patcher reachable? prompt-data-cache matches install?) | Provisioning fails opaquely at runtime; a flaky setup reads as a bad verdict | `provision-variants.ts:177` refuses late, no preflight | S |

**Leaf-bar mapping:** A's output is *the* thing that maps onto skrabe's bar
without redundancy — he runs Four-zeros + `auditMisbinds`, but nothing that
proves behavioral delta. A1 is the precondition for ever generating "deciding
prove-value evidence" (idea-inbox gate 2).

## Epic B — Verification correctness (trust our own gate)

| id | item | why | evidence | effort |
|---|---|---|---|---|
| **B1** | Resolve **#302** — reconcile the two orphan-detection channels (patcher-report vs control-plane producer) at 2.1.177 | The only substantive open issue; it's the correctness blocker on trusting/finalizing our 2.1.177 record. Root-cause the "orphan" definition mismatch (`WORKFLOW_*`, `EMPTY_STRING` seen by patcher, missed by producer) | #302; `orphan-report-producer.ts` | M |
| **B2** | `RealAdoptionEnvironment` must honor `tweakcc-fixed`'s **config-dir resolution** (`TWEAKCC_CONFIG_DIR` → `~/.tweakcc` → `$XDG_CONFIG_HOME/tweakcc` → `~/.claude/tweakcc`) instead of a hardcoded `~/.tweakcc` | When the patcher wrote backups elsewhere, the Restore drill throws a **false missing-backup** before apply | `real-adoption-environment.ts:358` vs leaf `config.ts` | S |
| **B3** | `adoption-history-cli` — serialize the history summary as attachable PR evidence (mirrors `writeback-cli`) | History is aggregated in-memory only; no transport to a PR | `adoption-history.ts` (no CLI) | S |

## Epic C — Test & CI hardening (an adoption can't silently break)

| id | item | why | evidence | effort |
|---|---|---|---|---|
| **C1** | Add `timeout-minutes` to `ci.yml`, `integration-gate.yml`, `fallow-report.yml` | Missing today → a hung test / boot-verify / deadlocked model call orphans the runner | the three workflows | S |
| **C2** | Test the prod network/CLI seams: `real-npm-release-source` (HTTP) + `real-leaf-state-source` (`gh`) | Both silently degrade to `null` on failure; that path is **untested** and gates release-detection + the alignment preflight | `real-npm-release-source.ts:22`, `real-leaf-state-source.ts` | M |
| **C3** | Structural-validation tests for `behavioral-fixtures`, `persona-prompts`, `seeded-rng` determinism | Bench inputs are hardcoded + untested; a typo'd fixture/persona fails silently at run time; RNG must be deterministic for reproducibility | `behavioral-fixtures.ts`, `persona-prompts.ts`, `seeded-rng.ts` | S |

## Epic D — Docs reconciliation (don't undermine the preflight discipline)

| id | item | why | evidence | effort |
|---|---|---|---|---|
| **D1** | Purge stale **closed-issue refs** in code doc-comments | `provision-variants.ts:1` still says `RealVariantRunner` "only stubs today (#178)" — #178 is closed and the producer is implemented; misleads the next reader | `provision-variants.ts:1`; sweep other `#NNN`-as-open refs | S |
| **D2** | Reconcile `real-gate-adopt-path.md` orphan-validation prose with **ADR 0005** (Driver owns orphan authority) | Runbook describes the old hand-rolled flow as primary | `docs/runbooks/real-gate-adopt-path.md` | S |
| **D3** | Classify residual **Piebald/upstream** mentions: keep historical/definitional, fix only where read as *current* practice | Most are durable lineage records (CONTEXT policy section); a few read as live | `docs/records/README.md:59` et al. | S |

---

## Concrete leaf-PR candidates (honest, alignment-gated)

The scope asked for concrete leaf contributions to prepare. The alignment-first
answer:

- **No version-adoption PR is worth preparing now.** He's at 2.1.178 on both
  leaves; a catch-up PR is the race we already lost twice (`tf#10`/`tf#11`).
- **LC1 — prove-value artifact for an existing `opus-4-8` lcc override set**
  (does it measurably change behavior vs stock?). This is the first "deciding
  prove-value evidence" the idea-inbox gate wants, and something he cannot
  generate himself. **Gated on Epic A (A1+A2).** Re-run the preflight at proposal
  time; surface as a draft PR with an intent ping.
- **LC2 — a version-independent helper unit.** Held: his toolkit already covers
  the obvious ones (`auditMisbinds`, Showtime, Driver — ADR 0007). Do **not**
  invent one; only propose if a genuine, uncovered gap surfaces during Epic A/B
  work. Flagged, not committed.

## Deliberately NOT building (ponytail filter)

| dropped | why |
|---|---|
| Auto-open leaf PRs (`issue-publisher` real adapter) | Violates the cockpit rule — *prepare, don't impose*. The draft PR is a deliberate human gate. |
| Retry/backoff on every network call (npm, `gh`, keyring timeout) | YAGNI — add when a real flake bites, not speculatively. |
| Config-file-ify fixtures/personas | They're fine in code; a config layer is unrequested abstraction. |
| Seam-interface contract tests | Redundant — the `real-*` implementations are already tested. |
| `cli.ts` unit test | HITL-only path, exercised in CI; document as a known gap instead. |
| `normZ` rename, fence-regex comment, build-check caching | Cosmetic micro-debt; not worth an issue. |

## Sequenced priority

1. **C1** (timeouts) — trivial safety, do first.
2. **B1** (#302) — the live correctness blocker on our current target.
3. **A1** (judge robustness) — precondition for any complete prove-value run.
4. **B2** (config-dir resolution) — correctness bug in the Restore drill.
5. **A2** (evidence CLI) — turns a verdict into an attachable artifact *(needs A1)*.
6. **C2** (seam tests) — guards release-detection + preflight.
7. **A3**, **B3**, **C3** — hardening + transport.
8. **D1–D3** — docs reconciliation.
9. **LC1** — first prove-value leaf contribution *(needs A1+A2; re-preflight first)*.

## Known unknowns

- Whether #302's root cause is a producer bug, a patcher-report superset, or a
  genuine definitional split — B1 must root-cause before picking a fix.
- Whether any uncovered helper gap (LC2) actually exists — only Epic A/B work
  will reveal it.
- npm-published `tweakcc-fixed` version not re-confirmed locally (sandbox network);
  leaf HEADs are the authoritative signal and were confirmed.
