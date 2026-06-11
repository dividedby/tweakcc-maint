import { describe, it, expect } from 'vitest';
import { RealVariantRunner } from '../src/real-variant-runner.js';
import type { CliInvocation, CliResult } from '@dividedby/bench-core';

/** A canned CLI reply for `claude -p --output-format json`: the text lives in `.result`. */
function cliReply(text: string): CliResult {
  return { status: 0, stdout: JSON.stringify({ type: 'result', is_error: false, result: text }), stderr: '' };
}

function makeRunner(record: CliInvocation[], reply: (inv: CliInvocation) => CliResult): RealVariantRunner {
  return new RealVariantRunner({
    stockCliPath: '/installs/stock/cli.js',
    lobotomizedCliPath: '/installs/lobo/cli.js',
    model: 'opus',
    effort: 'high',
    workDir: () => '/tmp/work',
    runCli: (inv) => {
      record.push(inv);
      return reply(inv);
    },
  });
}

describe('RealVariantRunner', () => {
  it('routes the stock cli.js for the stock arm and maps the reply to VariantOutput', async () => {
    const calls: CliInvocation[] = [];
    const runner = makeRunner(calls, () => cliReply('stock said this'));

    const out = await runner.run('f1', 'the prompt', 'stock');

    expect(out).toEqual({ variant: 'stock', output: 'stock said this' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args).toContain('/installs/stock/cli.js');
    expect(calls[0]!.args).not.toContain('/installs/lobo/cli.js');
    // Same prompt reaches the CLI.
    expect(calls[0]!.args).toContain('the prompt');
  });

  it('routes the lobotomized cli.js for the lobotomized arm', async () => {
    const calls: CliInvocation[] = [];
    const runner = makeRunner(calls, () => cliReply('lobo said that'));

    const out = await runner.run('f1', 'the prompt', 'lobotomized');

    expect(out).toEqual({ variant: 'lobotomized', output: 'lobo said that' });
    expect(calls[0]!.args).toContain('/installs/lobo/cli.js');
    expect(calls[0]!.args).not.toContain('/installs/stock/cli.js');
  });

  it('runs both arms at the same model, effort, and prompt — only cli.js differs', async () => {
    const calls: CliInvocation[] = [];
    const runner = makeRunner(calls, () => cliReply('x'));

    await runner.run('f1', 'identical prompt', 'stock');
    await runner.run('f1', 'identical prompt', 'lobotomized');

    const without = (args: string[]) => args.filter((a) => !a.endsWith('cli.js'));
    expect(without(calls[0]!.args)).toEqual(without(calls[1]!.args));
  });

  it('surfaces a non-zero arm exit — with the child stderr — rather than silently mispairing', async () => {
    // A non-zero exit (a wrong/broken install, a bad flag) must throw, not mispair. The child's
    // captured stderr is included so the real cause is diagnosable (#180), not a generic label.
    const runner = makeRunner([], () => ({ status: 1, stdout: '', stderr: 'SyntaxError: Invalid or unexpected token' }));
    const err = await runner.run('f1', 'p', 'stock').then(
      () => undefined,
      (e: unknown) => e as Error,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toMatch(/exited 1/);
    expect(err!.message).toContain('SyntaxError: Invalid or unexpected token');
  });

  it('surfaces an unparseable CLI reply rather than returning an empty output', async () => {
    const runner = makeRunner([], () => ({ status: 0, stdout: 'not json', stderr: '' }));
    await expect(runner.run('f1', 'p', 'stock')).rejects.toThrow();
  });
});
