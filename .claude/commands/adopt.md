# /adopt — Release adoption command

Parent issue: #241 · Design: `docs/design/adopt-command.md` · ADR 0010

Orchestrates a Release adoption (CONTEXT.md → "Release adoption"). Phase 1 of 4:
detect the latest CC version, live-check skrabe's current state, compose the
Support-matrix status table, and decide the path — or clean-exit when nothing
needs doing.

---

## Phase 1 — Preflight alignment check

### Step 0 — Four parallel reads (run on the lead or a Bash-capable tier)

Run these four reads **on the lead (or a Bash-capable tier) in parallel** — do NOT
delegate to T0 scouts; `gearbox:scout` has no Bash and cannot shell out.

**Read A — latest CC version on npm:**
```bash
# Run from a neutral dir (e.g. /tmp) — inside the repo, `devEngines` pnpm pin
# causes EBADDEVENGINES and the command fails.
cd /tmp && npm view @anthropic-ai/claude-code version
```
Capture the version string (e.g. `2.1.177`). This is the candidate.

**Read B — skrabe/tweakcc-fixed leaf state:**
```bash
gh api repos/skrabe/tweakcc-fixed/commits?sha=main&per_page=10 --jq '.[].commit.message' 
gh pr list --repo skrabe/tweakcc-fixed --state open --json number,title,headRefOid
gh pr list --repo skrabe/tweakcc-fixed --state closed --limit 10 --json number,title,headRefOid,state
cd /tmp && npm view tweakcc-fixed version   # also run from /tmp for the same reason
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
For each file found, read `pass` from the JSON. Report which versions have a
passing record.

Wait for all four reads to complete before proceeding.

**On surprising or empty results:** do not accept them at face value — re-verify
directly. An npm timeout, a gh auth flap, or an empty record list each has a
distinct failure mode; confirm the cause before proceeding.

---

### Step 1 — Compose the Support-matrix status table

From the Phase 1 reads, compose the version × `skrabeAdopted` × `ourFlowComplete`
table per ADR 0010:

- **`ourFlowComplete`** — derived from Read D: a passing `adoption-record-<version>.json` exists.
- **`skrabeAdopted`** — derived from Read B: his published npm version matches,
  OR a recent commit subject / open PR / merged closed PR on either leaf references
  the version. **Never persist this flag** (ADR 0010 invariant).

Matrix versions to report: the current `SUPPORT_MATRIX_SEED` (in `src/support-matrix.ts`)
plus the candidate version from Read A.

Print the table:

```
Support matrix status  (live at <ISO timestamp>)
Version   ourFlowComplete   skrabeAdopted
-------   ---------------   -------------
2.1.176   ✓                 ?
2.1.177   —                 ?
```

---

### Step 2 — Decide the path

**Clean exit — nothing to do** if any of:
- Read A returned an error or empty version → report "npm unavailable, cannot determine latest" and stop.
- The candidate version is already in the matrix AND `ourFlowComplete=true` for it → report "already handled" and stop.
- The candidate version is strictly older than every matrix entry → report "not newer than matrix" and stop.

**Otherwise**, the candidate is new. Determine the path from `skrabeAdopted`:

| Condition | Path |
|-----------|------|
| `skrabeAdopted=false` for the candidate | **Full adoption** (Path A) — he has not shipped it; we author the patcher PR |
| `skrabeAdopted=true` for the candidate | **Verify-and-improve pass** (Path B) — he has shipped it; we prove and add lobotomy overrides only |

Print the decision:

```
Candidate: 2.1.177
Path: Full adoption  (skrabe has not shipped 2.1.177)
```
or
```
Candidate: 2.1.177
Path: Verify-and-improve pass  (skrabe has already shipped 2.1.177)
```

**Phase 1 is complete for the Verify-and-improve pass (Path B).** Proceed to the
section below that matches the chosen path.

---

## Verify-and-improve path (Path B) — prove + gap-diff + conditional lcc PR

Only enter this section when Phase 1 concluded:
```
Path: Verify-and-improve pass  (skrabe has already shipped <version>)
```

The cockpit rule forbids racing him on the patcher bump: **this path opens NO
`tweakcc-fixed` adoption PR in any case.** Do not open one. The patcher bump is
his; Path B proves his state and adds only the Lobotomy overrides he lacks.

The candidate version from Phase 1 is `<newVersion>`.

---

### Path B — Step 1: Pull skrabe's recent leaf commits for the version

Confirm his adoption evidence at HEAD using the data already gathered in Phase 1 —
re-use the same data; do not re-fetch:

- The specific commit subject(s) that reference `<newVersion>` on
  `skrabe/tweakcc-fixed` and `skrabe/lobotomized-claude-code` (from Read B/C).
- His published `tweakcc-fixed` npm version (from Read B).

Print a brief confirmation:

```
Path B — skrabe's adoption evidence for <newVersion>
  tweakcc-fixed:  <matching commit subject or "npm version match">  (HEAD: <sha>)
  lcc:            <matching commit subject if any, else "—">         (HEAD: <sha>)
