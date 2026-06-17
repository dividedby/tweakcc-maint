# Adopt-flow reference

Detailed phases for the **release-adoption** skill under the **verify-and-measure**
framing. The skill overview (`../SKILL.md`) is the entry point; this reference is the
step-by-step desk guide.

## Phase 1 — Preflight alignment check

Run these four reads **in parallel on the lead (or a Bash-capable tier)** — do NOT
delegate to T0 scouts; `gearbox:scout` has no Bash and cannot shell out.

**Read A — latest CC version on npm:**
```bash
# Run from a neutral dir — inside the repo, devEngines pnpm pin causes EBADDEVENGINES.
cd /tmp && npm view @anthropic-ai/claude-code version
```
Capture the version string (e.g. `2.1.179`). This is the candidate.

**Read B — skrabe/tweakcc-fixed leaf state:**
```bash
gh api repos/skrabe/tweakcc-fixed/commits?sha=main&per_page=10 --jq '.[].commit.message'
gh pr list --repo skrabe/tweakcc-fixed --state open --json number,title,headRefOid
gh pr list --repo skrabe/tweakcc-fixed --state closed --limit 10 --json number,title,headRefOid,state
cd /tmp && npm view tweakcc-fixed version
```

**Read C — skrabe/lobotomized-claude-code leaf state:**
```bash
gh api repos/skrabe/lobotomized-claude-code/commits?sha=main&per_page=10 --jq '.[].commit.message'
gh pr list --repo skrabe/lobotomized-claude-code --state open --json number,title,headRefOid
gh pr list --repo skrabe/lobotomized-claude-code --state closed --limit 10 --json number,title,headRefOid,state
```

**Read D — adoption records on disk:**
```bash
ls docs/records/adoption-record-*.json 2>/dev/null
```
For each file found, read `pass` from the JSON. Report which versions have a passing
record (`ourFlowComplete=true`).

Wait for all four reads before proceeding. On surprising or empty results, re-verify
directly — do not accept an npm timeout or gh auth flap at face value.

### Compose the Support-matrix status table

From the reads, compose the version × `skrabeAdopted` × `ourFlowComplete` table per
ADR 0010:

- **`ourFlowComplete`** — derived from Read D: a passing `adoption-record-<version>.json`
  exists.
- **`skrabeAdopted`** — derived from Read B: his published npm version matches the
  candidate, OR a recent commit / open or merged PR on either leaf references the version.
  **Never persist this flag** (ADR 0010 invariant).

Matrix versions to report: the current `SUPPORT_MATRIX_SEED` (in `src/support-matrix.ts`)
plus the candidate from Read A.

Print the table:
```
Support matrix status  (live at <ISO timestamp>)
Version   ourFlowComplete   skrabeAdopted
-------   ---------------   -------------
2.1.179   ✓                 ✓
2.1.180   —                 —
```

### Routing decision

**Clean exit — nothing to do** if any of:
- Read A returned an error or empty version → report "npm unavailable" and stop.
- The candidate is already in the matrix AND `ourFlowComplete=true` → report "already
  handled" and stop.
- The candidate is strictly older than every matrix entry → report "not newer than matrix"
  and stop.

**Otherwise**, the candidate is new and `skrabeAdopted` will always be `true` (he ships
same-day). Enter Phase 2 — Gate.

> **Why Path A no longer exists.** skrabe ships CC versions the same day they land on npm.
> The Full-adoption branch (authoring a "Prompts for \<ver\>" patcher PR) was the right
> path when we could race him — we cannot. Every real run since 2.1.172 has been Path B.
> `/adopt` no longer branches on `skrabeAdopted`; it always goes to verify-and-measure.

---

## Phase 2 — Gate: dispatch and watch

**The gate is our own trust instrument**, not a step that produces a PR or a leaf
contribution. It confirms that his shipped state satisfies our **Four-zeros bar**.

