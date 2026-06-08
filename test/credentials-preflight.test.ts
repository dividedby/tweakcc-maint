import { describe, it, expect } from 'vitest';
import { detectCredentials, credentialMessage } from '../src/credentials-preflight.js';

const noEnv: NodeJS.ProcessEnv = {};

describe('detectCredentials — credential source for the gate pre-flight', () => {
  it('env OAuth token present → "env"', () => {
    expect(detectCredentials({ CLAUDE_CODE_OAUTH_TOKEN: 'tok' }, () => false)).toBe('env');
  });

  it('env ANTHROPIC_API_KEY present → "env" (probe not consulted)', () => {
    let probed = false;
    const source = detectCredentials({ ANTHROPIC_API_KEY: 'key' }, () => {
      probed = true;
      return false;
    });
    expect(source).toBe('env');
    expect(probed).toBe(false);
  });

  it('no env token but stored OAuth present → "stored"', () => {
    expect(detectCredentials(noEnv, () => true)).toBe('stored');
  });

  it('no env token and no stored OAuth → "unknown" (defer to Boot-verify)', () => {
    expect(detectCredentials(noEnv, () => false)).toBe('unknown');
  });
});

describe('credentialMessage — stderr line for the pre-flight (never blocks the run)', () => {
  it('"env" → no message (the silent happy path)', () => {
    expect(credentialMessage('env')).toBeUndefined();
  });

  it('"stored" → a confident note that Claude Code\'s stored OAuth will be used', () => {
    expect(credentialMessage('stored')).toMatch(/stored OAuth/i);
  });

  it('"unknown" → a warning that Boot-verify is the real signal, not a hard error', () => {
    const msg = credentialMessage('unknown');
    expect(msg).toMatch(/boot-verify/i);
    expect(msg).toMatch(/CLAUDE_CODE_OAUTH_TOKEN/);
  });
});