```

---

### Path B — Gate: dispatch and watch (same mechanics as Path A)

**Gate ALWAYS runs before any PR is opened, and ALWAYS runs in Path B** — this
is what earns the adoption record and flips `ourFlowComplete` for `<newVersion>`
in the Support-matrix status table. Without it, `ourFlowComplete` stays false
regardless of what skrabe shipped.

Dispatch the `integration-gate.yml` workflow for `<newVersion>`:

```bash
gh workflow run integration-gate.yml \
  -f cc_version=<newVersion>
```

Then watch CI. Poll every 60 seconds until the run completes:

```bash
gh run list --workflow=integration-gate.yml --limit 5 --json databaseId,status,conclusion
gh run view <runId> --json status,conclusion,jobs
```

**On gate failure:** read the failing job's log, diagnose, and report — do NOT
attempt to patch skrabe's patcher. Path B failures are evidence for him (surface
in the lcc PR intent ping if relevant), not things we fix unilaterally.

The gate emits `docs/records/adoption-record-<newVersion>.draft.json` on success —
the `.draft.` suffix marks pre-merge evidence. The record is promoted to the
suffix-less `adoption-record-<newVersion>.json` on merge day; that is what
`supportMatrixStatus()` reads to set `ourFlowComplete=true`. Do **not** bump
`SUPPORT_MATRIX_SEED` pre-merge (ADR 0010).

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

Do not open any PR until the gate is green.

---

### Path B — Phase 4: Gap-diff (rank + subtract his live lcc set)

**Goal:** find prompt ids that both (a) clear the Lobotomy bar and (b) are NOT
actively overridden by skrabe in `lobotomized-claude-code`. Only these are
genuine gaps worth surfacing.

The `lobotomized-claude-code` leaf clone is at `~/repos/lobotomized-claude-code`
(the tracked clone — MEMORY: runtime-vs-tracked-override-dirs).

1. **Identify candidate prompt ids.** Use the diff between `<newVersion>` and the
   previous matrix version from Read D (or Phase 2 if it ran — the changed + new
   ids). If a version-bump diff is unavailable, use ALL prompt ids in
   `data/prompts/prompts-<newVersion>.json` as candidates.

2. **Rank by Lobotomy potential** using `src/lobotomy-ranker-cli.ts` (landed in #265):
   ```bash
   pnpm tsx src/lobotomy-ranker-cli.ts ~/repos/tweakcc-fixed/data/prompts/prompts-<newVersion>.json
   ```
   The CLI emits one `{ promptId, totalScore, clearsBar, inactivePenalty, axes }` line per
   candidate and a `{ anyClears, count }` summary. Re-verify directly on surprising/empty output.

3. **Subtract his live lcc override set** using `src/gap-subtraction.ts`
   (`subtractActiveOverrides`): read his current override files from
   `~/repos/lobotomized-claude-code` across all three model-set dirs
   (`system-prompts-fable-5/`, `system-prompts-opus-4-7/`, `system-prompts-opus-4-8/`).
   Pass the ranked list and his override files to `subtractActiveOverrides` — it
   returns only the genuine gaps (bar cleared AND no active override). A prompt
   he already overrides with any non-blank body is covered; remove it. A prompt
   with an absent or empty-stub override is a genuine gap.

Print the Phase 4 report:

```
Path B — Phase 4: Gap-diff  (new/changed prompt ids vs his live lcc set)
  Candidates evaluated: <N>
  Bar threshold: 2 (score ≥ 2 = worth overriding)
  His live lcc overrides subtracted: <M> active overrides found

  Ranked candidates that clear the bar:
  1. <promptId>  score=<N>  clears-bar=true
       completes-in-scope: <score>  — <rationale>
       no-stub-or-mvp: <score>  — <rationale>
       no-deferral: <score>  — <rationale>
       no-hedge-on-in-scope: <score>  — <rationale>
       inactive-penalty: <0 or 2>
       lcc override: <absent / empty-stub>  → genuine gap
  ...

  Genuine gaps (no active lcc override, clears bar): <K>
  Already covered by his active overrides: <J>
