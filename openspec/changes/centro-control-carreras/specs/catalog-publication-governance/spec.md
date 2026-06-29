# catalog-publication-governance Specification

## Purpose

Ensure catalog JSON is published only after human approval, with versioned artifacts, source snapshots, and auditable outcomes.

## Requirements

### Requirement: Human approval gate
The system MUST require explicit human approval before a catalog JSON publication job can be executed; extracted candidates from n8n, OCR, or AI MUST NOT approve or execute publication.

#### Scenario: Approve publication
- GIVEN a publication job is ready
- WHEN a maintainer approves it
- THEN the system SHALL mark the job as approved
- AND the job SHALL become eligible for execution

#### Scenario: Block unapproved publication
- GIVEN a publication job has no approval
- WHEN the system evaluates it for execution
- THEN the system MUST prevent publication

#### Scenario: Block candidate-only automation
- GIVEN n8n returns an extracted candidate
- WHEN publication eligibility is evaluated
- THEN the system MUST require human approval first
- AND the system SHALL NOT publish directly from the n8n result

### Requirement: Versioned publication artifacts
The system MUST publish catalog JSON as versioned artifacts tied to the approved source snapshot and career version.

#### Scenario: Publish approved JSON
- GIVEN an approved job references a valid source snapshot
- WHEN publication succeeds
- THEN the system SHALL create a versioned catalog artifact
- AND the artifact SHALL reference the approved snapshot

#### Scenario: Reject stale snapshot
- GIVEN the source snapshot no longer matches the approved job
- WHEN publication is attempted
- THEN the system MUST reject the job
- AND the system SHALL report the mismatch

### Requirement: Publication audit trail
The system MUST record publication job status, approval actor, execution outcome, and failure reasons.

#### Scenario: Record success
- GIVEN a publication job completes successfully
- WHEN the job finishes
- THEN the system SHALL store the final status and version identifier

#### Scenario: Record failure
- GIVEN a publication job fails
- WHEN the system records the result
- THEN the system MUST store the failure reason
- AND the job SHALL remain auditable after failure
