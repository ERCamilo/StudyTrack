# Proposal: Career Control Center

## Intent

Create governed curriculum catalog quality. StudyTrack consumes published JSON from `ERCamilo/LIBRERIA_DE_CARRERAS` through raw GitHub, jsDelivr, and local `./library` fallbacks, but corrections, source review, and publication are not auditable.

## Scope

### In Scope
- Structured StudyTrack reports scoped to career, version, period, subject, prerequisites, credits, codes, names, missing/extra subjects, and outdated sources.
- Control Center-initiated career ingestion requests where an admin/user submits a source URL plus basic metadata for n8n extraction.
- Separate typed control center/backend for reports, review tasks, career statuses, versions, audit events, source snapshots, and publication jobs.
- Human approval gate before any catalog JSON is published.

### Out of Scope
- Autonomous scraper, OCR, n8n, or AI ingestion that bypasses Control Center review.
- Automatic publishing from AI/OCR/n8n candidates.
- Full visual curriculum editor or complex plan migration UX.

## Capabilities

### New Capabilities
- `curriculum-reporting`: StudyTrack users submit structured curriculum issues.
- `career-control-center`: Maintainers review reports, track lifecycle states, inspect versions, and approve publication jobs.
- `career-ingestion-requests`: Control Center starts source URL + metadata extraction jobs and receives validated candidates for human review.
- `catalog-publication-governance`: Approved changes produce auditable, versioned catalog JSON.

### Modified Capabilities
- None; `openspec/specs/` does not exist, so these contracts are new.

## Approach

Keep StudyTrack lightweight: submit reports and consume approved JSON. Introduce a separate TypeScript control center with PostgreSQL for editorial state. CC creates ingestion requests, sends source URL/metadata to n8n, receives extracted candidates/errors, validates and stores them, then routes them through human review. Deterministic validation plus approval remains authoritative; OCR/AI/n8n helpers create candidates only and never publish directly.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/app.js` | Modified | Add report entry points; preserve catalog fallbacks. |
| `src/curriculum.js` | Modified | Reuse/extend validation for issues and publication checks. |
| `library/` | Modified | Remains local fallback for approved JSON. |
| `tests/` | Modified | Cover reporting, validation, publication boundaries. |
| `apps/control-center/` | New | Proposed admin UI workspace/package. |
| `services/catalog-admin/` | New | Proposed TypeScript API/backend using PostgreSQL. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Overbuilding tooling | Medium | First slice is reports, review workflow, controlled publication. |
| Bad data reaches students | Medium | Require deterministic validation and human approval. |
| Catalog/admin drift | Medium | Store snapshots, audits, versions, and jobs together. |
| Automation boundary confusion | Medium | Model n8n as a worker that returns candidates/errors to CC; publication remains CC-owned. |

## Rollback Plan

Disable StudyTrack report entry points, stop publication jobs, and keep consuming the last approved GitHub/local catalog JSON. Revert control-center/backend independently because StudyTrack remains read-only against published artifacts.

## Dependencies

- PostgreSQL.
- n8n webhook/workflow for candidate extraction only.
- GitHub catalog publication process.
- Existing StudyTrack catalog JSON schema and fallback loading.

## Success Criteria

- [ ] Users can submit scoped curriculum error reports.
- [ ] Admins/users can request a new career ingestion from a source URL and metadata; n8n returns only candidates/errors.
- [ ] Reviewers can triage reports and see career states: added, in verification, user-submitted, updated, failed, and published.
- [ ] Publication requires human approval and records version, audit, source snapshot, and job outcome.
- [ ] StudyTrack consumes only approved JSON with current fallbacks.