```

If `K = 0`, print:

```
  Nothing to add — all high-value prompts already covered by his active lcc
  overrides, or no candidates clear the bar for <newVersion>.
```

"Nothing to add" is a valid, expected output. Do not force overrides.

---

### Path B — PR: conditional lcc-only draft PR

**No `tweakcc-fixed` PR is opened in Path B under any circumstances.**

#### When K = 0 (nothing to add)

```
lcc PR: not needed — no genuine gaps for <newVersion>.
  (Gate proved his state; adoption record written.)
```

Stop here. Print the final adoption summary (below) and exit.

#### When K > 0 (genuine gaps exist)

Open an **lcc-only** draft PR on skrabe's `lobotomized-claude-code` leaf, from
our fork (`dividedby/lobotomized-claude-code`), per the cockpit rule.

For each genuine gap, author a new override file (one per model-set dir that
lacks an active override) with:
- The frontmatter comment (name + ccVersion).
- A body containing the Lobotomy-targeted replacement: strip the sycophantic,
  hedging, and unsolicited-offer language the axis scores identified. Apply the
  "terse and direct" intent (CONTEXT.md → "Lobotomy").

```bash
git checkout -b lcc-adopt/<newVersion>-gaps origin/main  # in the lcc clone
# ... commit the new override files ...
git push origin lcc-adopt/<newVersion>-gaps
gh pr create \
  -R skrabe/lobotomized-claude-code \
  --head dividedby:lcc-adopt/<newVersion>-gaps \
  --draft \
  --title "add Lobotomy overrides for CC <newVersion> gaps" \
  --body-file /tmp/adopt-<newVersion>-lcc-gaps-body.md
```

The lcc PR body (write to `/tmp/adopt-<newVersion>-lcc-gaps-body.md` with the
Write tool, never a heredoc) must include the **intent ping** and the **gate
record as evidence**:

```markdown
## Intent

Path B gap-fill for CC <newVersion>: skrabe has already adopted this version;
these are the prompt ids that clear the Lobotomy bar and have no active override
in the current lcc HEAD.

This is a prepared contribution — not a "please merge" request. Pull it when
it fits your schedule and merge bar.

**Cost to you:** review the new override bodies; the gate record is attached.

**No patcher changes** — Path B opens no tweakcc-fixed PR.

## Gate record

- Gate run: <runId>  conclusion=success
- Four-zeros bar: PASS (0 failed patches · 0 missing prompts · 0 orphans ·
  boot-verify pass · auditMisbinds=0)
- Gate dispatched: <ISO timestamp>

## Genuine gaps addressed

| Prompt id | Score | Top axis signal |
|-----------|-------|-----------------|
| <promptId> | <N> | <top-axis rationale> |
...

## Adoption record

Stored at `docs/records/adoption-record-<newVersion>.json` on the control plane.
```

---

### Path B — Final summary

Print on completion:

```
Verify-and-improve pass complete — <newVersion>
  Gate: PASS  run=<runId>  (adoption record written → ourFlowComplete=true)
  Phase 4 gap-diff: <K> genuine gaps  /  <J> already covered  /  <L> below bar
  tweakcc-fixed PR: none (Path B — cockpit rule forbids racing his patcher bump)
  lcc PR: <PR URL and title>  (draft, intent ping attached)
