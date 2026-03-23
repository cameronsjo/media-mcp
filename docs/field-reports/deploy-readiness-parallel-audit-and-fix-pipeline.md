# Deploy Readiness — Parallel Audit and Fix Pipeline — Field Report

**Date:** 2026-03-22
**Type:** pipeline
**Project:** media-metadata-mcp

## Goal

Take media-metadata-mcp from "working code with no production infrastructure" to "ready to deploy on Unraid" in a single session. This meant adding deploy artifacts (Dockerfile enhancements, docker-compose, CI/CD), auditing the application code for deployment-blocking issues, and fixing everything found — all without breaking the existing 90-test suite.

## Pipeline Overview

The session followed a three-phase pipeline:

**Phase 1: Infrastructure (7 commits)**
Plan-driven. Used `EnterPlanMode` with a Plan subagent to design the approach, then executed sequentially: LICENSE → .env.example → Makefile → docker-compose.yml → Dockerfile OCI labels → Docker workflow (Cosign/SLSA/ARM64) → CI consolidation.

**Phase 2: Audit (3 parallel Explore agents)**
Dispatched three exploration agents simultaneously, each with a distinct scope:
- Agent 1: Error handling, shutdown, security, config validation
- Agent 2: API sources, half-baked features, data quality, type safety
- Agent 3: Test failure diagnosis

**Phase 3: Fix (4 parallel code agents)**
Mapped audit findings to files, grouped by ownership to prevent conflicts, dispatched four agents simultaneously:
- Agent A: `tmdb.ts` — NaN date guards
- Agent B: `sqlite-cache.ts` — corruption recovery
- Agent C: `config.ts` — parseInt validation + dead feature removal
- Agent D: `index.ts` + `http-transport.ts` — graceful shutdown + help text cleanup

Each agent ran `tsc --noEmit` to verify its own work. After all completed, a single `npm test` confirmed 90/90 passing.

**Phase 4: Polish**
Fixed two pre-existing lint errors blocking CI. Addressed CodeRabbit's review feedback (shutdown error handling). Created backlog issues for non-critical findings.

## What Worked

**Subagent file-ownership pattern.** The key insight: map each fix to the files it touches, verify zero overlap between agents, then dispatch in parallel. Four agents editing four different source files simultaneously, all completing within ~60 seconds. No merge conflicts, no coordination needed. The constraint is simple — if two fixes touch the same file, they go to the same agent or run sequentially.

**Audit-first, fix-second.** Running exploration agents before fix agents meant every fix had a clear diagnosis and scope. No ambiguity about what to change or why.

**Cost boundary thinking applied to the audit itself.** The three audit agents were "cheap" (read-only exploration). The four fix agents were "metered" (code changes that need verification). Validating the approach before spending tokens on edits.

**CI as the final gate.** Pushing to the branch and letting GitHub Actions validate everything end-to-end caught two pre-existing lint errors that local `npm test` didn't surface (because tests don't run linting).

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Defer npm→pnpm migration | Not a deploy blocker. Mixing package manager migration with infra work is a recipe for debugging two things at once. |
| Defer ESLint→Biome migration | Same reasoning. Tooling upgrades are a separate session. |
| Static OCI labels in Dockerfile, dynamic via metadata-action | `source`, `description`, `licenses` never change — hardcode them. `version`, `revision`, `created` come from git context at build time via docker/metadata-action. No build args needed. |
| ARM64 only on push/tag, amd64-only on PRs | QEMU ARM64 builds add ~10 min. PR feedback should be fast. Release builds need both architectures. Solved with a ternary in the `platforms` field. |
| `stopTransport` callback over module-level variable | Cleaner scoping. A closure captures the stop function without widening the transport's visibility. CodeRabbit correctly caught that it needed error handling. |
| Remove cover download config entirely | Unimplemented feature with config knobs is worse than no feature. Users enable it and nothing happens. Clean removal over TODO. |

## Gotchas

**better-sqlite3 native module version.** All 33 test failures were from a single cause: the native module was compiled for Node 20 but the system runs Node 24. `npm rebuild better-sqlite3` fixed everything. This is why the Dockerfile uses `npm ci` in a fresh builder stage — it always compiles against the container's Node version. Worth remembering when switching Node versions locally.

**`docker/metadata-action` already generates OCI labels.** Initially designed ARG-based labels in the Dockerfile, then realized the metadata-action's `labels` output (already wired to build-push-action) handles the dynamic ones. The Dockerfile only needs the three static labels. Saved unnecessary complexity.

**ESLint `no-unused-vars` on destructure patterns.** The `const { $schema: _, ...rest }` pattern is idiomatic for removing a property, but ESLint sees `_` as unused. Needs an inline disable comment. This is a known friction point with TypeScript destructuring.

**CodeRabbit reviews trigger on every push.** Each commit push triggered a new review cycle. The first review had 3 actionable comments, the second had 10 (mostly beads metadata suggestions). Only 1 of the 10 was a real code issue (shutdown error handling). Worth batching pushes when possible to reduce review noise.

## Recommendations

1. **Use the file-ownership pattern for any multi-fix session.** Map fixes to files, verify no overlap, dispatch in parallel. It's the highest-leverage pattern for parallel code changes.

2. **Run `npm run lint` locally before pushing.** The CI lint job catches things that `npm test` doesn't. A `make ci` target that runs `lint + typecheck + test` would prevent this.

3. **Rebuild native modules after Node version changes.** Add a note to CONTRIBUTING.md or a postinstall check that warns when `better-sqlite3` is compiled for a different Node ABI version.

4. **Batch commits before pushing to CodeRabbit-watched branches.** Or use `[skip ci]` on intermediate commits and push a final commit that triggers the review.

## Key Takeaways

- **File-ownership is the constraint for parallel code agents.** Zero file overlap = safe parallelism. Any overlap = sequential or same agent. This is the fundamental rule.
- **Audit agents are cheap; fix agents are expensive.** Always audit first (read-only exploration), then fix with full context. Don't guess at fixes.
- **Pre-existing failures mask new ones.** The 33 test failures from the native module rebuild hid whether our changes broke anything. Always get to green before making changes, or at least understand what's already broken.
- **Static labels in Dockerfile, dynamic labels in CI.** Don't over-engineer build args for things the CI toolchain already handles.
- **Shutdown cleanup must be fault-tolerant.** Every step in a shutdown sequence should be wrapped in try-catch so failures don't skip subsequent cleanup. CodeRabbit caught this — it's a real pattern, not pedantry.
