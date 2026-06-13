import { describe, it, expect } from 'vitest';
import { isolateOverridesFromEnv } from '../src/isolate-overrides-env.js';

describe('isolateOverridesFromEnv — ISOLATE_OVERRIDES env var → boolean', () => {
  it('"1" → true', () => {
    expect(isolateOverridesFromEnv({ ISOLATE_OVERRIDES: '1' })).toBe(true);
  });

  it('"true" → true', () => {
    expect(isolateOverridesFromEnv({ ISOLATE_OVERRIDES: 'true' })).toBe(true);
  });

  it('"TRUE" → true (case-insensitive)', () => {
    expect(isolateOverridesFromEnv({ ISOLATE_OVERRIDES: 'TRUE' })).toBe(true);
  });

  it('unset (key absent) → false', () => {
    expect(isolateOverridesFromEnv({})).toBe(false);
  });

  it('"" (empty string) → false', () => {
    expect(isolateOverridesFromEnv({ ISOLATE_OVERRIDES: '' })).toBe(false);
  });

  it('"0" → false', () => {
    expect(isolateOverridesFromEnv({ ISOLATE_OVERRIDES: '0' })).toBe(false);
  });

  it('"false" → false', () => {
    expect(isolateOverridesFromEnv({ ISOLATE_OVERRIDES: 'false' })).toBe(false);
  });
});
