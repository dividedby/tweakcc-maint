#!/usr/bin/env python3
"""PreToolUse Bash guard: gate `git commit` on a passing typecheck.

"Run `pnpm typecheck` before committing" lived only as prose in the project
instructions — advisory, with no mechanical gate behind it under the unattended
`claude -p` runner (ADR 0006), and this repo has no PR-triggered CI to catch a
type-broken commit later (the gate is local-first, ADR 0003). This checked-in
hook makes the rule deterministic: when the candidate Bash command is a
`git commit` whose changeset touches TypeScript sources (or a tsconfig), it
runs the whole-repo `pnpm typecheck` and exits 2 with the compiler output on
failure. Commits that touch no TS input — docs-only, hook-only — pass through
without paying the typecheck cost.

Scope decision (issue #77's open design question): the *trigger* is scoped to
staged TS inputs so non-TS commits are free, but the *check* is the whole-repo
`tsc --noEmit` — per-file checking is unsound (a change can break a dependent
file that isn't staged) and the full check measures under a second here.

Failure philosophy matches the sibling guards (fail open on infra, fail closed
on the violation): a malformed payload, a missing `pnpm`/`git`, or a typecheck
that hangs past the deadline allows the commit with a stderr warning; only a
typecheck that *ran and reported errors* blocks.

Payload: the documented PreToolUse shape on stdin —
  {"tool_name": "Bash", "tool_input": {"command": "..."}}
"""
import json
import os
import re
import subprocess
import sys

# Any command segment that creates a commit. Only git *global options* may sit
# between `git` and `commit` (`-C <dir>`, `-c k=v`, `--git-dir=…`, …) so another
# subcommand mentioning "commit" in its args (`git log --grep commit`,
# `git push origin commit-fix`) doesn't false-positive. `[^|;&\n]*` keeps the
# trailing-args capture within a single command segment, mirroring the siblings.
_GIT_COMMIT = re.compile(
    r'\bgit\s+(?:(?:-[cC]\s+\S+|--?\S+)\s+)*commit\b([^|;&\n]*)', re.IGNORECASE)
# `git commit -a/--all` also sweeps in modified-but-unstaged tracked files.
_ALL_FLAG = re.compile(r'(?:^|\s)(?:--all\b|-[a-z]*a[a-z]*(?=\s|$))', re.IGNORECASE)

# A file whose change can alter the typecheck result: TS sources and tsconfigs.
_TS_INPUT = re.compile(r'(?:\.(?:ts|tsx|mts|cts)$|(?:^|/)tsconfig[^/]*\.json$)')

# Wall-clock budget for the typecheck subprocess. The check measures ~1s here;
# past this deadline we assume a hung toolchain, not type errors, and fail open.
TYPECHECK_DEADLINE_S = 90


def _warn_open(reason: str) -> int:
    print(f'typecheck-guard: {reason}; allowing the commit unchecked — '
          f'run `pnpm typecheck` manually.', file=sys.stderr)
    return 0


def changed_files(repo: str, include_unstaged: bool) -> list[str] | None:
    """Paths the commit would include, or None if git itself failed."""
    files: list[str] = []
    specs = [['git', 'diff', '--cached', '--name-only']]
    if include_unstaged:
        specs.append(['git', 'diff', '--name-only'])
    for spec in specs:
        p = subprocess.run(spec, cwd=repo, capture_output=True, text=True)
        if p.returncode != 0:
            return None
        files.extend(p.stdout.splitlines())
    return files


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0
    cmd = ((data.get('tool_input') or {}).get('command') or '')
    m = _GIT_COMMIT.search(cmd)
    if not m:
        return 0

    repo = os.environ.get('CLAUDE_PROJECT_DIR') or os.getcwd()
    try:
        files = changed_files(repo, include_unstaged=bool(_ALL_FLAG.search(m.group(1))))
    except FileNotFoundError:
        return _warn_open('git not found')
    if files is None:
        return _warn_open('could not read the changeset')
    if not any(_TS_INPUT.search(f) for f in files):
        return 0  # docs-only / non-TS commit: no typecheck input changed

    try:
        check = subprocess.run(['pnpm', 'typecheck'], cwd=repo,
                               capture_output=True, text=True,
                               timeout=TYPECHECK_DEADLINE_S)
    except FileNotFoundError:
        return _warn_open('pnpm not found')
    except subprocess.TimeoutExpired:
        return _warn_open(f'typecheck exceeded {TYPECHECK_DEADLINE_S}s')
    if check.returncode == 0:
        return 0
    print(f'Blocked by project typecheck-guard: `pnpm typecheck` fails, so this '
          f'commit would land type-broken code. Fix the errors below, then '
          f'commit.\n{check.stdout}{check.stderr}', file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main())
