#!/usr/bin/env python3
"""Pins the census parser + drift computation in `roadmap-drift-nudge.py`
against a sample table (TEMPLATE — ships beside the hook). Run after editing
the config block to confirm ISSUE_COL / STATUS_COL / DONE_TOKEN match your
roadmap's column layout (run the file directly — the `.test.py` name is not a
`-m unittest` module path):

    python3 .claude/hooks/roadmap-drift-nudge.test.py

Stdlib only (ADR 0004). The hook's filename has hyphens, so it is loaded by
path rather than imported by name."""
import sys
sys.dont_write_bytecode = True  # don't leak __pycache__/ into a consumer's tracked hooks dir

import importlib.util
import os
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "roadmap_drift_nudge", os.path.join(_HERE, "roadmap-drift-nudge.py"))
nudge = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(nudge)

HOME = nudge.HOME_REPO          # "dividedby/tweakcc-maint"
BENCH = nudge.REPO_TAGS["bench"]  # "dividedby/bench"

# Default census schema: | # | Issue | Wave | Status | Owner | Skill(s) | Deps | Notes |
SAMPLE = """\
## Master census (all open issues)
| # | Issue | Wave | Status | Owner | Skill(s) | Deps | Notes |
| - | ----- | ---- | ------ | ----- | -------- | ---- | ----- |
| 12 | first thing | W1 | **Next** | agent | `/tdd` | — | — |
| 34 | a closed one | W1 | Done | agent | `/tdd` | _#12_ | — |
| 56 | blocked thing | W2 | `Blocked` | human | — | #12 | wait on 12 |
| bench#7 | a bench thing | — | **Next** | agent | — | — | tracked here |
"""


class TestParseCensus(unittest.TestCase):
    def test_extracts_number_and_status(self):
        rows = nudge.parse_census(SAMPLE)
        self.assertEqual(rows, {(HOME, 12): "next", (HOME, 34): "done",
                                (HOME, 56): "blocked", (BENCH, 7): "next"})

    def test_skips_header_and_separator_rows(self):
        # Header ("#"/"Issue") and the `| - | --- |` row have no integer in ISSUE_COL.
        self.assertNotIn("issue", nudge.parse_census(SAMPLE))

    def test_parses_bench_qualified_row(self):
        # A `bench#NN` issue cell binds the row to dividedby/bench (ADR 0009),
        # keyed by the composite (repo, number) identity — distinct from a bare #7.
        rows = nudge.parse_census(SAMPLE)
        self.assertIn((BENCH, 7), rows)
        self.assertNotIn((HOME, 7), rows)
        self.assertEqual(rows[(BENCH, 7)], "next")

    def test_strips_markdown_emphasis_from_status(self):
        table = ("| # | Issue | Wave | Status | a | b | c | d |\n"
                 "| 7 | x | W1 | **Next** | a | b | c | d |")
        rows = nudge.parse_census(table)
        self.assertEqual(rows[(HOME, 7)], "next")

    def test_auto_derives_columns_from_default_header(self):
        # With ISSUE_COL/STATUS_COL left None, the columns are read from the header.
        self.assertEqual(nudge.resolve_cols(SAMPLE), (0, 3))


# A real-world divergent census: 9 columns, status LAST (index 8), `✅` = done,
# and the issue column lives at index 1 under an `Issue` header (not `#`).
EMOJI_SAMPLE = """\
## Master census
| Row | Issue | Wave | Owner | Skill(s) | Deps | Cluster | Notes | Status |
| --- | ----- | ---- | ----- | -------- | ---- | ------- | ----- | ------ |
| a | #12 | W1 | agent | `/tdd` | — | core | — | **Next** |
| b | #34 | W1 | agent | `/tdd` | — | core | — | ✅ |
"""


class TestAutoDeriveAndEmoji(unittest.TestCase):
    def test_derives_non_default_columns_from_header(self):
        # Issue under "Issue" header at index 1; "Status" header last at index 8.
        self.assertEqual(nudge.resolve_cols(EMOJI_SAMPLE), (1, 8))

    def test_parses_emoji_status_census(self):
        rows = nudge.parse_census(EMOJI_SAMPLE)
        self.assertEqual(rows, {(HOME, 12): "next", (HOME, 34): "✅"})

    def test_emoji_done_token_marks_closed_as_not_stale(self):
        rows = nudge.parse_census(EMOJI_SAMPLE)
        states = {(HOME, 12): "open", (HOME, 34): "closed"}
        original = nudge.DONE_TOKEN
        nudge.DONE_TOKEN = "✅"
        try:
            stale, unfiled = nudge.compute_drift(rows, states)
        finally:
            nudge.DONE_TOKEN = original
        self.assertEqual(stale, [])  # 34 is ✅ in census, GitHub-closed — in sync
        self.assertEqual(unfiled, [])

    def test_explicit_override_wins_over_header(self):
        original = (nudge.ISSUE_COL, nudge.STATUS_COL)
        nudge.ISSUE_COL, nudge.STATUS_COL = 1, 8
        try:
            self.assertEqual(nudge.resolve_cols(EMOJI_SAMPLE), (1, 8))
            self.assertEqual(nudge.parse_census(EMOJI_SAMPLE),
                             {(HOME, 12): "next", (HOME, 34): "✅"})
        finally:
            nudge.ISSUE_COL, nudge.STATUS_COL = original

    def test_no_matching_header_yields_empty(self):
        no_header = "| a | b |\n| 12 | next |"
        self.assertIsNone(nudge.resolve_cols(no_header))
        self.assertEqual(nudge.parse_census(no_header), {})


