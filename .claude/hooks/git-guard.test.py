#!/usr/bin/env python3
"""Self-test for git-guard.py.

Runs the hook as a subprocess with a synthetic PreToolUse payload on stdin and
asserts exit 2 (blocked) for destructive git and exit 0 (allowed) for benign
commands and non-git commands. This test is the feedback gate for the guard:
run it directly (`./git-guard.test.py`) — no test framework required.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

HOOK = Path(__file__).with_name("git-guard.py")

BLOCK = True
ALLOW = False

# Always-enforced cases — run with the unattended signal cleared (interactive)
# to prove these block regardless of environment.
CASES = [
    ("git push --force", BLOCK),
    ("git push -f", BLOCK),
    ("git push --force origin main", BLOCK),
    ("git push origin main --force", BLOCK),
    ("git push -fu origin main", BLOCK),
    ("git reset --hard", BLOCK),
    ("git reset --hard HEAD~1", BLOCK),
    ("git clean -f", BLOCK),
    ("git clean -fd", BLOCK),
    ("git clean -xfd", BLOCK),
    ("git checkout -- file.txt", BLOCK),
    ("git checkout .", BLOCK),
    ("git checkout --force", BLOCK),
    ("git checkout -f main", BLOCK),
    ("git restore file.txt", BLOCK),
    ("git restore .", BLOCK),
    ("git restore --worktree --staged file.txt", BLOCK),

    # benign git — the loop's own normal operations must pass
    ("git commit -m 'msg'", ALLOW),
    ("git push", ALLOW),
    ("git push origin main", ALLOW),
    ("git push --force-with-lease", ALLOW),
    ("git add .", ALLOW),
    ("git add -A", ALLOW),
    ("git status", ALLOW),
    ("git checkout -b new-branch", ALLOW),
    ("git checkout main", ALLOW),
    ("git restore --staged file.txt", ALLOW),
    ("git clean -n", ALLOW),
    # non-git passes through (other guards' concern)
    ("rm -rf build", ALLOW),
]

# Environment-sensitive: branch delete blocks only when unattended.
ENV_CASES = [
    ("git branch -d old", {"CI": "true"}, BLOCK),
    ("git branch --delete old", {"GITHUB_ACTIONS": "true"}, BLOCK),
    ("git branch -d old", {}, ALLOW),  # interactive: routine cleanup
]


def run(cmd: str, env_extra: dict) -> int:
    env = {k: v for k, v in os.environ.items() if k not in ("CI", "GITHUB_ACTIONS")}
    env.update(env_extra)
    payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": cmd}})
    p = subprocess.run([sys.executable, str(HOOK)], input=payload,
                       capture_output=True, text=True, env=env)
    return p.returncode


def main() -> int:
    failures = []
    for cmd, expect_block in CASES:
        rc = run(cmd, {})
        if (rc == 2) != expect_block:
            failures.append((cmd, expect_block, rc))
    for cmd, env_extra, expect_block in ENV_CASES:
        rc = run(cmd, env_extra)
        if (rc == 2) != expect_block:
            failures.append((f"{cmd} {env_extra}", expect_block, rc))
    if failures:
        for cmd, expect, rc in failures:
            want = "BLOCK" if expect else "ALLOW"
            print(f"FAIL: {cmd!r} expected {want}, got rc={rc}", file=sys.stderr)
        return 1
    total = len(CASES) + len(ENV_CASES)
    print(f"git-guard: {total} cases passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
