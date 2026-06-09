#!/usr/bin/env python3
"""Self-test for typecheck-guard.py.

Runs the hook as a subprocess with a synthetic PreToolUse payload on stdin,
pointed (via CLAUDE_PROJECT_DIR) at a throwaway git repo, with a stub `pnpm`
ahead of it on PATH so pass/fail/missing toolchain are all exercised hermetically
and fast. Asserts exit 2 (blocked) only when a commit touches TS inputs AND the
typecheck fails, exit 0 otherwise — and that non-TS commits never even invoke
the typecheck. Run it directly (`./typecheck-guard.test.py`) — no framework.
"""
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
from pathlib import Path

HOOK = Path(__file__).with_name("typecheck-guard.py")

BLOCK = True
ALLOW = False

# (label, command, staged paths, unstaged-modified paths, stub rc, expect_block,
#  expect typecheck to have run)
CASES = [
    ("non-git command", "ls -la", ["src/a.ts"], [], 1, ALLOW, False),
    ("non-commit git", "git status", ["src/a.ts"], [], 1, ALLOW, False),
    ("'commit' as an argument, not the subcommand", "git log --grep commit",
     ["src/a.ts"], [], 1, ALLOW, False),
    ("'commit' as a ref name", "git push origin commit-fix",
     ["src/a.ts"], [], 1, ALLOW, False),
    ("global option before commit", "git -C . commit -m 'msg'",
     ["src/a.ts"], [], 1, BLOCK, True),
    ("staged TS, typecheck fails", "git commit -m 'msg'",
     ["src/a.ts"], [], 1, BLOCK, True),
    ("staged TS, typecheck passes", "git commit -m 'msg'",
     ["src/a.ts"], [], 0, ALLOW, True),
    ("staged tsx, typecheck fails", "git commit --amend --no-edit",
     ["src/a.tsx"], [], 1, BLOCK, True),
    ("staged tsconfig, typecheck fails", "git commit -m 'msg'",
     ["tsconfig.json"], [], 1, BLOCK, True),
    ("docs-only commit skips typecheck", "git commit -m 'docs'",
     ["README.md", "docs/x.md"], [], 1, ALLOW, False),
    ("hook-only commit skips typecheck", "git commit -m 'guard'",
     [".claude/hooks/typecheck-guard.py"], [], 1, ALLOW, False),
    # -a sweeps in modified-but-unstaged tracked TS
    ("commit -a with unstaged TS, fails", "git commit -am 'msg'",
     [], ["src/a.ts"], 1, BLOCK, True),
    ("plain commit ignores unstaged TS", "git commit -m 'msg'",
     ["README.md"], ["src/a.ts"], 1, ALLOW, False),
]


def make_repo(root: Path) -> None:
    env = dict(os.environ, GIT_CONFIG_GLOBAL="/dev/null", GIT_CONFIG_SYSTEM="/dev/null")
    def git(*args):
        subprocess.run(["git", *args], cwd=root, env=env, check=True,
                       capture_output=True)
    git("init", "-q")
    git("config", "user.email", "t@t")
    git("config", "user.name", "t")
    for p in ["src/a.ts", "src/a.tsx", "tsconfig.json", "README.md",
              "docs/x.md", ".claude/hooks/typecheck-guard.py"]:
        f = root / p
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text("base\n")
    git("add", "-A")
    git("commit", "-qm", "base")


def make_stub_pnpm(bindir: Path) -> None:
    stub = bindir / "pnpm"
    stub.write_text('#!/bin/sh\n'
                    'echo "ran $*" >> "$STUB_LOG"\n'
                    'echo "stub-tsc-error TS2322"\n'
                    'exit "$STUB_RC"\n')
    stub.chmod(stub.stat().st_mode | stat.S_IXUSR)


def run_hook(cmd: str, env_extra: dict) -> subprocess.CompletedProcess:
    env = dict(os.environ)
    env.update(env_extra)
    payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": cmd}})
    return subprocess.run([sys.executable, str(HOOK)], input=payload,
                          capture_output=True, text=True, env=env)


def main() -> int:
    failures = []
    with tempfile.TemporaryDirectory() as td:
        root = Path(td) / "repo"
        bindir = Path(td) / "bin"
        root.mkdir()
        bindir.mkdir()
        make_repo(root)
        make_stub_pnpm(bindir)
        git_env = dict(os.environ)

        for label, cmd, staged, unstaged, stub_rc, expect_block, expect_ran in CASES:
            # reset the work state, then stage / dirty per the case
            subprocess.run(["git", "reset", "-q"], cwd=root, env=git_env, check=True)
            subprocess.run(["git", "checkout", "-q", "--", "."], cwd=root,
                           env=git_env, check=True)
            for p in staged:
                (root / p).write_text(f"changed {label}\n")
            if staged:
                subprocess.run(["git", "add", "--", *staged], cwd=root,
                               env=git_env, check=True)
            for p in unstaged:
                (root / p).write_text(f"dirty {label}\n")
            log = Path(td) / "stub.log"
            log.write_text("")
            p = run_hook(cmd, {
                "CLAUDE_PROJECT_DIR": str(root),
                "PATH": f"{bindir}{os.pathsep}{os.environ['PATH']}",
                "STUB_RC": str(stub_rc),
                "STUB_LOG": str(log),
            })
            ran = bool(log.read_text())
            if (p.returncode == 2) != expect_block or ran != expect_ran:
                failures.append((label, expect_block, p.returncode, expect_ran, ran))
            if expect_block and "stub-tsc-error" not in p.stderr:
                failures.append((f"{label} (compiler output surfaced)",
                                 expect_block, p.returncode, expect_ran, ran))

        # fail open: pnpm absent from PATH → allow with a warning
        subprocess.run(["git", "reset", "-q"], cwd=root, env=git_env, check=True)
        (root / "src/a.ts").write_text("changed no-pnpm\n")
        subprocess.run(["git", "add", "src/a.ts"], cwd=root, env=git_env, check=True)
        nopnpm = Path(td) / "nopnpm"
        nopnpm.mkdir()
        for tool in ("git", "sh"):
            real = shutil.which(tool)
            if real:
                (nopnpm / tool).symlink_to(real)
        p = run_hook("git commit -m 'msg'", {
            "CLAUDE_PROJECT_DIR": str(root), "PATH": str(nopnpm),
        })
        if p.returncode != 0 or "pnpm not found" not in p.stderr:
            failures.append(("fail open without pnpm", ALLOW, p.returncode, None, None))

        # malformed payload → allow
        p = subprocess.run([sys.executable, str(HOOK)], input="not json",
                           capture_output=True, text=True)
        if p.returncode != 0:
            failures.append(("malformed payload", ALLOW, p.returncode, None, None))

    if failures:
        for label, expect, rc, expect_ran, ran in failures:
            want = "BLOCK" if expect else "ALLOW"
            print(f"FAIL: {label!r} expected {want} (ran={expect_ran}), "
                  f"got rc={rc} ran={ran}", file=sys.stderr)
        return 1
    print(f"typecheck-guard: {len(CASES) + 2} cases passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
