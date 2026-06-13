# /adopt — Release adoption command

Parent issue: #241 · Design: `docs/design/adopt-command.md` · ADR 0010

Orchestrates a Release adoption (CONTEXT.md → "Release adoption"). Phase 1 of 4:
detect the latest CC version, live-check skrabe's current state, compose the
Support-matrix status table, and decide the path — or clean-exit when nothing
needs doing.

---

## Phase 1 — Preflight alignment check

### Step 0 — Parallel T0 scouts (fire all four in parallel)

Delegate to **four independent T0 scouts** simultaneously:

**Scout A — latest CC version on npm:**
```
npm view @anthropic-ai/claude-code version
```
Capture the version string (e.g. `2.1.177`). This is the candidate.

**Scout B — skrabe/tweakcc-fixed leaf state:**
Read his leaf current state:
- `gh api repos/skrabe/tweakcc-fixed/commits?sha=main&per_page=10` → HEAD sha + recent commit subjects
- `gh pr list --repo skrabe/tweakcc-fixed --state open --json number,title,headRefOid`
- `gh pr list --repo skrabe/tweakcc-fixed --state closed --limit 10 --json number,title,headRefOid,state`
- `npm view tweakcc-fixed version` → his published CLI version

**Scout C — skrabe/lobotomized-claude-code leaf state:**
- `gh api repos/skrabe/lobotomized-claude-code/commits?sha=main&per_page=10` → HEAD sha + recent commit subjects
- `gh pr list --repo skrabe/lobotomized-claude-code --state open --json number,title,headRefOid`
- `gh pr list --repo skrabe/lobotomized-claude-code --state closed --limit 10 --json number,title,headRefOid,state`

**Scout D — adoption records on disk:**
```
ls docs/records/adoption-record-*.json 2>/dev/null
```
For each file found, read `pass` from the JSON. Report which versions have a
passing record.

Wait for all four scouts to return before proceeding.

---

### Step 1 — Compose the Support-matrix status table

From the scout results, compose the version × `skrabeAdopted` × `ourFlowComplete`
table per ADR 0010:

- **`ourFlowComplete`** — derived from Scout D: a passing `adoption-record-<version>.json` exists.
- **`skrabeAdopted`** — derived from Scout B: his published npm version matches,
  OR a recent commit subject / open PR / merged closed PR on either leaf references
  the version. **Never persist this flag** (ADR 0010 invariant).

Matrix versions to report: the current `SUPPORT_MATRIX_SEED` (in `src/support-matrix.ts`)
plus the candidate version from Scout A.

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
- Scout A returned an error or empty version → report "npm unavailable, cannot determine latest" and stop.
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

**Phase 1 is complete.** Phases 2+ (the actual adoption work) land in later slices
(`/adopt` issues #243–#244). Stop here; do not begin Phase 2 work.

---

## Gearbox routing notes

- Phase 1 scouts: T0 (haiku) — pure reads, no design decisions.
- Any task that pushes a fork branch or opens a PR on a skrabe leaf starts at T1
  minimum (see `.claude/routing.md`).
- Phase 2 (Full adoption path) and Phase 3 (Verify-and-improve) are T1/T2 work
  per their complexity — those slices define their own routing.

## Cockpit safety

This command is **read-only** at Phase 1. It never writes to a leaf, opens a PR,
or persists skrabe's adoption state. The only I/O is:
- `npm view` / `gh` reads (all read-only)
- Reading `docs/records/` (read-only)
- Printing the status table and decision to the session

Nothing is committed to disk. ADR 0010: skrabe's state is live-checked, never cached.
