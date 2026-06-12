# tweakcc-maint — agent guide

Maintenance **control plane** for the Claude Code fork ecosystem. `README.md` is the
human overview; this file is the agent index. Keep entries earn-the-line.

## Read before proposing
- `CONTEXT.md` — the domain glossary. Use these exact terms; don't coin synonyms for them.
- `docs/adr/0001`–`0003` — load-bearing decisions (verification gate split by altitude ·
  vs-vanilla benchmark measures targeted behavior · gate runs local-first then CI). Check the
  relevant one before changing gate, benchmark, or CI design.
- `docs/adr/0007` — the recorded defer-vs-reinvent verdicts for skrabe's canonical pieces
  (Showtime, the Driver, the Four-zeros bar, `auditMisbinds`). Don't re-litigate them.

## Contributor cockpit, not owner
The leaf repos — `tweakcc-fixed`, `lobotomized-claude-code` — are owned by a *separate*
maintainer (`skrabe`). Never direct-push or assume write access to a leaf: the control plane
**prepares verified PRs**. (Full model: CONTEXT.md → "Control plane".)

Open every leaf PR **as a draft with an intent ping** — say what it does and any
cost it puts on the leaf owner (e.g. a version-pinned snapshot he'd have to
regenerate on each bump) — and let him pull it ready. *Prepare*, don't *impose*:
unsolicited "please merge" PRs into someone else's repo are out of bounds even
when the diff is green. Map the contribution onto his stated bar
(Four-zeros incl. `auditMisbinds=0`) and his review bar — keep
version-independent helper units; reject coverage redundant with a gate he
already runs; root-cause a quirk rather than snapshot it (tweakcc-fixed#6;
ADR 0007) — before proposing.

### Alignment preflight — reconcile against his current state first
We **prove, benchmark, and suggest; we do not race** skrabe on realign speed (he's
faster solo and owns the repos). His leaves move hourly, so before you author OR
propose *any* leaf contribution, reconcile against his **current** state — a stale
premise is how redundant/contaminated drafts get closed (lcc#9, tweakcc-fixed#8):
- leaf `main` HEAD (he often already did the work — his own 2.1.172 realign closed
  ours), open **and** recently-closed PRs, and his review comments (his actual asks);
- his published CLI version — `npm view tweakcc-fixed version` — vs our Support matrix.
A contribution ships only if it's still true against his HEAD **and** still not
something he runs himself. We **consume** his `tweakcc-fixed` npm CLI; we publish no
competing customizer (`tweakcc-maint` is `private`). Our published surface is only
`@dividedby/bench-core`, kept for the prove-value bench.

## Owned sibling: `bench` / `@dividedby/bench-core`
We also **own** `github.com/dividedby/bench` (the `@dividedby/bench-core` public-npm
package; local clone `~/repos/bench`) — it is *dividedby's own* repo, **not** a skrabe
leaf, so the cockpit rule above does **not** apply: normal full write access, branch →
PR → squash-merge (PR-number-in-title), no draft/intent-ping dance. Work it from sessions
**here** rather than spinning up a session in that repo. Its issues live in
`dividedby/bench`; tweakcc-maint depends on it for the Behavioral A/B bench primitives
(`executeRun`, `normalize`/`groupByCell`, cost, the `JudgeBackend` panel backend).

Different stack from this repo: **plain Node ESM `.mjs` + JSDoc types + `node --test`**
(no TypeScript/vitest/tsx). Test: `node --test` from its root. Public surface is
hand-written `core/index.d.ts` + the `core/index.mjs` barrel; `files:["core"]` is the
publish allowlist (no fixtures/results). Bump the dep pin here when it publishes.

## Build / test / run
Stack: **TypeScript + vitest + pnpm + ESM, run via `tsx` (no build step)** — see
`docs/adr/0004`. Design: `docs/design/release-adoption-substrate.md`.

- Install: `pnpm install`
- Test: `pnpm test` (vitest run; `pnpm test:watch` for watch mode)
- Typecheck: `pnpm typecheck` (`tsc --noEmit` — there is no emit/build step)
- Run a source file directly: `pnpm tsx <file.ts>`

No `dist`/bundler: sources run directly via `tsx`, identically locally and in CI.
`pnpm-workspace.yaml` allowlists esbuild's build script (vitest/tsx dependency).

## Harness (project-scope guards)
`.claude/settings.json` wires two PreToolUse Bash hooks that run under unattended
`claude -p` (where the maintainer's global guards are absent) — see `docs/adr/0006`:
- `.claude/hooks/git-guard.py` — blocks destructive git (force-push, `reset --hard`,
  `clean -f`, discard checkout/restore; branch-delete when unattended).
- `.claude/hooks/secret-guard.py` — blocks the `claude -p` license reaching the tree.

Each ships a framework-free self-test — run it directly after editing the guard:
`.claude/hooks/git-guard.test.py` · `.claude/hooks/secret-guard.test.py`.

## CI
`.github/workflows/integration-gate.yml` runs the gate on the fork via
`workflow_dispatch(cc_version)` — that input *is* the Support matrix. See `docs/adr/0006`.

## Agent skills

### Issue tracker

GitHub Issues in `dividedby/tweakcc-maint` (the control plane's own backlog; verified PRs go to the leaf repos). See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the root. See `docs/agents/domain.md`.

### Intake convention

When I say **"file an idea"** or **"file an issue"** (unqualified), append an
**enriched row** to this repo's [**Idea Inbox**](https://github.com/dividedby/tweakcc-maint/issues/99) (label
`idea-inbox`): the raw idea **plus the ambient context/links available right now**
— the source file/issue/PR that prompted it and a sentence of why — as an
unchecked item at the TOP of `## Ideas`. Do not grill or scope it yet; that
happens at drain. The capture and drain protocol lives once in
[`docs/agents/idea-inbox.md`](./docs/agents/idea-inbox.md) (the issue body is
human-facing and carries no operating instructions).

When I say **"file a *tracked* issue"** — or hand you a **plainly-scoped bug** —
skip the Inbox and file a `needs-triage` issue directly via `gh`.
