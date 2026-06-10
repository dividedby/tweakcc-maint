#!/usr/bin/env python3
"""SessionStart roadmap drift nudge (TEMPLATE — copy to a consumer's
`.claude/hooks/` and edit the config block). Cheaply compares the census
against current issue state; on drift, prints a one-line nudge to run
/doc-regen. Advisory only (never blocks, never edits); throttled; fails open
silently (offline / no gh / no roadmap). Stdlib only (ADR 0004).

The census parser auto-derives the issue/status columns from the table *header*
(matching the `#`/`Issue` and `Status` cells), so most repos need no column
edits. ISSUE_COL / STATUS_COL below are explicit overrides — set a value to pin
a column (it wins over auto-derivation); leave `None` to auto-derive. DONE_TOKEN
is matched case-insensitively and is emoji-aware (e.g. `✅`). See the matching
`roadmap-drift-nudge.test.py` to confirm your config against a sample table."""
import json
import os
import subprocess
import sys
import time

# --- config (edit per repo) -------------------------------------------------
# Two-repo census (ADR 0009): one census in tweakcc-maint tracks issues from BOTH
# `dividedby/tweakcc-maint` (rows written as a bare integer) and `dividedby/bench`
# (rows written `bench#NN`). Rows and gh state are keyed by a composite (repo,
# number) identity, so a `bench#NN` row matches its bench issue rather than reading
# as "unfiled". `bench` has no roadmap/inbox/mirror of its own.
HOME_REPO = "dividedby/tweakcc-maint"   # bare-integer rows resolve here
REPOS = ("dividedby/tweakcc-maint", "dividedby/bench")
# A census issue cell prefixed with one of these short tags binds the row to the
# matching repo; an unprefixed bare integer binds to HOME_REPO. (short-tag -> repo)
REPO_TAGS = {"bench": "dividedby/bench"}
ROADMAP = "docs/plans/roadmap.md"
STAMP = ".git/roadmap-drift-nudge.stamp"  # never committed (lives under .git/).
# If .git/ must stay pristine, repoint STAMP outside the repo — e.g. a temp path
# keyed by a hash of this repo's location so concurrent repos don't collide:
#   import hashlib, tempfile
#   _key = hashlib.sha1(os.path.abspath(ROADMAP).encode()).hexdigest()[:16]
#   STAMP = os.path.join(tempfile.gettempdir(), f"roadmap-drift-nudge-{_key}.stamp")
# The stamp only throttles the nudge; losing it just means an extra check, so a
# volatile temp dir is a safe home.
THROTTLE_SECONDS = 6 * 60 * 60
GH_TIMEOUT = 8
ISSUE_COL: int | None = None   # override: zero-based issue-number column (None ⇒ auto-derive from header)
STATUS_COL: int | None = None  # override: zero-based status column (None ⇒ auto-derive from header)
DONE_TOKEN = "done"  # substring in the status cell that means closed/done; matched
                     # case-insensitively and emoji-aware (e.g. set to "✅")
# Header cells the auto-deriver matches (lowercased, exact) to find each column.
ISSUE_HEADERS = ("#", "issue")
STATUS_HEADERS = ("status",)
# Issues tracked by an aggregate/epic row (e.g. `| K3 | … filed #298–#304 |`)
# rather than one row each. The parser can't see aggregate coverage, so without
# this set those children read as "unfiled" on every session forever. Curate it
# when you create an aggregate row (see the runbook note). Keyed by the same
# composite identity as the census — `(HOME_REPO, NN)` for a tweakcc-maint child,
# `("dividedby/bench", NN)` for a bench child. Also absorbs the pinned 🗺️ Roadmap
# mirror issue (machine-owned render target, ADR 0020 — never a census row).
AGGREGATE_COVERED: set[tuple[str, int]] = {(HOME_REPO, 159)}
# ---------------------------------------------------------------------------


def _split_row(line: str) -> list[str]:
    return [c.strip() for c in line.strip().strip("|").split("|")]


def _is_separator(cells: list[str]) -> bool:
    """A `| --- | --- |` separator row: every cell is only dashes/colons."""
    return bool(cells) and all(set(c) <= {"-", ":"} and c for c in cells)


def _derive_cols(cells: list[str]) -> tuple[int, int] | None:
    """Given a header row's cells, return (issue_col, status_col) by matching
    ISSUE_HEADERS / STATUS_HEADERS, or None if either is absent."""
    lowered = [c.strip().lower() for c in cells]
    issue_col = status_col = None
    for i, cell in enumerate(lowered):
        if issue_col is None and cell in ISSUE_HEADERS:
            issue_col = i
        if status_col is None and cell in STATUS_HEADERS:
            status_col = i
    if issue_col is None or status_col is None:
        return None
    return issue_col, status_col


def resolve_cols(text: str) -> tuple[int, int] | None:
    """Resolve (issue_col, status_col): explicit ISSUE_COL/STATUS_COL overrides
    win; otherwise auto-derive from the first table header row that carries both
    an issue and a status column. Returns None if neither override nor a
    matching header is found."""
    if ISSUE_COL is not None and STATUS_COL is not None:
        return ISSUE_COL, STATUS_COL
    derived = None
    for line in text.splitlines():
        if not line.lstrip().startswith("|"):
            continue
        cells = _split_row(line)
        if _is_separator(cells):
            continue
        derived = _derive_cols(cells)
        if derived is not None:
            break
    if derived is None:
        return None
    issue_col = ISSUE_COL if ISSUE_COL is not None else derived[0]
    status_col = STATUS_COL if STATUS_COL is not None else derived[1]
    return issue_col, status_col


