/**
 * AdoptionHistory — aggregate the gate's Adoption records into an auditable adoption
 * history, the control plane's reporting surface (CONTEXT.md → "Adoption record"; the
 * roadmap slice-6 reporting in design doc → Module Map; issue #12).
 *
 * A PURE transform over an input record set: it consumes {@link AdoptionRecord}s exactly
 * as the gate emits them (no new fs/network seam) and produces a stable, machine-readable
 * {@link AdoptionHistory} — per-CC-version pass/fail history over time, the latest matrix
 * outcome, and a Restore-drill track record — plus a human-readable rendering for PR
 * evidence. Mirrors the pure-core + thin-renderer split of four-zeros-verdict.ts and
 * orphan-validator.ts: `summarizeHistory` is the pure core, `renderHistory` the thin
 * presenter; record production stays the gate's job (consumed as-is).
 *
 * The Behavioral A/B field (slice 5 / #11) is intentionally not aggregated — it is absent
 * from the record today and out of scope here.
 */

import { versionPassed } from './integration-gate.js';
import type { AdoptionRecord, RestoreDrillStatus } from './integration-gate.js';

/** A Restore-drill track record: pass/fail tallies plus a per-terminal-status breakdown. */
export interface RestoreDrillTrackRecord {
  /** Total Restore drills counted (one per version-run). */
  total: number;
  /** Drills that passed (backup existed, restore succeeded, install verified clean stock). */
  passed: number;
  /** Drills that did not pass (any of the non-pass terminal statuses). */
  failed: number;
  /** Count per terminal {@link RestoreDrillStatus}; absent statuses are omitted (not zeroed). */
  byStatus: Partial<Record<RestoreDrillStatus, number>>;
}

/** One run's outcome for a single CC version, as it appears on the version's timeline. */
export interface VersionTimelineEntry {
  /** ISO-8601 timestamp of the run this entry came from. */
  date: string;
  /** True iff this version cleared BOTH its Four-zeros bar and its Restore drill in that run. */
  pass: boolean;
  /** The Four-zeros verdict, or undefined when the drill bailed before apply (missing backup). */
  fourZerosPass?: boolean;
  /** The Restore-drill terminal status for that run. */
  restoreStatus: RestoreDrillStatus;
}

/** The cross-run adoption history for one CC version. */
export interface VersionHistory {
  ccVersion: string;
  /** Per-run outcomes for this version, chronologically ascending by date. */
  timeline: VersionTimelineEntry[];
  /** Number of runs this version appeared in. */
  runs: number;
  /** Runs in which this version passed both bars. */
  passes: number;
  /** Runs in which this version did not pass. */
  fails: number;
  /** Whether this version passed in its most recent run — the latest status per matrix version. */
  latestPass: boolean;
  /** This version's Restore-drill track record across all its runs. */
  restoreDrill: RestoreDrillTrackRecord;
}

/** The latest matrix outcome — the run-level pass/date of the most recent Adoption record. */
export interface LatestMatrixOutcome {
  date: string;
  pass: boolean;
}

/**
 * The aggregated adoption history: a stable, machine-readable shape (attachable as PR
 * evidence) capturing per-version cross-run history, the latest matrix outcome, and an
 * overall Restore-drill track record.
 */
export interface AdoptionHistory {
  /** Number of Adoption records (gate runs) aggregated. */
  totalRuns: number;
  /** Per-CC-version histories, sorted by ccVersion for a stable order. */
  versions: VersionHistory[];
  /** The most recent run's matrix outcome, or undefined when there are no records. */
  latest?: LatestMatrixOutcome;
  /** The Restore-drill track record across every version-run. */
  restoreDrill: RestoreDrillTrackRecord;
}

/** Empty track record — the zero value used both for empty input and as a fold seed. */
function emptyTrackRecord(): RestoreDrillTrackRecord {
  return { total: 0, passed: 0, failed: 0, byStatus: {} };
}

