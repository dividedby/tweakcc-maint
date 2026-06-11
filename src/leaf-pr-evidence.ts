/**
 * leaf-pr-evidence — Phase 2 (#215): the standard leaf-PR EVIDENCE BODY. A thin
 * CONVENTION/formatter that composes the three pieces every realign/adoption leaf PR
 * must carry into one markdown body, mapped onto skrabe's bar:
 *  1. the **Adoption record** (CONTEXT.md → "Adoption record") — read for THIS version's
 *     **Four-zeros bar** result + **Restore drill**, rendered as the explicit four zeros
 *     (0 failed patches · 0 missing system prompts · 0 **Orphan variables** · **Boot-verify**;
 *     and, when the **Mis-bind** audit ran, `auditMisbinds=0`);
 *  2. the **prove-value** result (#214) — reusing {@link renderProveValueResult} verbatim, the
 *     fork's value evidence (NOT part of the bar; ADR 0002/0003: a vs-vanilla benchmark, evidence
 *     not a gate);
 *  3. the **pristine** extract provenance (#213/#211) — the `npm pack` source the realign was
 *     diagnosed against, so the reader knows the evidence is not from a patched/applied tree.
 *
 * This lives HERE and produces a body for a PREPARED leaf PR — it is NOT itself a leaf PR and
 * opens nothing (the cockpit rule: prepare, don't impose). PURE — no fs/network seam, mirroring
 * the thin-renderer half of prove-value-result.ts / four-zeros-verdict.ts / adoption-history.ts.
 */

import { renderProveValueResult } from './prove-value-result.js';
import type { ProveValueResult } from './prove-value-result.js';
import type { AdoptionRecord, VersionResult } from './integration-gate.js';
import type { FourZerosResult } from './four-zeros-verdict.js';

/**
 * Where the pristine prompts/strings extract came from — the provenance line the realign was
 * diagnosed against (#211/#213). Always an `npm pack` extract, never a patched/applied tree:
 * the contamination class that closed lcc#9 / tweakcc-fixed#8.
 */
export interface PristineProvenance {
  /** The provenance kind — `npm pack` of the published CC tarball is the only supported one. */
  source: 'npm-pack';
  /** The published tarball the strings file was extracted from (e.g. `claude-code-2.1.172.tgz`). */
  tarball: string;
  /** The tarball's npm integrity hash, when known — pins the exact pristine bytes. */
  integrity?: string;
}

/** The inputs the evidence body composes, all keyed to the same adopted CC version. */
export interface LeafPrEvidenceInput {
  /** The adopted CC version the PR realigns to — the key every half must agree on. */
  ccVersion: string;
  /** The gate's Adoption record; its entry for {@link ccVersion} supplies the Four-zeros half. */
  record: AdoptionRecord;
  /** The #214 prove-value result for this version — the value-evidence half (reused verbatim). */
  proveValue: ProveValueResult;
  /** The pristine extract provenance the realign was diagnosed against. */
  provenance: PristineProvenance;
}

/** The version entry from the record, or a clear error if the evidence is mismatched. */
function versionEntry(record: AdoptionRecord, ccVersion: string): VersionResult {
  const entry = record.versions.find((v) => v.ccVersion === ccVersion);
  if (entry === undefined) {
    throw new Error(
      `Adoption record carries no entry for CC ${ccVersion} — cannot body a leaf PR with mismatched evidence.`,
    );
  }
  return entry;
}

/** One Four-zeros line: a cleared zero reads ✅, a breach lists its findings under ❌. */
function zeroLine(label: string, findings: readonly string[]): string {
  if (findings.length === 0) return `- ✅ 0 ${label}`;
  return `- ❌ ${findings.length} ${label}: ${findings.join(', ')}`;
}

/** Render the Adoption-record half: this version's Four-zeros bar mapped onto the four zeros. */
function renderFourZerosHalf(ccVersion: string, fz: FourZerosResult, date: string): string {
  const auditLine =
    fz.auditMisbindsPassed === undefined
      ? '- — Mis-bind audit: not run (no upstream reference dump; not a hard input)'
      : fz.auditMisbindsPassed
        ? '- ✅ auditMisbinds=0 (Mis-bind audit clean)'
        : `- ❌ auditMisbinds breached: ${fz.misbinds.join('; ')}`;

  const orphanNote =
    fz.orphanSource === 'patcher-report'
      ? 'patcher `--report-orphans` (authoritative; ADR 0005)'
      : 'Boot-verify fallback (patcher report unavailable)';

  return [
    `## Adoption record — CC ${ccVersion}`,
    '',
    `Mapped onto the **Four-zeros bar** (skrabe's merge bar) from the gate's Adoption record, run ${date}. ` +
      `Orphan authority: ${orphanNote}.`,
    '',
    `**Four-zeros: ${fz.pass ? '✅ cleared' : '❌ breached'}**`,
    zeroLine('failed patches', fz.failedPatches),
    zeroLine('missing system prompts', fz.missingSystemPrompts),
    zeroLine('Orphan variables', fz.orphanVariables),
    fz.bootVerifyPassed ? '- ✅ Boot-verify passed' : '- ❌ Boot-verify did not pass',
    auditLine,
  ].join('\n');
}

/** Render the pristine-provenance half — the `npm pack` source the realign was diagnosed against. */
function renderProvenanceHalf(p: PristineProvenance): string {
  const integrity = p.integrity === undefined ? '' : ` (\`${p.integrity}\`)`;
  return [
    '## Pristine extract provenance',
    '',
    `The realign was diagnosed against a **pristine** \`${p.source}\` extract — \`${p.tarball}\`${integrity} ` +
      '— never a patched/applied tree (#211/#213). This is the provenance that makes the anchor ' +
      'diagnosis trustworthy: the contamination class that produced the false 2.1.172 anchor draft ' +
      '(lcc#9 / tweakcc-fixed#8) is excluded by construction.',
  ].join('\n');
}

/**
 * Render the standard leaf-PR evidence body for one prepared realign/adoption PR. PURE — no I/O.
 *
 * Composes, in order: a header stating this is a PREPARED leaf PR (prepare, don't impose); the
 * Adoption-record / Four-zeros half; the prove-value half (reused {@link renderProveValueResult}
 * verbatim); and the pristine-provenance half. Throws when the three halves disagree on the
 * version (mismatched evidence must not silently body a PR).
 */
export function renderLeafPrEvidence(input: LeafPrEvidenceInput): string {
  const { ccVersion, record, proveValue, provenance } = input;
  if (proveValue.ccVersion !== ccVersion) {
    throw new Error(
      `prove-value result is keyed to CC ${proveValue.ccVersion}, not the PR's CC ${ccVersion} — mismatched evidence.`,
    );
  }
  const entry = versionEntry(record, ccVersion);
  if (entry.fourZeros === undefined) {
    throw new Error(
      `Adoption record entry for CC ${ccVersion} has no Four-zeros result (drill bailed before apply) — nothing to body.`,
    );
  }

  const header = [
    `# Realign / adoption evidence — CC ${ccVersion}`,
    '',
    'A **prepared** leaf PR (prepare, don\'t impose — pull it ready when you choose). Below is the ' +
      'standard evidence body: the Adoption record mapped onto the Four-zeros bar, the Behavioral A/B ' +
      'prove-value result (evidence, not part of the bar), and the pristine extract provenance.',
  ].join('\n');

  return [
    header,
    renderFourZerosHalf(ccVersion, entry.fourZeros, record.date),
    renderProveValueResult(proveValue),
    renderProvenanceHalf(provenance),
  ].join('\n\n');
}
