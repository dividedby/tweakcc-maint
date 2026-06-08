#!/usr/bin/env python3
"""Self-test for secret-guard.py.

Runs the hook as a subprocess with a synthetic PreToolUse payload on stdin and
asserts exit 2 (blocked) when a credential would reach a file / the tree, exit 0
otherwise. Run it directly (`./secret-guard.test.py`) — no test framework needed.
"""
import json
import subprocess
import sys
from pathlib import Path

HOOK = Path(__file__).with_name("secret-guard.py")

BLOCK = True
ALLOW = False

CASES = [
    # secret env var / literal written to a file — the leak
    ("echo $ANTHROPIC_API_KEY > key.txt", BLOCK),
    ("echo ${ANTHROPIC_API_KEY} >> .env", BLOCK),
    ("printf '%s' \"$CLAUDE_CODE_OAUTH_TOKEN\" > token", BLOCK),
    ("echo $ANTHROPIC_AUTH_TOKEN | tee creds.txt", BLOCK),
    ("echo sk-ant-api03-AbCdEf12 > note.md", BLOCK),
    # force-add of a credential-shaped path past .gitignore
    ("git add -f .env", BLOCK),
    ("git add --force secrets/key.pem", BLOCK),
    ("git add -f ./config/prod.token", BLOCK),

    # reads / mentions without a write — allowed
    ("echo ${ANTHROPIC_API_KEY:+set}", ALLOW),
    ("env | grep ANTHROPIC_API_KEY", ALLOW),
    ("test -n \"$ANTHROPIC_API_KEY\"", ALLOW),
    # write of a non-secret — allowed
    ("pnpm tsx src/cli.ts | tee adoption-record.json", ALLOW),
    ("echo hello > out.txt", ALLOW),
    # normal git add (gitignore still protects secret files) — allowed
    ("git add .", ALLOW),
    ("git add -A", ALLOW),
    ("git add src/cli.ts", ALLOW),
    # force-add of a NON-credential path — allowed (.env.example is the carve-out)
    ("git add -f .env.example", ALLOW),
    ("git add -f dist/index.mjs", ALLOW),
]


def run(cmd: str) -> int:
    payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": cmd}})
    p = subprocess.run([sys.executable, str(HOOK)], input=payload,
                       capture_output=True, text=True)
    return p.returncode


def main() -> int:
    failures = []
    for cmd, expect_block in CASES:
        rc = run(cmd)
        if (rc == 2) != expect_block:
            failures.append((cmd, expect_block, rc))
    if failures:
        for cmd, expect, rc in failures:
            want = "BLOCK" if expect else "ALLOW"
            print(f"FAIL: {cmd!r} expected {want}, got rc={rc}", file=sys.stderr)
        return 1
    print(f"secret-guard: {len(CASES)} cases passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
