#!/usr/bin/env python3
"""PreToolUse Bash guard: hard-block the `claude -p` license reaching the tree.

ADR 0003 makes keeping the credential out of the public tree mandatory and the
gate reads it from the environment at run time (never a committed file). ADR 0006
adds the unattended `claude -p` CI runner — the trigger that was absent at
greenfield — so this checked-in, project-scope guard now runs where the
maintainer's global ~/.claude guards are not. `.gitignore` already keeps the
credential *files* out; this hook covers the two active ways an agent's shell
could still leak the secret:

  1. Writing a known credential env var (or an `sk-ant-` literal) into a file via
     a redirect / `tee` — e.g. `echo $ANTHROPIC_API_KEY > key.txt`.
  2. Force-adding a credential-shaped path past `.gitignore` — `git add -f .env`.

Reads of the env var without a write (e.g. `echo ${ANTHROPIC_API_KEY:+set}`) pass.
Exits 2 with a stderr reason to block, 0 otherwise. The Write/Edit tool vector is
out of scope here (it cannot interpolate a runtime env var); this guard is the
shell vector. Destructive git is git-guard.py's concern.

Payload: the documented PreToolUse shape on stdin —
  {"tool_name": "Bash", "tool_input": {"command": "..."}}
"""
import json
import re
import sys

# A credential by name (the env vars the gate accepts — src/cli.ts) or by shape
# (an Anthropic key/token literal). Word-boundaried so substrings don't overmatch.
_SECRET_TOKEN = re.compile(
    r'(?:\bANTHROPIC_API_KEY\b|\bANTHROPIC_AUTH_TOKEN\b'
    r'|\bCLAUDE_CODE_OAUTH_TOKEN\b|\bsk-ant-[A-Za-z0-9_-]{8,})'
)
# A write-redirection (`>`/`>>`, optional noclobber-force `>|`) or a `tee`. We
# block only when a secret token *and* a file write co-occur — that is the leak.
_WRITE = re.compile(r'(?:>>?\s*\|?|\btee\b)')

# git add forcing a path past .gitignore.
_GIT_ADD_FORCE = re.compile(
    r'\bgit\s+add\b[^|;&\n]*(?:--force\b|(?:^|\s)-[a-z]*f[a-z]*(?=\s|$))',
    re.IGNORECASE,
)
# A credential-shaped path: .env / .env.<env> (but NOT .env.example), *.token,
# secrets/, .credentials.json — optionally under a dir or ~/.
_CRED_PATH = re.compile(
    r'''(?<![\w./-])(?:\./|~/|[\w./-]*/)?'''
    r'''(?:\.env(?:\.(?!example\b)[\w-]+)?|[\w.-]+\.token|secrets/[^\s'"|;&<>]*|\.credentials\.json)'''
    r'''(?=$|[\s'"|;&<>])'''
)


def find_block(cmd: str):
    if _SECRET_TOKEN.search(cmd) and _WRITE.search(cmd):
        return 'writing a Claude Code credential into a file (it must stay in the environment — ADR 0003)'
    if _GIT_ADD_FORCE.search(cmd) and _CRED_PATH.search(cmd):
        return 'force-adding a credential-shaped path past .gitignore'
    return None


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0
    cmd = ((data.get('tool_input') or {}).get('command') or '')
    if not cmd:
        return 0
    label = find_block(cmd)
    if label:
        print(f'Blocked by project secret-guard: {label}. Ask the user before '
              f'running it.', file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
