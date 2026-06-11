import { describe, it, expect } from 'vitest';
import { makeRunCli, RUN_CLI_MAX_BUFFER } from '../src/run-cli.js';
import type { CliInvocation } from '@dividedby/bench-core';

/** A recorded `spawnSync` call — the wrapper's only side effect, asserted instead of a real subprocess. */
interface SpawnCall {
  command: string;
  args: string[];
  options: { cwd?: string; env?: NodeJS.ProcessEnv; maxBuffer?: number; encoding?: string };
}

function fakeSpawn(record: SpawnCall[], result = { status: 0, stdout: '{}', stderr: '' }) {
  return (command: string, args: string[], options: SpawnCall['options']) => {
    record.push({ command, args, options });
    return result;
  };
}

/** The bench-shaped invocation: RealVariantRunner has already prepended the variant's cli.js. */
function invocation(): CliInvocation {
  return {
    args: ['/installs/stock/cli.js', '-p', 'the prompt', '--model', 'opus', '--effort', 'high', '--output-format', 'json'],
    cwd: '/tmp/work',
  };
}

describe('makeRunCli — prod node-spawn wrapper', () => {
  it('spawns `node <cliPath> -p --output-format json --model <M> --effort <E> …`', () => {
    const calls: SpawnCall[] = [];
    const runCli = makeRunCli({ spawn: fakeSpawn(calls) });

    runCli(invocation());

    expect(calls).toHaveLength(1);
    expect(calls[0]!.command).toBe('node');
    expect(calls[0]!.args).toEqual([
      '/installs/stock/cli.js',
      '-p',
      'the prompt',
      '--model',
      'opus',
      '--effort',
      'high',
      '--output-format',
      'json',
    ]);
    // cwd is the run's workDir, threaded through unchanged.
    expect(calls[0]!.options.cwd).toBe('/tmp/work');
  });

  it('returns the spawn result as a CliResult', () => {
    const runCli = makeRunCli({ spawn: fakeSpawn([], { status: 0, stdout: '{"ok":true}', stderr: '' }) });
    expect(runCli(invocation())).toEqual({ status: 0, stdout: '{"ok":true}', stderr: '' });
  });

  it('sets a large maxBuffer so a multi-line reply is not silently truncated', () => {
    const calls: SpawnCall[] = [];
    const runCli = makeRunCli({ spawn: fakeSpawn(calls) });

    runCli(invocation());

    // Mirrors leaf-shell.ts's 64 MiB capture cap.
    expect(calls[0]!.options.maxBuffer).toBe(RUN_CLI_MAX_BUFFER);
    expect(RUN_CLI_MAX_BUFFER).toBe(64 * 1024 * 1024);
  });

  it('passes credential env vars through explicitly even under a sandboxed HOME (R4)', () => {
    const calls: SpawnCall[] = [];
    const baseEnv: NodeJS.ProcessEnv = {
      ANTHROPIC_API_KEY: 'sk-test',
      CLAUDE_CODE_OAUTH_TOKEN: 'oauth-test',
    };
    const runCli = makeRunCli({
      spawn: fakeSpawn(calls),
      env: baseEnv,
      // A sandboxed HOME would otherwise strip the stored credential the run needs.
      home: '/sandbox/home',
    });

    runCli(invocation());

    const spawnedEnv = calls[0]!.options.env!;
    expect(spawnedEnv.HOME).toBe('/sandbox/home');
    // The credential env stays explicit despite the sandboxed HOME.
    expect(spawnedEnv.ANTHROPIC_API_KEY).toBe('sk-test');
    expect(spawnedEnv.CLAUDE_CODE_OAUTH_TOKEN).toBe('oauth-test');
  });

  it('does not overwrite HOME when none is provided', () => {
    const calls: SpawnCall[] = [];
    const runCli = makeRunCli({ spawn: fakeSpawn(calls), env: { HOME: '/real/home' } });

    runCli(invocation());

    expect(calls[0]!.options.env!.HOME).toBe('/real/home');
  });
});