def _parse_issue_cell(cell: str) -> tuple[str, int] | None:
    """Parse a census issue cell into a composite (repo, number) identity, or None
    if it is not an issue cell (header / separator / prose). A bare integer binds
    to HOME_REPO; a `<tag>#NN` cell (e.g. `bench#7`) binds to REPO_TAGS[tag]. A
    leading `#` on a bare number is tolerated (`#148`)."""
    raw = cell.strip()
    if "#" in raw and not raw.startswith("#"):
        tag, _, rest = raw.partition("#")
        tag = tag.strip().lower()
        rest = rest.strip()
        if tag in REPO_TAGS and rest.isdigit():
            return REPO_TAGS[tag], int(rest)
        return None
    num = raw.lstrip("#").strip()
    if num.isdigit():
        return HOME_REPO, int(num)
    return None


def parse_census(text: str) -> dict[tuple[str, int], str]:
    """Map (repo, number) -> normalized status from the census table. Pure; column
    indices are resolved from the header (see resolve_cols), then a row counts only
    when its issue cell parses as a repo-qualified or bare issue id (skips header
    and `| --- |` separator rows automatically)."""
    cols = resolve_cols(text)
    if cols is None:
        return {}
    issue_col, status_col = cols
    rows: dict[tuple[str, int], str] = {}
    for line in text.splitlines():
        if not line.lstrip().startswith("|"):
            continue
        cells = _split_row(line)
        if len(cells) <= max(issue_col, status_col):
            continue
        key = _parse_issue_cell(cells[issue_col])
        if key is None:
            continue
        status = cells[status_col].replace("*", "").replace("`", "").strip().lower()
        rows[key] = status
    return rows


def compute_drift(rows: dict[tuple[str, int], str], states: dict[tuple[str, int], str]):
    """Pure. Returns (stale_closed, unfiled_open) as lists of (repo, number):
    - stale_closed: issues closed on GitHub but not yet Done in the census.
    - unfiled_open: issues open on GitHub with no census row."""
    done = DONE_TOKEN.lower()  # status is already lowercased; emoji pass through unchanged
    stale_closed = sorted(k for k, st in rows.items()
                          if states.get(k) == "closed" and done not in st)
    unfiled_open = sorted(k for k, st in states.items()
                          if st == "open" and k not in rows
                          and k not in AGGREGATE_COVERED)
    return stale_closed, unfiled_open


def _throttled() -> bool:
    try:
        return (time.time() - os.path.getmtime(STAMP)) < THROTTLE_SECONDS
    except OSError:
        return False


def _stamp() -> None:
    try:
        with open(STAMP, "w") as f:
            f.write(str(int(time.time())))
    except OSError:
        pass


def _label(key: tuple[str, int]) -> str:
    """Render a composite identity for the nudge message: `#NN` for HOME_REPO,
    `<tag>#NN` for a tracked sibling repo (e.g. `bench#7`)."""
    repo, num = key
    if repo == HOME_REPO:
        return f"#{num}"
    for tag, r in REPO_TAGS.items():
        if r == repo:
            return f"{tag}#{num}"
    return f"{repo}#{num}"


def _issue_states():
    """Composite (repo, number) -> state across all REPOS (ADR 0009). Fails open:
    if ANY repo's `gh` call errors (offline / no gh / not found), returns None so
    the caller skips the nudge rather than mis-reporting a partial-state drift."""
    states: dict[tuple[str, int], str] = {}
    for repo in REPOS:
        try:
            out = subprocess.check_output(
                ["gh", "issue", "list", "-R", repo, "--state", "all",
                 "--limit", "400", "--json", "number,state"],
                text=True, stderr=subprocess.DEVNULL, timeout=GH_TIMEOUT)
        except Exception:
            return None
        for it in json.loads(out):
            states[(repo, it["number"])] = it["state"].lower()
    return states


def main() -> int:
    try:
        json.load(sys.stdin)
    except Exception:
        pass
    if not os.path.exists(ROADMAP) or _throttled():
        return 0
    states = _issue_states()
    if states is None:
        return 0  # offline / no gh — retry next session (no stamp written)
    _stamp()
    try:
        with open(ROADMAP) as f:
            rows = parse_census(f.read())
    except OSError:
        rows = {}
    stale_closed, unfiled_open = compute_drift(rows, states)
    if not stale_closed and not unfiled_open:
        return 0
    parts = []
    if stale_closed:
        parts.append(f"{len(stale_closed)} closed issue(s) still non-Done in the census "
                     f"({', '.join(_label(k) for k in stale_closed)})")
    if unfiled_open:
        parts.append(f"{len(unfiled_open)} open issue(s) with no census row "
                     f"({', '.join(_label(k) for k in unfiled_open)}) — some may be aggregate-covered")
    msg = ("Roadmap drift: " + ROADMAP + " may be stale vs `gh` issue state — "
           + "; ".join(parts) + ". Run `/doc-regen` to reconcile (it edits the "
           "working tree for review and writes additive issue comments; it never commits).")
    print(json.dumps({"hookSpecificOutput":
          {"hookEventName": "SessionStart", "additionalContext": msg}}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
