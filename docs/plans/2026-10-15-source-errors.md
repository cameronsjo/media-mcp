# Source error normalization (#13)

Cameron approved this issue in cos-media2/go.md. Codex owns implementation and delivery on cos/13-source-errors.

- [x] Add typed errors and normalize against the existing ErrorCodeSchema.
- [x] Normalize source exception diagnostics without changing optional-provider null/partial-result fallbacks.
- [x] Use the common application error format at the single-tool and batch boundaries; retain SDK JSON-RPC envelopes.
- [x] Add regression coverage for typed, legacy, validation, network, and arbitrary thrown values; document public fields.
- [x] Complete independent review and resolve supported findings, including typed TMDB propagation, retry delays, safe normalization, and structured diagnostics.
- [x] Complete final build, lint, typecheck, formatting, and full-suite verification: 22 files / 284 tests pass with two workers.

Do not change authentication, CORS, credentials, workflow policy, or deployments. Unexpected codes map to existing SOURCE_ERROR rather than expand the public enum. Optional book-source exceptions remain best-effort and partial-success behavior remains intact. Primary TMDB failures retain typed codes rather than becoming non-retryable no-match errors. Delivery state is recorded in the chief-of-staff report.