```

or, when K = 0:

```
Verify-and-improve pass complete — <newVersion>
  Gate: PASS  run=<runId>  (adoption record written → ourFlowComplete=true)
  Phase 4 gap-diff: 0 genuine gaps — nothing to add
  tweakcc-fixed PR: none (Path B)
  lcc PR: none (no genuine gaps)
```

---

## Full adoption path (Path A) — Phases 2–4 + gate + PR

Only enter this section when Phase 1 concluded:
```
Path: Full adoption  (skrabe has not shipped <version>)
```

The candidate version determined in Phase 1 is `<newVersion>`. The previous
matrix version is `<prevVersion>` (the highest already-adopted version).

---

### Phase 2 — Extraction

**Goal:** extract the new CC version's named prompts and assert zero blocking issues.

Shell out to skrabe's Showtime pipeline in the configured `tweakcc-fixed` checkout
(`~/repos/tweakcc-fixed` by default, or the path in the session's adoption environment):

```bash
# 1. Extract cli.js for the new version — writes it to /tmp (only cli.js, not the prompts JSON).
node skills/showtime/driver.mjs extract

# 2. Produce the named prompts JSON via seeded promptExtractor.
#    driver.mjs extract does NOT write prompts-<newVersion>.json; you must seed it:
#    a. Copy the previous version's prompts JSON as the seed file:
cp data/prompts/prompts-<prevVersion>.json data/prompts/prompts-<newVersion>.json
#    b. Run promptExtractor with the fresh cli.js to update the named prompts in place
#       (promptExtractor reads/writes the JSON at the path it resolves for the version).
node promptExtractor.js <newVersion>

# 3. Confirm prompts-<newVersion>.json was written
ls data/prompts/prompts-<newVersion>.json

# 4. Run the version-bump report, pointing it at the fresh pristine cli.js from step 1.
#    Use --cli to pass the freshly extracted cli.js (avoids stale-source drift).
node versionBumpReport.js --cli /tmp/claude-code-<newVersion>.cjs <prevVersion> <newVersion>
```

**Do NOT set `TWEAKCC_UPSTREAM_JSON`** — that variable pointed at the retired Piebald
upstream JSON which no longer exists. Setting it misdirects the extractor. The seeded
extraction above (copy prev → run promptExtractor) is the correct pipeline.

Capture the full output of `versionBumpReport.js`. Assert zero blocking issues:
- `Conflicts detected for 0` (zero orphan overrides)
- No `prompt overrides not in JSON:` line with a non-zero count

If blocking issues exist, **STOP** and report them. Do not proceed to Phase 3 until
the bump report is clean — the Four-zeros bar (CONTEXT.md) requires this.

Print a Phase 2 summary:

```
Phase 2 — Extraction
  data/prompts/prompts-<newVersion>.json: written (seeded from data/prompts/prompts-<prevVersion>.json + promptExtractor)
  Version-bump report: <newVersion> vs <prevVersion>  (--cli /tmp/claude-code-<newVersion>.cjs)
    Changed prompt ids: <N>
    New prompt ids: <N>
    Removed prompt ids: <N>
  Blocking issues: 0  ✓
```

Capture the list of **changed + new prompt ids** from the bump report — these are
the ids that enter Phase 3.

---

### Phase 3 — Named-prompt drift triage

**Goal:** for each changed/new prompt id, classify named-prompt overrides as
empty-stub (skip) or active (check drift), and report counts per surface.

**Surface handling:**
- **named-prompt surface** (`system-prompts-fable-5/`, `system-prompts-opus-4-7/`,
  `system-prompts-opus-4-8/`): identifierMap-checked. This is the only surface
  that gets a drift check.
- **inline-blob surface** (`inline-*/` files): enumerate only — list file count
  and any inline files whose name matches a changed/new prompt id. Do NOT check
  these against the identifierMap.
- **system-reminders surface** (`system-reminders/`): enumerate only — list
  file count. Do NOT check these against the identifierMap.

The `lobotomized-claude-code` leaf clone is at `~/repos/lobotomized-claude-code`
(the tracked clone, not `~/.tweakcc/system-prompts` which may hold runtime-written
extras — MEMORY: runtime-vs-tracked-override-dirs).

**Named-prompt drift check — run the drift-triage CLI:**

Use `src/drift-triage-cli.ts` (the Phase 3 transport, landed in #265):

```bash
# argv[2] = colon-separated override dirs; argv[3] = path to prompts-<newVersion>.json
pnpm tsx src/drift-triage-cli.ts \
  ~/repos/lobotomized-claude-code/system-prompts-fable-5:~/repos/lobotomized-claude-code/system-prompts-opus-4-7:~/repos/lobotomized-claude-code/system-prompts-opus-4-8 \
  ~/repos/tweakcc-fixed/data/prompts/prompts-<newVersion>.json
