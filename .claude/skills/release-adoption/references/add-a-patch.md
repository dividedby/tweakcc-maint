# Add-a-patch sub-flow

Sub-flow of the **patch** step (step 4) of a Release adoption: authoring a *new*
`tweakcc-fixed` code patch (match-method), as opposed to realigning an existing one to a
new CC shape.

> **Prior art:** Piebald's `patch-creation/SKILL.md` (in Piebald's skills repo) is the
> reference for *how to author a single patch* — locating the target, choosing a robust
> match-method, and validating it. Use it as prior art for this sub-flow only; it is not a
> substitute for the Release-adoption skill, which orchestrates the whole sequence. (Cited
> by name as external prior art — confirm the current path in Piebald's repo before relying
> on a hardcoded location.)

## Where this fits

This is leaf authoring work in `tweakcc-fixed`, prepared on a fork branch and landed via a
**verified PR** — the control-plane guardrail still applies (never direct-push a leaf).

## Notes specific to this fork

- **Match-method durability:** a patch's match-method must hold across *every* CC shape
  still in the **Support matrix**, not just the newest. Never delete an old match-method
  while its CC version is still in the matrix.
- **Verification is the gate's job:** a new patch is only "done" once `pnpm tsx src/cli.ts`
  reports a green **Four-zeros bar** (0 failed patches) across the matrix. Do not hand-roll
  apply checks here — that duplicates the Integration gate.
- **Leaf checks first:** add/extend the patch's unit + golden-snapshot coverage in
  `tweakcc-fixed`'s own `pnpm test` (leaf altitude, ADR 0001) before relying on the
  Integration gate.