The gate is not a parallel pipeline — it **wraps skrabe's Showtime Driver**
([CONTEXT.md](../../../CONTEXT.md) "Driver"; [ADR 0007](../../../docs/adr/0007-defer-to-skrabes-canonical-verification-pieces.md)).
When his `skills/showtime/driver.mjs` is present in the configured leaf checkout, the
gate sources its apply / orphan / mis-bind signals from `driver check` + `driver report`
and keys on their **exit codes**, never re-parsing his prose (`src/driver-verification.ts`,
#80). Running `node skills/showtime/driver.mjs check` locally is the same **Four-zeros**
trust instrument the gate rides on. We **verify** his shipped state via his canonical
Driver; we never re-run his Showtime version-bump pipeline — those steps are his, run
same-day.

Dispatch the `integration-gate.yml` workflow for `<newVersion>`:

```bash
gh workflow run integration-gate.yml \
  -f cc_version=<newVersion>
```

Poll every 60 seconds until the run completes:

```bash
gh run list --workflow=integration-gate.yml --limit 5 --json databaseId,status,conclusion
gh run view <runId> --json status,conclusion,jobs
```

**On gate failure:** read the failing job's log, diagnose, and report. Path B gate
failures are evidence *for* skrabe — surface the finding in the draft PR intent ping
when relevant, but do NOT attempt to patch his patcher unilaterally.

The gate emits `docs/records/adoption-record-<newVersion>.draft.json` on success —
the `.draft.` suffix marks pre-merge evidence. Do **not** bump `SUPPORT_MATRIX_SEED`
pre-merge (ADR 0010).

Print the gate result:
```
Gate — integration-gate.yml  cc_version=<newVersion>
  Run: <runId>  conclusion=success  ✓
  Four-zeros bar: PASS
    Failed patches: 0
    Missing system prompts: 0
    Orphan variables: 0
    Boot-verify: pass
    auditMisbinds: 0
```

Do not proceed to Phase 3 until the gate is green. A non-zero exit or `pass: false`
is a **blocking failure**.

---

## Phase 3 — Measure: leanness + anti-laziness + non-regression

This is the deciding phase. The gate proves correctness; Phase 3 proves value.

### 3a — Leanness report (primary artifact)

The leanness report is the **primary, objective prove-value artifact**: the
always-on prompt-size delta between stock CC and lobotomized-CC (per-prompt +
per-category token/char reduction across the six lcc categories — harness,
communication, doing-tasks, executing-actions, memory, core tools). ADR 0012 records
that this is objective and deterministic; the Behavioral A/B is the backstop, not
the headline.

Run the leanness CLI (in this repo, `src/leanness-report-cli.ts`):
```bash
pnpm tsx src/leanness-report-cli.ts <newVersion> opus-4-8
```

Print the leanness report summary:
```
Phase 3a — Leanness report
  Always-on prompt-size delta (lcc opus-4-8 vs stock CC <newVersion>):
    overall: <N>%  leaner  (<chars> → <chars>)
  Per-category:
    communication:    <N>%  (<N> chars removed)
    doing-tasks:      <N>%  (<N> chars removed)
    ...
```

If output is surprising or empty, re-verify paths before accepting.

### 3b — Anti-laziness delta (behavioral, secondary)

The anti-laziness behavioral delta surfaces only if a re-run with higher power
is commissioned. The first metered run (2.1.179, n=5) returned `provesValue: false`
with no significant delta on any axis (ADR 0012). It is **recorded but NOT presented**
to skrabe unless a new run overturns it.

If a re-run IS commissioned, use the Behavioral A/B harness with the anti-laziness
**behavior-bait fixtures** (CONTEXT.md → "Behavior-bait fixture"):
```bash
pnpm tsx src/behavioral-ab-cli.ts --fixtures src/fixtures/ --version <newVersion>
```

Anti-laziness result format:
```
Phase 3b — Anti-laziness delta
  Trials: <N>   Pairings: <N>   Cost: $<N>
  provesValue: <true | false>
  Per-axis:
    completes-in-scope:     <lobotomized-wins> / <total>
    no-stub-or-mvp:         <lobotomized-wins> / <total>
    no-deferral:            <lobotomized-wins> / <total>
    no-hedge-on-in-scope:   <lobotomized-wins> / <total>
  Correctness guardrail: <pass | FAIL — <detail>>
```

### 3c — Behavioral A/B non-regression guardrail

Even when the anti-laziness delta is not being presented as evidence, run the
powered Behavioral A/B as a **non-regression check**: confirm the Lobotomy does
not regress behavioral correctness on the new CC version. A failing Correctness
guardrail is a blocking signal for any lcc PR.

```
Phase 3c — Non-regression guardrail
  Correctness guardrail: pass  (no regressions on <newVersion>)
```

A `FAIL` here is a **blocking signal** for the lcc PR step — surface it in the
intent ping as a finding, do not suppress it.

---

## Phase 4 — Prepare surgical draft PRs (gate-first, cockpit-first)

Only after the gate is green and Phase 3 is complete. The cockpit rule applies
throughout: **never author a version-adoption PR**, never a full-set realign.

### tweakcc-fixed contributions

**When** the gate surfaced a correctness failure or a silent-corruption class the gate
can catch but he has no test for:

- A **test** covering that corruption class (the contribution he can merge without
  adoption risk).
- A **surgical correctness fix** for a specific anchor miss or mis-bind the gate
  proved. If authoring a new patch (match-method), see [`references/add-a-patch.md`](add-a-patch.md).

**Never** a "Prompts for \<ver\>" version-adoption PR. **Never** a realign PR.

Branch from `origin/main` on the `dividedby/tweakcc-fixed` fork. Follow his
[`CONTRIBUTING.md`](https://github.com/skrabe/tweakcc-fixed/blob/main/CONTRIBUTING.md):
`feature/` or `fix/` prefix, typed commit message, `pnpm lint` clean before push.

```bash
git checkout -b fix/<short-desc> origin/main
# ... author the targeted change ...
pnpm lint
git add <files>                    # separate add + commit (git-guard)
git commit -m "Fix <short-desc>"
git push origin fix/<short-desc>
gh pr create \
  -R skrabe/tweakcc-fixed \
  --head dividedby:fix/<short-desc> \
  --draft \
  --body-file /tmp/tf-pr-body.md
```

PR body (`/tmp/tf-pr-body.md`, written with the Write tool, never a heredoc) must
include the **intent ping** and the gate record as evidence. Cite gate run ID,
Four-zeros bar result, and the specific finding the fix addresses.

### lcc contributions

**When** Phase 3 produced measurement artifacts OR the gate surfaced a mis-bind /
vocab-drift that warrants a surgical fix:

- A **leanness + non-regression artifact** (the measurement he can't generate):
  compose the leanness report + the Correctness guardrail result into a draft PR
  that substantiates his ~30% claim.
- A **surgical mis-bind / vocab fix** for a specific drift the gate or auditMisbinds
  proved.

**Never** a full-set realign or content curation. **Never** a version-adoption PR.

```bash
git checkout -b fix/<short-desc> origin/main   # in the lcc clone
# ... author the targeted override fix or artifact ...
git add <files>
git commit -m "Fix <short-desc>"
git push origin fix/<short-desc>
gh pr create \
  -R skrabe/lobotomized-claude-code \
  --head dividedby:fix/<short-desc> \
  --draft \
  --body-file /tmp/lcc-pr-body.md
```

lcc PR body must include the intent ping, the gate record (Four-zeros bar), and the
measurement artifact (leanness report summary, Correctness guardrail result).

### Intent ping (required on every PR)

Every leaf PR body must open with:
```markdown
## Intent

<one sentence: what this does and why>.
This is a prepared contribution — not a "please merge" request. Pull it when
it fits your schedule and merge bar.

**Cost to you:** <specific review ask — e.g. "review the test bodies; gate record attached">.
```

skrabe has Issues DISABLED on both leaf repos — draft PRs are the only surface
channel (MEMORY: no-piebald-skrabe-draftpr-only). Never suggest filing an issue.

### Cockpit safety invariants

- Never direct-push to a skrabe leaf — all leaf writes go through fork PRs.
- Draft PRs only, with an intent ping in the body (CLAUDE.md cockpit rule).
- Leaf PR bodies written to `/tmp/` with the Write tool, passed via `--body-file`
  (never heredocs — git-guard hook constraint).
- ADR 0010: `skrabeAdopted` is live-checked at Phase 1, never cached.
- Gate isolation: when lcc overrides are stale and would break the gate, set
  `isolateOverrides: true` on `RealAdoptionEnvironment` (#263) — do NOT do the
  manual symlink dance by hand.
- Both leaf PRs target `main` — cross-fork stacked PRs via `--base <fork-branch>`
  fail; union diff until the parent merges is expected.

---

## Final summary

Print on completion:

```
Verify-and-measure pass complete — <newVersion>
  Gate: PASS  run=<runId>  (adoption record written → ourFlowComplete=true)
  Leanness: <N>% always-on leaner  (primary artifact)
  Anti-laziness delta: <provesValue result or "not re-run">
  Non-regression guardrail: pass
  tweakcc-fixed PR: <PR URL or "none — no gate finding warranted a PR">
  lcc PR: <PR URL or "none — no surgical fix or measurement PR warranted">
```
