import { describe, it, expect } from 'vitest';
import {
  parseAllowedVariables,
  promptIdOf,
  buildLegalMap,
  findOrphans,
  formatValidatorOutput,
  type OverrideFile,
} from '../src/orphan-validator.js';

// A lobotomized-style override: `<!-- … -->` frontmatter with an optional `variables:`
// whitelist. The body is irrelevant to the identifierMap cross-reference.
function override(path: string, vars: string[]): OverrideFile {
  const block =
    vars.length === 0 ? '' : `variables:\n${vars.map((v) => `  - ${v}`).join('\n')}\n`;
  return { path, content: `<!--\nname: '${path}'\nccVersion: 2.1.168\n${block}-->\nbody` };
}

// A legal-variable map as built from a prompts-<version>.json (prompt id → identifierMap values).
function legal(map: Record<string, string[]>): Map<string, Set<string>> {
  return new Map(Object.entries(map).map(([id, vs]) => [id, new Set(vs)]));
}

describe('parseAllowedVariables', () => {
  it('reads the declared variables list from the frontmatter block', () => {
    expect(parseAllowedVariables(override('a.md', ['HOOK_NAME', 'TASK_NOTES']).content)).toEqual([
      'HOOK_NAME',
      'TASK_NOTES',
    ]);
  });

  it('returns [] when there is no variables list or no frontmatter', () => {
    expect(parseAllowedVariables(override('a.md', []).content)).toEqual([]);
    expect(parseAllowedVariables('no frontmatter ${X}')).toEqual([]);
  });

  it('stops the list at the next frontmatter key', () => {
    const content = `<!--\nvariables:\n  - A\n  - B\nccVersion: 2.1.168\n-->\nbody`;
    expect(parseAllowedVariables(content)).toEqual(['A', 'B']);
  });

  it('strips stray quotes and drops empty entries', () => {
    const content = `<!--\nvariables:\n  - ''\n  - 'QUOTED'\n  - BARE\n-->\nbody`;
    expect(parseAllowedVariables(content)).toEqual(['QUOTED', 'BARE']);
  });
});

describe('promptIdOf / buildLegalMap', () => {
  it('derives the prompt id from the override filename', () => {
    expect(promptIdOf('/x/system-prompts-opus-4-8/agent-prompt-explore.md')).toBe(
      'agent-prompt-explore',
    );
  });

  it('builds prompt id → identifierMap value set', () => {
    const m = buildLegalMap({
      prompts: [
        { id: 'p1', identifierMap: { '0': 'TASK_TOOL_NAME', '1': 'USER_INSTRUCTIONS' } },
        { id: 'p2' },
      ],
    });
    expect(m.get('p1')).toEqual(new Set(['TASK_TOOL_NAME', 'USER_INSTRUCTIONS']));
    expect(m.get('p2')).toEqual(new Set());
  });
});

// The authoring-drift pre-check (ADR 0005): flags only a declared backing variable
// upstream renamed/inlined. It is NOT the authoritative orphan detector — runtime-scope
// orphans are Boot-verify's altitude — so these assert the narrow drift promise only.
describe('findOrphans — authoring-drift: declared variables vs. the target identifierMap', () => {
  it('flags a declared variable absent from the matched prompt identifierMap', () => {
    const files = [override('agent.md', ['BACKED', 'RENAMED_AWAY'])];
    const orphans = findOrphans(files, legal({ agent: ['BACKED'] }));
    expect(orphans).toEqual([{ file: 'agent.md', variable: 'RENAMED_AWAY' }]);
  });

  it('does NOT catch a runtime-scope orphan that the override never declared (Boot-verify owns that)', () => {
    // IS_TRUTHY_FN class: a name that only goes missing in the patched binary's runtime
    // scope, never declared in `variables:`. A static check structurally cannot see it.
    const files = [override('agent.md', ['BACKED'])];
    expect(findOrphans(files, legal({ agent: ['BACKED'] }))).toEqual([]);
  });

  it('an override whose declared variables are all backed has no orphans', () => {
    const files = [override('agent.md', ['X', 'Y'])];
    expect(findOrphans(files, legal({ agent: ['X', 'Y', 'Z'] }))).toEqual([]);
  });

  it('excludes synthetic positional placeholders (…_VAR_<n>) — matched by index, not name', () => {
    const files = [override('p.md', ['PROMPT_VAR_0', 'PROMPT_VAR_3', 'REAL_ORPHAN'])];
    expect(findOrphans(files, legal({ p: [] }))).toEqual([
      { file: 'p.md', variable: 'REAL_ORPHAN' },
    ]);
  });

  it('skips overrides that match no prompt in the target version (cannot validate)', () => {
    const files = [override('unknown-prompt.md', ['ANYTHING'])];
    expect(findOrphans(files, legal({ some_other: ['X'] }))).toEqual([]);
  });

  it('scopes legality per prompt (backed in one prompt is not backed in another)', () => {
    const files = [override('a.md', ['SHARED']), override('b.md', ['SHARED'])];
    expect(findOrphans(files, legal({ a: ['SHARED'], b: [] }))).toEqual([
      { file: 'b.md', variable: 'SHARED' },
    ]);
  });
});

describe('formatValidatorOutput — the validator signal FourZerosVerdict parses', () => {
  it('emits a ReferenceError line per orphan (the verdict signature)', () => {
    const out = formatValidatorOutput([override('a.md', ['MISSING'])], legal({ a: [] }));
    expect(out).toContain('ReferenceError: MISSING is not defined');
  });

  it('emits a clean, ReferenceError-free line when there are no orphans', () => {
    const files = [override('a.md', ['X']), override('b.md', ['Y'])];
    const out = formatValidatorOutput(files, legal({ a: ['X'], b: ['Y'] }));
    expect(out).not.toContain('ReferenceError');
    expect(out).toContain('0 orphans across 2 overrides');
  });
});