```

The CLI emits newline-delimited JSON: one `{ promptId, hasActiveDrift, perModelSet }` line
per id, then a `{ summary: { total, activeDrifted, stubOnly } }` line. Classification:
- **empty-stub**: body (non-frontmatter) is blank — skip, no drift to fix.
- **active+drifted**: body is non-blank AND differs from the new pristine text.

On surprising or empty output from the CLI, re-verify directly — do not accept the
result without confirming the override dir paths resolve and the prompts JSON exists.

Print the Phase 3 report:

```
Phase 3 — Named-prompt drift triage
  Changed/new prompt ids evaluated: <N>
  Named-prompt surface:
    Active+drifted overrides: <N>  [these need realignment]
    Empty-stub (skipped): <N>
    No override found: <N>
  Inline-blob surface: <N> files  (not identifierMap-checked — deferred to gate)
  System-reminders surface: <N> files  (not identifierMap-checked — deferred to gate)

  Active+drifted ids:
    <promptId>  [fable-5: drifted, opus-4-7: stub, opus-4-8: drifted]
    ...
```

Save the list of active+drifted prompt ids — this determines whether an lcc PR
is opened in the PR step.

---

### Phase 4 — Lobotomy potential ranking

**Goal:** rank each new prompt id (IDs that exist in `<newVersion>` but NOT in
`<prevVersion>`) by how much it would benefit from a Lobotomy override targeting
the Behavioral axes (CONTEXT.md → "Behavioral axis").

This phase ranks **new** ids only (not changed ones — changed ids already have
overrides evaluated in Phase 3). If there are zero new ids, skip to the gate.

Use `src/lobotomy-ranker-cli.ts` (the Phase 4 transport, landed in #265):

```bash
# argv[2] = path to prompts-<newVersion>.json
pnpm tsx src/lobotomy-ranker-cli.ts ~/repos/tweakcc-fixed/data/prompts/prompts-<newVersion>.json
```

The CLI emits newline-delimited JSON: one `{ promptId, totalScore, clearsBar, inactivePenalty, axes }` line
per candidate (sorted descending by totalScore), then a `{ anyClears, count }` summary line.
The pure core (`rankByLobotomyPotential` in `src/lobotomy-ranker.ts`) scores each prompt against:
- completes-in-scope, no-stub-or-mvp, no-deferral, no-hedge-on-in-scope
- inactive penalty for feature-gated / conditionally triggered slots

On surprising or empty output, re-verify directly — confirm the prompts JSON path
resolves and contains the expected new prompt ids before accepting the result.

Print the Phase 4 report:

```
Phase 4 — Lobotomy potential ranking  (new prompt ids only)
  New prompt ids evaluated: <N>

  Ranked by Lobotomy potential:
  1. <promptId>  score=<N>  clears-bar=true
       completes-in-scope: <score>  — <rationale>
       no-stub-or-mvp: <score>  — <rationale>
       no-deferral: <score>  — <rationale>
       no-hedge-on-in-scope: <score>  — <rationale>
       inactive-penalty: <0 or 2>
  2. ...

  Bar threshold: 2 (score ≥ 2 = worth overriding)
```

If no new prompt id clears the bar (every `clearsBar=false`), print explicitly:

```
  Nothing clears the bar — no new Lobotomy overrides warranted for <newVersion>.
