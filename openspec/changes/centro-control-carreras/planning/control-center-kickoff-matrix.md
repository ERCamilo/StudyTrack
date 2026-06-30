# Control Center Kickoff Matrix

This matrix is the planning artifact for starting the StudyTrack Control Center. It prioritizes the first usable path: validate existing curriculum data, create ingestion requests from the Control Center, send extraction jobs to n8n, review candidates, and publish only approved catalog data.

## Legend

| Symbol | Meaning |
| --- | --- |
| ⭐⭐⭐⭐⭐ | Critical importance |
| ⭐⭐⭐⭐ | High importance |
| ⭐⭐⭐ | Medium importance |
| 🔴 | Urgent / do first |
| 🟠 | High priority |
| 🟡 | Medium priority |
| 🟢 | Later |
| C/B 🟢 | Strong cost-benefit |
| C/B 🟡 | Good but moderate cost |
| C/B 🔴 | High cost or risky early |

## Planning Matrix

| Point to address | Importance | Priority | Cost/Benefit | Difficulty | Depends on | Description |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Canonical curriculum schema | ⭐⭐⭐⭐⭐ | 🔴 | 🟢 | 🟡 | — | Define the new compatible curriculum format without breaking current StudyTrack JSON consumption. |
| Existing data compatibility pass | ⭐⭐⭐⭐⭐ | 🔴 | 🟢 | 🟡 | Schema | Use current `library/` and remote catalog data as fixtures to validate and migrate additively. |
| Validation test suite | ⭐⭐⭐⭐⭐ | 🔴 | 🟢 | 🟡 | Schema, fixtures | Add RED tests for valid existing careers, missing fields, broken prerequisites, duplicate subjects, bad credits, and source metadata. |
| Control Center project boundary | ⭐⭐⭐⭐⭐ | 🔴 | 🟢 | 🟢 | — | Keep CC as a separate TypeScript project/repository; StudyTrack remains the student-facing PWA. |
| PostgreSQL editorial model | ⭐⭐⭐⭐⭐ | 🔴 | 🟢 | 🟡 | Schema | Model careers, versions, reports, ingestion requests, source snapshots, candidates, review tasks, publication jobs, and audit events. |
| Ingestion request form | ⭐⭐⭐⭐⭐ | 🔴 | 🟢 | 🟡 | CC base, DB | Let an admin/user request a new career by entering URL plus institution, career name, degree type, expected periods/semesters, source type, and notes. |
| n8n on-demand extraction webhook | ⭐⭐⭐⭐ | 🟠 | 🟢 | 🟡 | Ingestion request | CC sends source URL and metadata to n8n; n8n returns an extracted candidate, not a published career. |
| n8n scheduled update workflow | ⭐⭐⭐ | 🟡 | 🟡 | 🟡 | Candidate review | Cron checks known sources for changes after the manual request path works. |
| Candidate review inbox | ⭐⭐⭐⭐⭐ | 🔴 | 🟢 | 🟡 | Candidate model | Show extracted candidates, validation errors, source evidence, and required reviewer actions. |
| Human approval gate | ⭐⭐⭐⭐⭐ | 🔴 | 🟢 | 🟡 | Review inbox, RBAC | No extracted or user-submitted candidate can publish without explicit approval and audit. |
| Publication to catalog repo | ⭐⭐⭐⭐ | 🟠 | 🟢 | 🟡 | Approval, validation | Generate versioned JSON and open a GitHub PR to `LIBRERIA_DE_CARRERAS` or the chosen catalog repo. |
| StudyTrack report entry points | ⭐⭐⭐⭐ | 🟡 | 🟢 | 🟡 | Report API | Add lightweight “report error” UI in StudyTrack after CC can receive and triage reports. |
| Existing career replacement plan | ⭐⭐⭐⭐⭐ | 🟠 | 🟢 | 🔴 | Versioning, validation | Replace old catalog format gradually using additive metadata and versioned outputs, never destructive rewrites. |
| User-submitted corrections | ⭐⭐⭐⭐ | 🟡 | 🟡 | 🟡 | Report API, review workflow | Users can report wrong name, code, credits, period, prerequisites, missing/extra subjects, or outdated source. |
| OCR/AI extraction | ⭐⭐⭐ | 🟡 | 🟡 | 🔴 | Schema, n8n candidate flow | Use only for PDFs/images/messy pages. AI creates candidates; validators and humans decide. |
| Quality dashboard | ⭐⭐⭐ | 🟢 | 🟡 | 🟡 | Reports, candidates, publication | Track stale careers, open reports, failed extractions, confidence, and universities with unstable sources. |
| Migration UX for students | ⭐⭐⭐⭐ | 🟢 | 🟡 | 🔴 | Versioned catalogs | Later: help users move from an old career version to a newer one without losing progress. |

