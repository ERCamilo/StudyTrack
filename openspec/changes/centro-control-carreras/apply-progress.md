# Apply Progress: Career Control Center

## Work Unit

- Change: `centro-control-carreras`
- Scope: PR 1 / Work Unit 1 — existing catalog compatibility + validators
- Delivery: chained PR slice
- Chain strategy: stacked-to-main
- Target: `main`

## Completed Tasks

- [x] 1.1 Add failing tests in `tests/logic.mjs` that load every `library/index.json` entry and validate each referenced curriculum file.
- [x] 1.2 Extend `src/curriculum.js` with additive catalog validation for `schema_version`, source metadata, duplicate subjects, broken prerequisites, invalid credits, and empty periods.
- [x] 1.3 Add compatibility fixtures/assertions proving existing career JSON still passes with legacy fields while accepting the new metadata format.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `tests/logic.mjs` | Unit | ✅ `node tests/logic.mjs` passed before edits | ✅ Catalog index test failed because `validateCatalogEntry` did not exist | ✅ `node tests/logic.mjs` passed | ✅ Every `library/index.json` entry validates referenced JSON | ✅ Shared validator helpers added |
| 1.2 | `tests/logic.mjs` | Unit | ✅ `node tests/logic.mjs` passed before edits and corrective fix | ✅ Invalid schema/source/duplicate/prerequisite/credits/empty-period assertions failed before implementation; corrective nested-alternative missing prerequisite test failed before fix | ✅ `node tests/logic.mjs` passed | ✅ Valid metadata, legacy metadata, invalid catalog, and nested alternative missing prerequisite cases covered | ✅ Validation helpers simplified so every missing ID-like prerequisite is rejected for versioned curricula |
| 1.3 | `tests/logic.mjs` | Unit | ✅ `node tests/logic.mjs` passed before edits | ✅ Legacy/new metadata compatibility assertions failed until additive validation existed | ✅ `node tests/logic.mjs` passed | ✅ Existing library JSON plus explicit legacy/new-format fixtures covered | ✅ No extra fixture file needed |

## Test Summary

- `node tests/logic.mjs` — passed
- `node tests/smoke.mjs` — passed
- Total test assertions added: catalog index validation, existing curriculum compatibility, new metadata acceptance, legacy acceptance, invalid catalog validation checks, and nested alternative missing prerequisite validation.

## Deviations

- Broken prerequisite validation is enforced for curricula that declare `schema_version`; legacy catalog files remain compatible because some existing JSON includes external/legacy prerequisite references not present as local subjects.
- Corrective fix: versioned curricula now reject every missing ID-like prerequisite reference, including references inside nested alternative groups.

## Remaining Tasks

All later work units remain pending: Control Center schema/database, ingestion/n8n candidate intake, report review lifecycle, approval/publication, and StudyTrack report entry points.
