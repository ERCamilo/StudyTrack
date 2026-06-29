# Design: Career Control Center

## Technical Approach

Keep this repository as the lightweight static StudyTrack PWA: it continues loading approved catalog JSON from raw GitHub, jsDelivr, then `./library`, and only adds report entry points. The Control Center is a separate TypeScript/Next.js project backed by PostgreSQL. It owns ingestion requests, report intake, maintainer review, deterministic schema validation, source snapshots, publication jobs, and audit history. n8n/OCR/AI workers may extract candidates from submitted sources, but the Control Center remains the authority for validation, review, approval, and publication.

## Architecture Decisions

| Area | Decision | Rationale / Tradeoff |
|------|----------|----------------------|
| System boundary | Build Control Center outside this static PWA. | Avoids turning `src/app.js` into an admin backend; StudyTrack stays offline-friendly and catalog-read-only. Tradeoff: cross-repo coordination is required. |
| First stack | TypeScript + Next.js, PostgreSQL, Prisma or Drizzle, Zod + JSON Schema. | Gives typed UI/API slices quickly, durable workflow state, and shared validation contracts. NestJS is deferred until backend complexity justifies it. |
| Publication authority | Human-approved publication jobs only. | Prevents automation from publishing bad curricula; OCR/AI/n8n can only propose drafts. |
| Ingestion initiation | Control Center creates ingestion requests and dispatches extraction jobs to n8n. | Gives admins/users an on-demand path for new careers while keeping n8n stateless and candidate-only. |
| Validation | Deterministic validators produce normalized errors before review or publication. | Existing `src/curriculum.js` only validates minimal StudyTrack shape; Control Center needs richer catalog/report schemas while StudyTrack may reuse a small client-safe subset. |
| Permissions | Provider-agnostic RBAC gates approval and publication actions. | Roles can map to any auth provider later, but denied attempts must still create audit evidence. |

## Data Flow

```text
StudyTrack PWA
  ├─ loads catalog: raw GitHub -> jsDelivr -> ./library
  └─ report issue(career/version/period/subject/source)
        ↓ HTTPS
Control Center report API
        ↓ validate + persist
Report -> ReviewTask -> CareerVersion/SourceSnapshot
        ↓ maintainer decision + audit event
PublicationJob(approved)
        ↓ deterministic validation + stale snapshot check
GitHub catalog repo: index.json + data/... JSON
        ↓ existing CDN/raw/local fallback consumption
StudyTrack PWA
```

```text
Control Center ingestion form(URL + institution + career metadata)
        ↓ persist IngestionRequest(requested)
        ↓ dispatch extraction job
n8n workflow(fetch/OCR/AI as needed)
        ↓ candidate or extraction error
Control Center candidate intake
        ↓ validate + store ExtractedCandidate/errors
Candidate review inbox
        ↓ human approve/reject + audit
PublicationJob(approved by human only)
        ↓ GitHub PR/versioned catalog artifact
```

Report errors from StudyTrack should preserve user-provided text even when the subject is unknown. StudyTrack shows field validation errors locally when possible, and server validation errors from the Control Center when submitted data is incomplete or inconsistent.

Report lifecycle states are `new`, `under_review`, `resolved`, and `closed`. Users can view the current state for their submitted report; maintainers can view current state, prior state history, linked tasks, and closing/resolution notes.

## File Changes

| File / Project | Action | Description |
|----------------|--------|-------------|
| `src/app.js` | Modify later | Add report buttons/forms near loaded career/subject context; preserve current selector and fallback loading behavior. |
| `src/curriculum.js` | Modify later | Add or expose client-safe helpers for report context validation without replacing Control Center schemas. |
| `tests/logic.mjs` | Modify later | Add unit tests for validation/report payload construction. |
| `tests/smoke.mjs` | Modify later | Assert report entry points are wired and CSP-safe through existing delegated actions. |
| Separate Control Center repo/project | Create later | Next.js app/API, DB schema, review UI, publication worker/integration. |

## Interfaces / Contracts

Report intake contract:

```ts
type CurriculumReport = {
  careerId: string;
  careerVersion: string;
  period: string | number;
  subject: { subjectId: string; subjectText?: string } | { subjectId?: never; subjectText: string };
  issueType: 'missing_subject' | 'extra_subject' | 'prerequisite' | 'credits' | 'code' | 'name' | 'outdated_source' | 'other';
  description: string;
  sourceReference: string;
};
```

The `subject` union enforces a required subject reference while preserving unknown-subject reports as user-provided text.

Design-level DB entities: `Career`, `CareerVersion`, `CurriculumReport`, `ReviewTask`, `SourceSnapshot`, `PublicationJob`, `CatalogArtifact`, `AuditEvent`, and provider-agnostic `Role`/permission assignments. Publication jobs reference a career version and source snapshot; successful jobs produce versioned artifacts and update GitHub catalog JSON (`index.json` plus `data/...`). Approval/publication checks must deny unauthorized actors and create `AuditEvent { actor, action, timestamp, reason }` for denied attempts as well as successful decisions.

Ingestion request contract:

```ts
type IngestionRequest = {
  id: string;
  sourceUrl: string;
  institution: string;
  careerName: string;
  degreeType: 'technical' | 'professional' | 'bachelor' | 'master' | 'doctorate' | 'other';
  expectedPeriods: number;
  sourceType: 'official_page' | 'pdf' | 'spreadsheet' | 'image' | 'user_submitted' | 'other';
  notes?: string;
  status: 'requested' | 'extracting' | 'candidate_ready' | 'validation_failed' | 'needs_review' | 'approved' | 'published' | 'rejected';
};

type ExtractedCandidate = {
  requestId: string;
  sourceSnapshotId: string;
  extractedCatalogJson: unknown;
  validationErrors: Array<{ path: string; message: string; severity: 'error' | 'warning' }>;
  extractionMethod: 'n8n' | 'ocr' | 'ai' | 'manual';
  confidence?: number;
};
```

n8n receives only `sourceUrl` plus request metadata and returns either `ExtractedCandidate` data or an extraction failure. It does not receive publication credentials and cannot create approved `PublicationJob` records.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit | Required report/request fields, candidate validation, lifecycle transitions, RBAC denial audit, catalog schema validation, stale snapshot rejection. | Strict TDD: write failing validation/reporting tests before implementation. |
| Integration | Ingestion request dispatch, n8n candidate intake/failure, report API persistence, user/maintainer lifecycle visibility, review tasks, approval gate. | Control Center API tests with PostgreSQL test database and mocked n8n webhook. |
| Smoke | StudyTrack report entry point wiring and fallback catalog loading remains intact. | Extend `tests/smoke.mjs` using current static assertions and delegated action checks. |

## Migration / Rollout

No StudyTrack data migration required. Roll out in phases: create Control Center schemas/validators, enable report intake from StudyTrack behind a visible entry point, run maintainer review workflow, then enable approved publication to the GitHub catalog repo. Rollback disables report entry points and publication jobs; StudyTrack keeps consuming the last approved catalog.

## Open Questions

- [ ] Where will the separate Control Center repository live and how will deployment secrets be managed?
- [ ] Which GitHub publication mechanism is preferred: PR creation, direct protected-branch workflow dispatch, or release artifact sync?
- [ ] What authentication provider and maintainer roles are required for approval permissions?