## Suggested Order

1. **Schema and fixtures first**: use current careers as test fixtures so the new format proves backward compatibility.
2. **Create CC foundation**: TypeScript + Next.js + PostgreSQL + Prisma/Drizzle + Zod/JSON Schema.
3. **Add ingestion requests**: CC creates a request and sends the URL/metadata to n8n on demand.
4. **Review extracted candidates**: CC validates, shows errors, lets humans approve/reject.
5. **Publish through GitHub PRs**: approved candidates become versioned JSON in the catalog repo.
6. **Add StudyTrack report UI**: only after CC can receive, triage, and audit reports.
7. **Add scheduled n8n checks**: cron workflows monitor known sources after the manual path is reliable.
8. **Add OCR/AI**: only for sources that cannot be parsed deterministically.

## Technology Suggestions

| Area | Recommendation | Why |
| --- | --- | --- |
| Control Center | TypeScript + Next.js | Fast typed admin UI and API in one project for the first slice. |
| Database | PostgreSQL | Relational integrity for versions, reports, reviews, audits, candidates, and jobs. |
| ORM | Prisma first, Drizzle if SQL control becomes more important | Prisma is faster to bootstrap; Drizzle is better when the team wants SQL-first control. |
| Validation | Zod + JSON Schema | Zod for app/API runtime validation; JSON Schema for portable catalog validation and CI. |
| Automation | n8n | Excellent for HTTP fetch, scheduled checks, webhooks, OCR/AI orchestration, and Telegram alerts. |
| Publication | GitHub PRs | Gives review, diff, rollback, and audit trail for catalog JSON changes. |

## UX/UI Considerations

- Use a wizard for new career requests: source URL → basic metadata → extraction status/errors → candidate review.
- Show validation errors next to the exact period/subject/source field.
- Let reviewers compare extracted candidate vs current catalog version.
- Never show raw JSON as the primary editing UI; keep JSON as an advanced/debug view.
- Use clear statuses: `requested`, `extracting`, `candidate_ready`, `validation_failed`, `needs_review`, `approved`, `published`, `rejected`.
- Provide reviewer confidence cues: source type, extraction method, missing data, OCR/AI confidence, and user demand count.

## Similar Systems to Learn From

- **GitHub Pull Requests**: diff, review, approval, rollback.
- **Wikipedia / OpenStreetMap**: community corrections with history and moderation.
- **CMS editorial workflows**: draft, review, publish, archive.
- **Issue trackers**: report triage, assignment, lifecycle, resolution notes.

## Points Not Yet Fully Covered

- **Duplicate careers**: the same career may appear under slightly different names.
- **Multiple active plans**: one university can have old and new pensums active at the same time.
- **Source trust levels**: official university page should rank higher than user screenshots.
- **Prompt injection risk**: OCR/AI/n8n input from external pages must be treated as untrusted.
- **Broken university pages**: failed extraction should create a reviewable failure, not silently disappear.
- **User demand signal**: requested careers should track how many users asked for them.
- **Catalog rollback**: publication must support reverting a bad version quickly.
- **Progress impact**: replacing a career version can affect student progress mapping.
- **Moderation**: user-provided URLs/files can be spam, malicious, or low quality.

## Recommended Decision

Start with a **Control Center initiated ingestion flow**:

```text
CC request form
→ n8n extraction job
→ candidate returned to CC
→ schema validation
→ human review
→ GitHub PR publication
→ StudyTrack consumes approved JSON
```

This avoids depending only on cron workflows and lets motivated users/admins request careers directly, while preserving CC as the editorial authority.