```

"Nothing clears the bar" is a valid, expected output. Do not force overrides.

---

### Gate — dispatch and watch

**Gate ALWAYS runs before any PR is opened.**

Dispatch the `integration-gate.yml` workflow for `<newVersion>`:

```bash
gh workflow run integration-gate.yml \
  -f cc_version=<newVersion>
```

Then watch CI. Poll every 60 seconds until the run completes:

```bash
gh run list --workflow=integration-gate.yml --limit 5 --json databaseId,status,conclusion
gh run view <runId> --json status,conclusion,jobs
```

**On gate failure:** read the failing job's log, diagnose, and fix — then
re-dispatch. Gate failures fall into two classes:
- **Patcher failures** (failed patches, missing system prompts): these are
  skrabe's Showtime pipeline — diagnose from the apply output and surface the
  specific anchor miss in the tweakcc-fixed PR body. Do NOT patch around them.
- **Override failures** (Orphan variables, Boot-verify crash): check whether a
  lobotomized override references a renamed variable (the authoring-drift class).
  If so, note it as a required fix in the lcc PR.

Do not open any PR until the gate is **green** (Four-zeros bar: 0 failed patches,
0 missing system prompts, 0 orphan variables, passing Boot-verify, `auditMisbinds=0`).

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

**Adoption record persistence (ADR 0010):**
The gate emits `docs/records/adoption-record-<newVersion>.draft.json` on success —
the `.draft.` suffix marks pre-merge evidence. On merge day, the record is promoted
to the suffix-less `adoption-record-<newVersion>.json`, which is what
`supportMatrixStatus()` reads to set `ourFlowComplete=true`. Do **not** bump
`SUPPORT_MATRIX_SEED` pre-merge — that constant stays the install-free version list
and is only updated once the merge is complete (ADR 0010).

---

### PR — open draft leaf PRs (gate-first; 0–2 PRs)

Only reached after a green gate. A run opens **0–2 PRs** in this order:

#### PR 1 (always): tweakcc-fixed adoption PR

Open a **draft** PR on skrabe's `tweakcc-fixed` leaf, from our fork
(`dividedby/tweakcc-fixed`), per the cockpit rule (CLAUDE.md / CONTEXT.md →
"Contributor cockpit"). This PR carries code into his leaf, so it follows his
[`CONTRIBUTING.md`](https://github.com/skrabe/tweakcc-fixed/blob/main/CONTRIBUTING.md):
`feature/`-prefixed branch, the `Prompts for <newVersion>` commit type (his
"update for new Claude version"), and `pnpm lint` clean before pushing. Branch
off `origin/main`:

```bash
git checkout -b feature/cc-<newVersion> origin/main
pnpm lint                                   # CONTRIBUTING: clean before PR
git add -A                                  # stage + commit as SEPARATE calls (git-guard)
git commit -m "Prompts for <newVersion>"    # his typed-commit format
git push origin feature/cc-<newVersion>
gh pr create \
  -R skrabe/tweakcc-fixed \
  --head dividedby:feature/cc-<newVersion> \
  --draft \
  --title "adopt CC <newVersion>" \
  --body-file /tmp/adopt-<newVersion>-tf-body.md
```

The PR body (write to `/tmp/adopt-<newVersion>-tf-body.md` with the Write tool)
must include the **intent ping** and the **adoption record as evidence**:

```markdown
## Intent

Adoption of CC <newVersion>: extraction → drift triage → gate.
This is a prepared contribution — not a "please merge" request. Pull it when
it fits your schedule and merge bar.

**Cost to you:** review the patcher changes; the gate record is attached.

## Gate record

- Gate run: <runId>  conclusion=success
- Four-zeros bar: PASS (0 failed patches · 0 missing prompts · 0 orphans ·
  boot-verify pass · auditMisbinds=0)
- Gate dispatched: <ISO timestamp>

## Phase 2 — Extraction

<version-bump report summary>

## Phase 3 — Named-prompt drift triage

<drift triage summary from Phase 3>

## Phase 4 — Lobotomy potential ranking

<ranking summary from Phase 4>

## Adoption record

