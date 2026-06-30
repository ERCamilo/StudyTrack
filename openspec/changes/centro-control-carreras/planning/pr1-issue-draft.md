# Issue Draft: Validate StudyTrack catalog compatibility

## Summary

Add deterministic validation for the existing StudyTrack curriculum catalog so current `library/` data remains compatible while the future Control Center introduces a stricter versioned catalog format.

## Problem

StudyTrack currently consumes curriculum JSON from the public catalog and local `library/` fallback, but validation only checks the minimal legacy shape. Before building the Control Center and n8n ingestion pipeline, we need a safe compatibility layer that proves existing careers still load and that new metadata can be introduced additively.

## Scope

- Validate every `library/index.json` entry points to an existing curriculum JSON file.
- Keep legacy curriculum JSON compatible.
- Accept additive `schema_version` and `metadata.source` fields.
- Reject invalid versioned curricula with:
  - duplicate subject IDs;
  - invalid credits;
  - empty periods;
  - invalid source metadata;
  - broken ID-like prerequisites, including nested alternative prerequisite groups.

## Acceptance Criteria

- [ ] Existing local catalog entries validate successfully.
- [ ] Legacy curriculum format remains valid.
- [ ] New versioned metadata format validates successfully.
- [ ] Invalid catalog cases are rejected with actionable errors.
- [ ] Full existing Node test suite passes.

## Verification

- `node tests\logic.mjs`
- `node tests\smoke.mjs`
- `node tests\firebase-sync.mjs`
- `node tests\nfc.mjs`
- `node tests\qr-share.mjs`

## Labels Needed

- `status:approved`
- `type:feature`
