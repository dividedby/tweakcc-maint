/**
 * RealJudgePanel — the prod adapter behind the {@link JudgePanelPort} seam (ADR 0008;
 * #138). It scores one blind, order-randomized pairing through three persona-varied
 * Claude judge-agents (strict literalist / devil's-advocate / holistic reviewer), each a
 * fresh-context backend built via bench `createModelJudgeBackend`. For every persona it
 * constructs the SAME rubric-anchored grade prompt — persona preamble + the four-axis
 * rubric + the two outputs labelled only by opaque slot A/B (never variant identity) —
 * and a JSON schema asking for a 0–4 score per axis for both slots, then parses the reply
 * into a {@link JudgeScores}. Returns a {@link PanelResult} with graded persona-scores
 * and an omitted list for any persona that did not produce a usable grade.
 *
 * Backend-failure policy (#304, degrade-to-partial): a backend that defers or fails to
 * grade (`graded:false` / `scores:null`) is OMITTED from the result (not laundered into a
 * fabricated zero), and the omission is recorded. The run continues as long as at least
 * {@link PANEL_FLOOR} personas graded. Below the floor the panel throws a clear refusal.
 * The backend factory is injected so the contract is unit-tested with no real model call.
 */

import { createModelJudgeBackend } from '@dividedby/bench-core';
import type { GradeResult, JudgeBackend } from '@dividedby/bench-core';
import { BEHAVIORAL_AXES } from './judge-port.js';
import type { AxisScores, JudgeScores, PresentedOutput } from './judge-port.js';
import { BEHAVIORAL_RUBRIC, RUBRIC_SCORES } from './behavioral-rubric.js';
import { JUDGE_PERSONAS, personaPrompt } from './persona-prompts.js';
import type { JudgePersona, PanelResult } from './judge-panel-port.js';
import type { JudgePanelPort } from './judge-panel-port.js';

/**
 * Minimum number of graded personas required to produce a usable panel result (#304).
 * If fewer than this many personas produce a valid grade, `scorePanel` throws rather than
 * returning a result too thin to be meaningful.
 */
export const PANEL_FLOOR = 2;

/** A schema key for one slot × axis score (e.g. "A_anti-hedging"). */
function scoreKey(slot: 'A' | 'B', axis: string): string {
  return `${slot}_${axis}`;
}

export interface RealJudgePanelOptions {
  /** Builds one persona backend; injected so tests run no real model. */
  makeBackend?: (name: JudgePersona) => JudgeBackend;
}

/** The rubric text shared by every persona prompt — the concrete 0–4 anchors per axis. */
function rubricBlock(): string {
  const lines: string[] = ['SCORING RUBRIC (score each axis 0–4 against these anchors):'];
  for (const axis of BEHAVIORAL_AXES) {
    const c = BEHAVIORAL_RUBRIC[axis];
    lines.push(`\n[${axis}] ${c.description}`);
    for (const s of RUBRIC_SCORES) lines.push(`  ${s} = ${c.anchors[s]}`);
  }
  return lines.join('\n');
}

export class RealJudgePanel implements JudgePanelPort {
  private readonly makeBackend: (name: JudgePersona) => JudgeBackend;

  constructor(opts: RealJudgePanelOptions = {}) {
    this.makeBackend = opts.makeBackend ?? ((name) => createModelJudgeBackend({ name }));
  }

  /** Build the blind grade prompt for one persona (no variant labels — only slots A/B). */
  private buildPrompt(persona: JudgePersona, first: PresentedOutput, second: PresentedOutput): string {
    // Present in slot label order so the prompt reads A then B regardless of call order.
    const slotA = first.position === 'A' ? first : second;
    const slotB = first.position === 'B' ? first : second;
    return [
      personaPrompt(persona),
      '',
      rubricBlock(),
      '',
      'Two anonymous outputs follow, labelled only by slot. Score each slot on every axis.',
      '',
      '--- OUTPUT A ---',
      slotA.output,
      '--- OUTPUT B ---',
      slotB.output,
      '',
      'Return a 0–4 integer for each axis of each slot, keyed "A_<axis>" and "B_<axis>".',
    ].join('\n');
  }

  /** The JSON schema requesting a 0–4 score per axis for both slots. */
  private schema(): object {
    const properties: Record<string, object> = {};
    for (const slot of ['A', 'B'] as const) {
      for (const axis of BEHAVIORAL_AXES) {
        properties[scoreKey(slot, axis)] = { type: 'integer', minimum: 0, maximum: 4 };
      }
    }
    return { type: 'object', properties, required: Object.keys(properties) };
  }

  /**
   * Parse a grade result into JudgeScores, or return null if the backend omitted a grade.
   * ponytail: collapses defer + genuine-error into "omitted"; split later only if hard errors
   * ever need different handling.
   */
  private parse(persona: JudgePersona, fixtureId: string, grade: GradeResult): JudgeScores | null {
    if (!grade.graded || grade.scores === null) {
      return null;
    }
    const read = (slot: 'A' | 'B'): AxisScores => {
      const axes = {} as AxisScores;
      for (const axis of BEHAVIORAL_AXES) {
        const raw = grade.scores![scoreKey(slot, axis)];
        if (typeof raw !== 'number') {
          throw new Error(
            `RealJudgePanel: persona "${persona}" returned no numeric "${scoreKey(slot, axis)}" ` +
              `for fixture "${fixtureId}".`,
          );
        }
        axes[axis] = raw;
      }
      return axes;
    };
    return { A: read('A'), B: read('B') };
  }

  async scorePanel(fixtureId: string, first: PresentedOutput, second: PresentedOutput): Promise<PanelResult> {
    const schema = this.schema();
    const graded: PanelResult['graded'] = [];
    const omitted: PanelResult['omitted'] = [];
    for (const persona of JUDGE_PERSONAS) {
      const backend = this.makeBackend(persona);
      const grade = await backend.grade(this.buildPrompt(persona, first, second), schema);
      const scores = this.parse(persona, fixtureId, grade);
      if (scores === null) {
        omitted.push(persona);
      } else {
        graded.push({ persona, scores });
      }
    }
    if (graded.length < PANEL_FLOOR) {
      throw new Error(
        `RealJudgePanel: only ${graded.length} of ${JUDGE_PERSONAS.length} personas graded ` +
          `fixture "${fixtureId}" — below the floor of ${PANEL_FLOOR}. ` +
          `Omitted: ${omitted.join(', ')}.`,
      );
    }
    return { graded, omitted };
  }
}