/** Fold one Restore-drill outcome into a track record (in place). */
function countDrill(track: RestoreDrillTrackRecord, status: RestoreDrillStatus, pass: boolean): void {
  track.total += 1;
  if (pass) track.passed += 1;
  else track.failed += 1;
  track.byStatus[status] = (track.byStatus[status] ?? 0) + 1;
}

/**
 * Aggregate a collection of Adoption records into an {@link AdoptionHistory}. Pure: the
 * input is never mutated and the output is deterministic for a given record set (versions
 * sorted by ccVersion, each timeline chronologically ascending). Record order is
 * irrelevant — the latest status is decided by date, not by position.
 */
export function summarizeHistory(records: readonly AdoptionRecord[]): AdoptionHistory {
  const byVersion = new Map<string, VersionHistory>();
  const overallDrill = emptyTrackRecord();

  for (const record of records) {
    for (const v of record.versions) {
      let vh = byVersion.get(v.ccVersion);
      if (vh === undefined) {
        vh = {
          ccVersion: v.ccVersion,
          timeline: [],
          runs: 0,
          passes: 0,
          fails: 0,
          latestPass: false,
          restoreDrill: emptyTrackRecord(),
        };
        byVersion.set(v.ccVersion, vh);
      }
      vh.timeline.push({
        date: record.date,
        pass: versionPassed(v),
        fourZerosPass: v.fourZeros?.pass,
        restoreStatus: v.restoreDrill.status,
      });
      countDrill(vh.restoreDrill, v.restoreDrill.status, v.restoreDrill.pass);
      countDrill(overallDrill, v.restoreDrill.status, v.restoreDrill.pass);
    }
  }

  const versions = [...byVersion.values()].sort((a, b) => a.ccVersion.localeCompare(b.ccVersion));
  for (const vh of versions) {
    vh.timeline.sort((a, b) => a.date.localeCompare(b.date));
    vh.runs = vh.timeline.length;
    vh.passes = vh.timeline.filter((t) => t.pass).length;
    vh.fails = vh.runs - vh.passes;
    vh.latestPass = vh.timeline[vh.timeline.length - 1]?.pass ?? false;
  }

  const latestRecord = records.reduce<AdoptionRecord | undefined>(
    (acc, r) => (acc === undefined || r.date.localeCompare(acc.date) > 0 ? r : acc),
    undefined,
  );

  return {
    totalRuns: records.length,
    versions,
    latest: latestRecord === undefined ? undefined : { date: latestRecord.date, pass: latestRecord.pass },
    restoreDrill: overallDrill,
  };
}

// ── thin human-readable renderer (PR-evidence presenter) ──────────────────────────────

function renderTrack(track: RestoreDrillTrackRecord): string {
  const breakdown = Object.entries(track.byStatus)
    .map(([status, n]) => `${status}=${n}`)
    .join(', ');
  return `${track.passed}/${track.total} passed${breakdown === '' ? '' : ` (${breakdown})`}`;
}

/**
 * Render an {@link AdoptionHistory} as a stable human-readable summary for attaching as PR
 * evidence. Thin presenter over the pure aggregate; carries no logic the machine-readable
 * shape does not already encode.
 */
export function renderHistory(history: AdoptionHistory): string {
  if (history.totalRuns === 0) {
    return 'Adoption history: no adoption records.';
  }

  const lines: string[] = [];
  const latest = history.latest!;
  lines.push(
    `Adoption history — ${history.totalRuns} run(s); latest ${latest.date}: ` +
      `${latest.pass ? 'PASS' : 'FAIL'}`,
  );
  lines.push(`Restore drill (overall): ${renderTrack(history.restoreDrill)}`);
  lines.push('Per-version:');
  for (const v of history.versions) {
    lines.push(
      `  ${v.ccVersion}: latest ${v.latestPass ? 'PASS' : 'FAIL'} ` +
        `— ${v.passes}/${v.runs} run(s) passed; ` +
        `restore drill ${renderTrack(v.restoreDrill)}`,
    );
  }
  return lines.join('\n');
}
