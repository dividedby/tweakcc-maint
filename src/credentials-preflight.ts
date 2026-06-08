/**
 * credentials-preflight — decide whether the gate has credentials before it runs (#42).
 *
 * Boot-verify shells out to `claude -p`, which authenticates via Claude Code's own STORED
 * OAuth (keychain on macOS, `~/.claude/.credentials.json` elsewhere) when no env token is
 * present. The old cli pre-flight only checked `CLAUDE_CODE_OAUTH_TOKEN` / `ANTHROPIC_API_KEY`
 * and hard-exited otherwise — a false-negative that blocked real runs on a machine with an
 * authenticated `claude` but no exported token. This module classifies the credential source
 * so cli can message accurately and never hard-exit on the stored-OAuth case; Boot-verify
 * stays the real signal. The probe is a seam so the decision logic is pure and unit-tested.
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { runSync } from './leaf-shell.js';

/** Where the gate's credentials come from. `unknown` = neither confirmed; defer to Boot-verify. */
export type CredentialSource = 'env' | 'stored' | 'unknown';

/**
 * Classify the credential source. An env token wins (fast, free, unambiguous); otherwise the
 * probe decides whether Claude Code has usable stored OAuth. `unknown` means we could not
 * confirm either — not a hard failure, since Boot-verify is the authoritative check.
 */
export function detectCredentials(
  env: NodeJS.ProcessEnv = process.env,
  probeStoredAuth: () => boolean = defaultStoredAuthProbe,
): CredentialSource {
  if (env.CLAUDE_CODE_OAUTH_TOKEN ?? env.ANTHROPIC_API_KEY) return 'env';
  return probeStoredAuth() ? 'stored' : 'unknown';
}

/**
 * The stderr line cli prints for a given source, or `undefined` when there's nothing to say.
 * Crucially none of these block the run: `unknown` is a heads-up, not the old hard `exit(2)`
 * — Boot-verify (`claude -p`) is the authoritative credential check.
 */
export function credentialMessage(source: CredentialSource): string | undefined {
  switch (source) {
    case 'env':
      return undefined;
    case 'stored':
      return 'No credential env vars set — using Claude Code\'s stored OAuth for boot-verify.';
    case 'unknown':
      return (
        'Could not confirm credentials (no CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_API_KEY and no ' +
        'stored OAuth found).\nProceeding anyway — boot-verify (`claude -p`) is the real signal ' +
        'and will fail clearly if `claude` is unauthenticated.'
      );
  }
}

/**
 * Best-effort, no-cost check for Claude Code's stored OAuth: the macOS login keychain entry,
 * else the file-based credential store other platforms use. Existence only — never reads the
 * secret. A false here is "could not confirm", not "definitely no auth".
 */
export function defaultStoredAuthProbe(): boolean {
  if (process.platform === 'darwin') {
    const r = runSync('security', ['find-generic-password', '-s', 'Claude Code-credentials']);
    if (r.status === 0) return true;
  }
  return existsSync(join(homedir(), '.claude', '.credentials.json'));
}