Stored at `docs/records/adoption-record-<newVersion>.json` on the control plane.
```

#### PR 2 (conditional): lobotomized-claude-code override PR

Open this PR **only** when Phase 3 found **active+drifted** named-prompt overrides.
If Phase 3 found zero active+drifted overrides, print:

```
lcc PR: not needed — no active+drifted named-prompt overrides for <newVersion>.
```

and stop.

When active+drifted overrides exist:

```bash
git checkout -b lcc-adopt/<newVersion> origin/main  # in the lcc clone
# ... commit the realigned override files ...
git push origin lcc-adopt/<newVersion>
gh pr create \
  -R skrabe/lobotomized-claude-code \
  --head dividedby:lcc-adopt/<newVersion> \
  --draft \
  --title "realign overrides to CC <newVersion>" \
  --body-file /tmp/adopt-<newVersion>-lcc-body.md
```

**Stacked PR caveat:** `gh pr create --base <fork-branch>` fails for cross-fork stacked
PRs. Both leaf PRs (tweakcc-fixed and lcc) must target `main`, not each other. When
they are open simultaneously they will each show a union diff until the parent merges;
that is expected, not an error.

The lcc PR body includes the list of active+drifted override files and their
proposed realignments; cite the Four-zeros gate run as evidence.

Print the final adoption summary:

```
Adoption complete — <newVersion>
  Phase 2: extracted, bump report clean
  Phase 3: <N> active+drifted ids  /  <M> stubs skipped
  Phase 4: <P> new ids cleared the bar  (or: nothing cleared the bar)
  Gate: PASS  run=<runId>
  PRs:
    tweakcc-fixed: <PR URL>  (draft, intent ping attached)
    lcc: <PR URL or "not needed">
```

---

## Gearbox routing notes

- Phase 1 reads: run on the lead or a Bash-capable tier (T1+). T0 scouts have no
  Bash and cannot run `npm view` or `gh` shell-outs.
- Any task that pushes a fork branch or opens a PR on a skrabe leaf starts at T1
  minimum (see `.claude/routing.md`).
- Phase 2 extraction + Phase 3 drift triage: T1 — shell-outs + file reads, no
  design decisions; delegate as a single bounded task. When delegating, re-verify
  surprising or empty subagent results directly at the orchestrator level before
  proceeding.
- Phase 4 Lobotomy ranking: T1 — invoke `src/lobotomy-ranker-cli.ts` (the
  deterministic CLI; no need to import the core by hand).
- Gate dispatch + PR authoring: T2 minimum — involves CI watch loop and leaf PR
  authoring with an intent ping; do not delegate below T2.

## Cockpit safety

Phase 1 is read-only. Phases 2–4 are read-only against the leaves.

The first write in a Full adoption run is the gate dispatch (`gh workflow run`),
followed by the PR opens — both only after Phase 1 confirms Path A and Phases 2–4
complete cleanly.

Cockpit invariants apply throughout:
- Never direct-push to a skrabe leaf — all leaf writes go through fork PRs.
- Draft PRs only, with an intent ping in the body (CLAUDE.md cockpit rule).
- skrabe has Issues DISABLED — draft PRs are the only surface channel (MEMORY:
  no-piebald-skrabe-draftpr-only).
- Leaf PR bodies are written to `/tmp/` files with the Write tool and passed via
  `--body-file` (never heredocs — git-guard hook constraint).
- ADR 0010: skrabe's state is live-checked, never cached. `skrabeAdopted` is
  derived at Phase 1 from the live snapshot and never persisted.
- **Gate isolation:** when lobotomized-claude-code overrides are stale and would
  break the gate, set `isolateOverrides: true` on `RealAdoptionEnvironment` (#263).
  This repoints `~/.tweakcc/system-prompts` at a throwaway empty dir for the
  duration of the run and restores it on both success and error — producing a clean
  patcher+prompts Four-zeros record isolated from broken overrides. Do NOT do the
  manual symlink dance by hand; the `isolateOverrides` capability handles it safely.
- Both leaf PRs target `main` — `gh pr create --base <fork-branch>` fails for
  cross-fork stacked PRs (stacked PRs show a union diff until the parent merges;
  that is expected).
