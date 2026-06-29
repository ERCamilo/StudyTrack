# PR Draft: feat(curriculum): validate catalog compatibility

Closes #<approved-issue-number>

## Type

- [x] New feature

## Summary

- Adds additive catalog/curriculum validation for current and future StudyTrack catalog formats.
- Validates all local `library/index.json` entries against their referenced curriculum files.
- Preserves legacy catalog compatibility while rejecting stricter invalid cases for versioned curricula.

## Changes

| File | Change |
|------|--------|
| `src/curriculum.js` | Adds helper validation for catalog entries, source metadata, duplicate subject IDs, invalid credits, empty periods, and versioned prerequisite references. |
| `tests/logic.mjs` | Adds catalog compatibility tests, additive metadata tests, invalid catalog tests, and nested alternative prerequisite regression coverage. |

## Test Plan

- [x] `node tests\logic.mjs`
- [x] `node tests\smoke.mjs`
- [x] `node tests\firebase-sync.mjs`
- [x] `node tests\nfc.mjs`
- [x] `node tests\qr-share.mjs`

## Chain Context

This is PR 1 in the `centro-control-carreras` stacked-to-main plan.

```text
📍 PR 1: existing catalog compatibility + validators
   PR 2: Control Center schema + database foundation
   PR 3: CC ingestion request + n8n candidate intake
   PR 4: report intake + review lifecycle
   PR 5: approval + publication gate
   PR 6: StudyTrack report entry points
```

## Out of Scope

- No Control Center app.
- No backend service.
- No PostgreSQL/Prisma/Drizzle schema.
- No n8n integration.
- No admin UI.

## Contributor Checklist

- [ ] Linked an approved issue.
- [ ] Added exactly one `type:*` label.
- [x] Conventional commit format.
- [x] Tests passed.
- [x] No `Co-Authored-By` trailers.
