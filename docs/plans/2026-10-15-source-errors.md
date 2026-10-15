# Source error normalization (#13)

Cameron approved this issue in cos-media2/go.md. Codex owns implementation and delivery on cos/13-source-errors.

- [x] Add typed errors and normalize against the existing ErrorCodeSchema.
- [x] Normalize source exception diagnostics without changing optional-provider null/partial-result fallbacks.
- [x] Use the common application error format at the single-tool and batch boundaries; retain SDK JSON-RPC envelopes.
- [x] Add regression coverage for typed, legacy, validation, network, and arbitrary thrown values; document public fields.
- [x] Complete independent review and resolve supported findings, including typed TMDB propagation, retry delays, safe normalization, and structured diagnostics.
- [x] Complete final build, lint, typecheck, formatting, and full-suite verification: 22 files / 284 tests pass with two workers.

Do not change authentication, CORS, credentials, workflow policy, or deployments. Unexpected codes map to existing SOURCE_ERROR rather than expand the public enum. Optional book-source exceptions remain best-effort and partial-success behavior remains intact. Primary TMDB failures retain typed codes rather than becoming non-retryable no-match errors. Delivery state is recorded in the chief-of-staff report.

## Review fix round 1

- [x] Codex merged current origin/main before applying review fixes.
- [x] Preserve HTTP 404 as a non-retryable NOT_FOUND through explicit movie and TV ID tools, with tests using the real TMDB source.
- [x] Default unclassified errors, including TypeError and unreadable thrown objects, to retryable false; retain explicitly transient errors and timeouts.
- [x] Build, lint, typecheck, and full suite pass on the merged fix: 23 files / 314 tests.
- [x] Independent review found and Codex fixed optional enrichment timeouts masking primary movie HTTP 404; both credits and watch-provider races are covered.
