import { describe, it, expect } from 'vitest';
import { BEHAVIORAL_RUBRIC, RUBRIC_SCORES, isCompleteRubric } from '../src/behavioral-rubric.js';
import { BEHAVIORAL_AXES } from '../src/judge-port.js';

describe('BehavioralRubric (AC1, AC4)', () => {
  it('defines every axis with a description and all five (0–4) anchors', () => {
    expect(isCompleteRubric(BEHAVIORAL_RUBRIC)).toBe(true);
    for (const axis of BEHAVIORAL_AXES) {
      const criterion = BEHAVIORAL_RUBRIC[axis];
      expect(criterion.description.trim()).not.toBe('');
      for (const score of RUBRIC_SCORES) {
        expect(criterion.anchors[score].trim()).not.toBe('');
      }
    }
  });

  it('is blind — no variant labels leak into any criterion', () => {
    const banned = /\b(stock|lobotomized|lobotomy)\b/i;
    for (const axis of BEHAVIORAL_AXES) {
      const criterion = BEHAVIORAL_RUBRIC[axis];
      expect(criterion.description).not.toMatch(banned);
      for (const score of RUBRIC_SCORES) {
        expect(criterion.anchors[score]).not.toMatch(banned);
      }
    }
  });

  it('isCompleteRubric rejects a rubric missing an anchor', () => {
    const broken = structuredClone(BEHAVIORAL_RUBRIC);
    broken['no-stub-or-mvp'].anchors[2] = '';
    expect(isCompleteRubric(broken)).toBe(false);
  });
});
