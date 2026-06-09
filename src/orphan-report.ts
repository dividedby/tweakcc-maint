/**
 * OrphanReport — the consumer-half parser (#31) for the patcher's `--report-orphans`
 * output (ADR 0005). The fork owns the apply-time `${...}` resolution, so its report is
 * the AUTHORITATIVE static orphan signal; the control plane only parses it.
 *
 * Pure over the report's stdout. The contract is `{ version, prompts: { <promptId>:
 * [VAR, ...] } }`: each surviving placeholder, keyed by the prompt it survived in. The
 * parser flattens that to (variable, promptId) findings. It returns `undefined` — NOT an
 * empty list — when the output is absent / not the expected JSON shape, the signal that
 * the leaf does not support the flag so the caller falls back to Boot-verify (#31 AC 4).
 * An empty `[]` means "report supported, zero orphans" and is a distinct, passing state.
 *
 * The real `--report-orphans` shell-out (producer half, #43) is skrabe's; this parser is
 * built against the agreed JSON contract behind a faked seam, ahead of #43 landing.
 */

/** One surviving placeholder from the report: the variable and the prompt it survived in. */
export interface OrphanReportFinding {
  /** The placeholder identifier that survived apply-time resolution. */
  variable: string;
  /** The prompt id (report key) the placeholder survived in. */
  promptId: string;
}

/** The `--report-orphans` JSON contract. */
interface OrphanReport {
  version?: string;
  prompts: Record<string, string[]>;
}

function isReportShape(value: unknown): value is OrphanReport {
  if (typeof value !== 'object' || value === null) return false;
  const prompts = (value as { prompts?: unknown }).prompts;
  if (typeof prompts !== 'object' || prompts === null) return false;
  return Object.values(prompts).every(
    (vars) => Array.isArray(vars) && vars.every((v) => typeof v === 'string'),
  );
}

/**
 * Parse `--report-orphans` stdout into orphan findings. `undefined` raw, non-JSON, or a
 * payload that is not the report shape all yield `undefined` (flag unsupported → caller
 * falls back to Boot-verify). A valid report yields its findings, in prompt-key then
 * array order; a valid empty report yields `[]`.
 */
export function parseOrphanReport(raw: string | undefined): OrphanReportFinding[] | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isReportShape(parsed)) return undefined;

  const findings: OrphanReportFinding[] = [];
  for (const [promptId, vars] of Object.entries(parsed.prompts)) {
    for (const variable of vars) {
      findings.push({ variable, promptId });
    }
  }
  return findings;
}
