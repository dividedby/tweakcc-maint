/**
 * proposal-marker — the PURE read side of the `cc_version` marker the chain
 * workflow (slice 4, #200) greps a labeled proposal body for, to learn which CC
 * version to dispatch the Integration gate against. The write side is
 * `ccVersionMarker` / `formatProposal` (issue-publisher.ts); this parser pulls it
 * back out. No I/O — the chain reads the body via `gh` and hands the text here.
 */

/**
 * Pull the CC version out of a proposal body's `cc_version: <version>` marker
 * (issue-publisher.ts → {@link ccVersionMarker}). Returns the version string, or
 * `undefined` when the body carries no marker or the marker has no version after
 * the prefix — so the chain dispatches nothing rather than against a bad version.
 */
export function parseCcVersionMarker(body: string): string | undefined {
  const m = /^cc_version:\s*(\S+)\s*$/m.exec(body);
  return m?.[1];
}
