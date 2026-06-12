# Defer-vs-lead improvement backlog — Phase C of the maintenance-machine epic

**Phase C artifact of the maintenance-machine epic (#81), produced for #85.**
Derived from the Phase A index ([`leaf-repos.md`](./leaf-repos.md), anchored at
`tf@1304bda` / `lcc@411f5e6`) and the Phase B synthesis (CONTEXT.md vocabulary +
[ADR 0007](../adr/0007-defer-to-skrabes-canonical-verification-pieces.md)),
plus fresh read-only differential scans run 2026-06-09 (method below). Every
item is tagged **defer** (mirror skrabe's canonical work; never reinvent) or
**lead** (the control plane adds value), with an evidence ref and a
coordination path. Lead items passed the filter encoded in ADR 0007 ("The
coordination filter"): maps onto Four-zeros + `auditMisbinds=0` · not redundant
with a gate he already runs · root-causes rather than snapshots · no personal
infra in anything leaf-facing.

**Live-state anchors (2026-06-09):** both leaves' `origin/main` unchanged from
the index snapshot. skrabe's CC 2.1.170 pair is OPEN and un-drafted:
tf PR #7 (head `e096008`) + lcc PR #6 (head `07e75b9`, adds
`system-prompts-fable-5/`, 419 files).

## Scan method (read-only; reproductions)

Differential scans over the fetched leaf clones (`git show` against
`origin/main` + the PR heads; **no writes to either leaf**), plus a string
probe of the real installed CC 2.1.170 binary:

1. **Duplicate-id scan** — per-version dup-id census across all 201 prompts
   JSONs + PR #7's `prompts-2.1.170.json`.
2. **Presence flip-flop scan** — id present→absent→present over the last 20
   versions.
3. **identifierMap diff** `2.1.169 → 2.1.170` for shared ids.
4. **Cross-leaf pairing check** — every `system-prompts-fable-5/` override in
   lcc PR #6 (frontmatter `variables`, inline-blob surface excluded) vs
   tf PR #7's `prompts-2.1.170.json` identifierMaps.
5. **Per-prompt version-stamp regression scan** (carryover sanity).

### Findings (the reproductions)

- **R1 — chronic exact-duplicate ids.** Three ids appear as *byte-identical
  duplicate pairs* in **every** prompts JSON from 2.1.141 through PR #7's
  2.1.170: `system-prompt-memory-description-of-user-details` (carryover stamp
  2.1.94), `system-prompt-description-part-of-memory-instructions` (2.1.69),
  `system-prompt-claude-in-chrome-browser-automation` (2.1.20). The known
  `system-reminder-cross-session-peer-message-authority-warning` case
  (presence 0→1 at 2.1.167 →1 at 2.1.168 →**4** at 2.1.169) is the same class
  compounded: one live 4-piece 2.1.169 template (3 `…_VAR_N` slots) plus three
  byte-identical stale copies of the superseded 2.1.167 single-piece literal —
  a fuzzy-carryover miss (old literal not matched to the new template shape)
  stacked on the dedup miss. **All four dup groups are carried unchanged into
  the open PR #7 2.1.170 extraction.** No gate of his flags dup ids
  (`tools/` + `skills/showtime/driver.mjs` greps clean).
- **R2 — workflow-script disappearances are real upstream removals, not
  extraction gaps.** Distinctive prose from `workflow-script-bugfix` (2.1.156,
  the last version carrying it) has 0 hits in the real installed 2.1.170
  binary. No action; recorded so nobody re-hunts it.
- **R3 — the open 2.1.170 pair is coherent.** Scan 4: 0 orphan overrides, 0
  variable-vocabulary mismatches between lcc PR #6's fable-5 set and tf PR #7's
  identifierMaps. (Also the prototype run of backlog item L4.)
- **R4 — historical lineage-mix, no current exposure.** Versions
  2.1.147/149/154/157 carry an alternate id vocabulary (upstream-drop lineage:
  `agent-prompt-code-review-part-N…` vs the fork's `skill-code-review-…`) and
  2.1.154 shows version-stamp regressions — pre-own-extraction era
  (`tf@0ea49c2`, index §1.2), none of those versions in the Support matrix.
  No action.
- identifierMap diff 169→170 matches PR #7's stated content (the three named
  partial-map code-review slots; `workflow-script-code-review` slot 0
  `JSON`→`SWEEP_MISS_CATEGORIES` accompanies the upstream content change) —
  no unexplained slot-shifts.

## Ranked backlog

| # | Item | Tag | Axis | Evidence | Coordination path | Tracker |
| - | ---- | --- | ---- | -------- | ----------------- | ------- |
| L1 | Deliver the chronic dup-id differential evidence to skrabe while tf PR #7 is open (3 chronic pairs + the 4× case, all in his 2.1.170 JSON); offer a prepared root-cause draft PR only if he doesn't fold it into his own root-cause pass | **lead** | bug discovery | R1; tf PR #6 review ("fix, not lock in"; index §1.3) | Comment on tf PR #7 (issues disabled on tf); fix itself stays his unless he passes — defer-with-watch | #93 |
| L2 | Pre-stage the CC 2.1.170 Release adoption on the open PR pair (gate run vs tf `pr-7` + fable-5 overrides; Adoption record drafted) so the fork is current the day he merges | **lead** | anticipation | tf#7/lcc#6 OPEN; his test plan = Four-zeros + `auditMisbinds` 0 (index §1.3); R3 | Control-plane only (Support matrix + gate + record — ADR 0007 divergence boundary); #58's 2.1.169 matrix-add sequences first | #94 |
| L3 | Standing cross-leaf pairing-coherence check in the Integration gate: run *his* `auditMisbinds` across {tf ref × lcc override-set} pairings (both mains + open PR pairs), catching the post-merge-regen window | **lead** | cross-leaf invariant | The `e335fb9` carryover lesson (lcc validated vs a pre-regen adopt branch; index §1.3 PR #5); R3 as prototype | Control-plane only; shells to his tool (ADR 0007 §4 — never reimplement slot resolution) | #95 |
| L4 | Make escape-or-not mechanical at authoring time: ask skrabe for per-prompt delimiter context (quote vs backtick) in the extraction output or an `auditMisbinds`-style escape check | **lead** | pipeline hardening | lcc PR #5 escape rejection + `cb08b73` revert (index §2.2/§2.3); rule currently lives only in his head + our memory | Draft + intent-ping PR/comment into tf (his architecture choice: extractor field vs audit extension); publish-hygiene applies | #96 |
| D1 | Showtime pipeline (extract→…→smoke) | defer | — | ADR 0007 §1 | Shell to `skills/showtime/`; `release-adoption` skill keeps only the control-plane envelope | — |
| D2 | Four-zeros verdict sourcing via `driver.mjs` exit codes | defer | — | ADR 0007 §2; #80 shipped | Already wired (`src/driver-verification.ts`) | — |
| D3 | The Four-zeros bar definition | defer | — | ADR 0007 §3 | His SKILL.md §10 is normative; gate adds Boot-verify/Restore drill without redefining | — |
| D4 | Mis-bind detection (slot resolution) | defer | — | ADR 0007 §4 | Only ever invoke `tools/auditMisbinds.mjs`; no parallel harness, no reimplementation | — |
| D5 | Orphan-override / `UNKNOWN_N` reporting | defer | — | `driver.mjs report` (index §1.1); #43 reframe | Remaining surviving-placeholder ask routes as an extension request against his driver/audit output | — |
| D6 | The dup-id root-cause **fix** itself | defer-with-watch | bug discovery | He committed to root-causing the flip-flop (tf PR #6 review, index §1.3) | L1 delivers evidence; escalate to a prepared draft PR only if the class survives his next bump | (#93) |
| D7 | `release-adoption` skill edit to shell to Showtime | defer (implementation of ADR 0007 §1) | — | ADR 0007 Consequences | Follow-up in `~/repos/skills`, outside this repo | — |
| D8 | Historical lineage-mix / 2.1.154 stamp regressions | defer (no action) | — | R4 | None — record only; not in the Support matrix | — |

Ranking rationale: L1 is perishable (most useful before tf #7 merges) and is
the proven-template axis the epic names; L2 is the largest standing value
(currency on merge day) and already sequenced behind #58; L3 turns R3's one-off
scan into a standing invariant only the two-leaf view can hold; L4 prevents a
recurrence of a class we already shipped a wrong fix for once.

## Operating doctrine — where the machine defers vs leads

The defer side is settled law: **ADR 0007** records the four canonical-piece
verdicts (Showtime, Driver, Four-zeros bar, auditMisbinds — defer, never
reinvent; re-litigating requires superseding the ADR) and the divergence
boundary. The lead side, from this phase:

- **Lead on evidence, defer on fixes inside his repos.** Differential analysis
  across versions/surfaces/leaves is control-plane-native (it needs the
  two-leaf + 201-version view he doesn't routinely scan). Findings are
  delivered as evidence on his open PRs (tf has issues disabled) with
  reproductions, *not* as unsolicited fix PRs. A prepared draft PR is the
  escalation only when a class he acknowledged survives a further bump
  (defer-with-watch, D6). Coordination rule: comment > draft PR > nothing;
  never "please merge".
- **Lead on the control-plane altitude unconditionally.** Boot-verify, Restore
  drill, Support matrix, Adoption record, cross-leaf pairing, Behavioral A/B —
  no coordination needed beyond not duplicating his gates (ADR 0001/0007);
  cross-leaf checks *invoke* his tools across pairings rather than
  reimplementing them.
- **Lead on anticipation, synchronized to his cadence.** Pre-stage the next CC
  version against his *open* PR pair rather than racing him to extraction;
  the deliverable is being current on his merge day plus independent gate
  evidence he can cite. Coordination rule: read-only against his PR heads;
  any evidence offered onto the PR follows the intent-ping form.
- **Leaf-facing feature asks** (L4 class) are framed onto his architecture
  (extension of his tool/output, not a bespoke parallel), opened draft +
  intent-ping, publish-hygiene-clean, and priced honestly (what recurring cost
  it puts on him).
