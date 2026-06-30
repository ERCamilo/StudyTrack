# Tasks: Career Control Center

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 500-700 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 existing catalog compatibility (complete); PR 2 Control Center schema/DB; PR 3 CC ingestion request + n8n candidate intake; PR 4 review/triage; PR 5 approval/publication; PR 6 StudyTrack report entry points |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Existing catalog compatibility + validators | PR 1 | Complete; prove current careers still work before CC replaces formats |
| 2 | Control Center schema + database foundation | PR 2 | Separate TS project slice; deterministic contract first |
| 3 | CC ingestion request + n8n candidate intake | PR 3 | User/admin requests career URL; n8n returns candidate |
| 4 | Report intake + review lifecycle | PR 4 | Intake, states, audit trail, task workflow |
| 5 | Human approval + publication gate | PR 5 | Approved snapshot/versioned artifact checks |
| 6 | StudyTrack entry points + payload tests | PR 6 | Keep PWA lightweight; no admin backend |

## Phase 1: Existing Catalog Compatibility / Validation
- [x] 1.1 Add failing tests in `tests/logic.mjs` that load every `library/index.json` entry and validate each referenced curriculum file.
- [x] 1.2 Extend `src/curriculum.js` with additive catalog validation for `schema_version`, source metadata, duplicate subjects, broken prerequisites, invalid credits, and empty periods.
- [x] 1.3 Add compatibility fixtures/assertions proving existing career JSON still passes with legacy fields while accepting the new metadata format.

## Phase 2: Control Center Foundation
- [ ] 2.1 Add failing tests for report, ingestion request, candidate, and lifecycle schemas in `StudyTrack-ControlCenter/tests/schema.test.ts`.
- [ ] 2.2 Define Zod/JSON Schema models for `CurriculumReport`, `IngestionRequest`, `ExtractedCandidate`, `CareerVersion`, `PublicationJob`, and `AuditEvent`.
- [ ] 2.3 Add migration-ready DB model stubs for careers, reports, ingestion requests, candidates, snapshots, jobs, and audit rows.

## Phase 3: CC Ingestion Request + n8n Candidate Intake (PR 3)
- [ ] 3.1 Add RED API/schema tests for creating ingestion requests with source URL, institution, career name, degree type, expected periods, source type, and notes.
- [ ] 3.2 Implement ingestion request persistence and status transitions: `requested`, `extracting`, `candidate_ready`, `validation_failed`, `rejected`.
- [ ] 3.3 Add n8n dispatch adapter/webhook contract tests; send source URL + metadata only and record dispatch failures.
- [ ] 3.4 Implement candidate intake that stores `ExtractedCandidate`, validation errors, source snapshot link, method, and confidence without publishing.

## Phase 4: Review / Publication
- [ ] 4.1 Implement report intake, career state transitions, review task lifecycle, and denied-action audit writes.
- [ ] 4.2 Add approval-gated publication checks, stale-snapshot rejection, versioned artifact records, and GitHub PR publication wiring.

## Phase 5: Verification / Refactor
- [ ] 5.1 Add StudyTrack report entry points plus client-side payload validation hooks in `src/app.js`, `src/curriculum.js`, `tests/logic.mjs`, and `tests/smoke.mjs`.
- [ ] 5.2 Write integration tests for report persistence, request/candidate lifecycle, n8n failure, approval denial, and publication success/failure against the Control Center test DB.
- [ ] 5.3 Update docs/comments for compatibility, n8n candidate flow, report flow, and rollback boundary.
