# Series-title corpus and structured metadata (#48)

Cameron approved the orchestrator decision in cos-media2/brief-fix2.md: Codex must remove both new dash and Part N of X parsing formats, retain the verified corpus, and leave issue #48 open for a non-regex approach. Codex owns delivery on cos/48-series-title-corpus / PR #53.

- [x] Merge current origin/main (9ed60f3) without rebasing; preserve unrelated source-error and constants changes.
- [x] Remove both new regex formats entirely; retain existing parenthetical, hash, and Book N parsing.
- [x] Keep all 15 verbatim Open Library record titles, with conservative no-series expectations for the deferred forms.
- [x] Cover the false-positive examples from both review rounds as unchanged-title rejection regressions.
- [x] Retain structured source-series precedence and describe title cleaning.
- [x] Complete independent review and repository build, lint, typecheck, formatting, and full tests.
- [x] Prepare the reviewed PR #53 description with Part of #48 and explicit deferral. Delivery and final CI/head evidence are recorded in report.md after the implementation commit.

Issue #48 stays open: additional title formats need a non-regex source of series metadata, such as structured provider API fields. Codex does not implement that future approach, merge the PR, or change issue state in this run.

Final local validation: build, lint, typecheck, scoped formatting, and 24 files / 408 tests pass with one worker. The initial two-worker run hit the existing transport compiler setup timeout; no timeout or test was changed. A prior-parser negative control fails on 17 of the 37 review inputs. Independent review completed with no supported fix2 defects.

Review advisory declined within this scope: the numeric-series compatibility case retains the inherited trailing-comma output for Title (86, #1). Correcting the parser would break the explicitly preserved main parser identity; this PR makes no parser-format changes.