class TestComputeDrift(unittest.TestCase):
    def test_stale_closed_when_gh_closed_but_census_not_done(self):
        rows = {(HOME, 12): "next", (HOME, 34): "done"}
        states = {(HOME, 12): "closed", (HOME, 34): "closed"}
        stale, unfiled = nudge.compute_drift(rows, states)
        self.assertEqual(stale, [(HOME, 12)])   # 34 is already Done — not stale
        self.assertEqual(unfiled, [])

    def test_unfiled_open_when_gh_open_but_no_row(self):
        rows = {(HOME, 12): "next"}
        states = {(HOME, 12): "open", (HOME, 99): "open"}
        stale, unfiled = nudge.compute_drift(rows, states)
        self.assertEqual(stale, [])
        self.assertEqual(unfiled, [(HOME, 99)])

    def test_clean_when_in_sync(self):
        rows = {(HOME, 12): "next", (HOME, 34): "done"}
        states = {(HOME, 12): "open", (HOME, 34): "closed"}
        self.assertEqual(nudge.compute_drift(rows, states), ([], []))

    def test_aggregate_covered_excluded_from_unfiled(self):
        # Children tracked by an aggregate/epic row (no row of their own) must not
        # read as "unfiled" once listed in AGGREGATE_COVERED (composite-keyed).
        rows = {(HOME, 12): "next"}
        states = {(HOME, 12): "open", (HOME, 298): "open",
                  (HOME, 299): "open", (HOME, 99): "open"}
        original = nudge.AGGREGATE_COVERED
        nudge.AGGREGATE_COVERED = {(HOME, 298), (HOME, 299)}
        try:
            stale, unfiled = nudge.compute_drift(rows, states)
        finally:
            nudge.AGGREGATE_COVERED = original
        self.assertEqual(stale, [])
        self.assertEqual(unfiled, [(HOME, 99)])  # 298/299 suppressed; 99 is genuine


class TestTwoRepoDrift(unittest.TestCase):
    """ADR 0009: the census tracks BOTH dividedby/tweakcc-maint and
    dividedby/bench, keyed by (repo, number). A bench issue closed-but-non-Done
    surfaces as stale; a bench open issue WITH a census row is NOT unfiled; and a
    bare #NN never collides with bench#NN."""

    def test_bench_closed_non_done_is_stale_qualified(self):
        rows = {(BENCH, 3): "next", (BENCH, 7): "next"}
        states = {(BENCH, 3): "closed", (BENCH, 7): "open"}
        stale, unfiled = nudge.compute_drift(rows, states)
        self.assertEqual(stale, [(BENCH, 3)])     # bench#3 closed but row non-Done
        self.assertEqual(unfiled, [])             # bench#7 has a row -> not unfiled
        self.assertEqual(nudge._label((BENCH, 3)), "bench#3")

    def test_bench_open_with_row_not_flagged_unfiled(self):
        # The cross-repo enumeration keys bench issues by (BENCH, n); a census row
        # written `bench#7` matches it, so it must not read as unfiled drift.
        rows = {(HOME, 12): "next", (BENCH, 7): "next", (BENCH, 8): "next"}
        states = {(HOME, 12): "open", (BENCH, 7): "open", (BENCH, 8): "open"}
        stale, unfiled = nudge.compute_drift(rows, states)
        self.assertEqual(stale, [])
        self.assertEqual(unfiled, [])

    def test_bare_and_bench_same_number_are_distinct(self):
        # #7 (tweakcc-maint, open) and bench#7 (bench, has a row) don't collide.
        rows = {(BENCH, 7): "next"}
        states = {(HOME, 7): "open", (BENCH, 7): "open"}
        stale, unfiled = nudge.compute_drift(rows, states)
        self.assertEqual(stale, [])
        self.assertEqual(unfiled, [(HOME, 7)])    # the tweakcc-maint #7 is unfiled
        self.assertEqual(nudge._label((HOME, 7)), "#7")


if __name__ == "__main__":
    unittest.main()
