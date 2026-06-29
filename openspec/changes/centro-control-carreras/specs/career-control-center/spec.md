# career-control-center Specification

## Purpose

Provide maintainers with a governed workspace to request career ingestion, review extracted candidates and curriculum reports, inspect career versions, track editorial status, and record audit events.

## Requirements

### Requirement: Career lifecycle tracking
The system MUST track each career’s editorial state, including added, in verification, user-submitted, updated, failed, and published.

#### Scenario: Inspect career state
- GIVEN a career exists in the control center
- WHEN a maintainer opens its record
- THEN the system SHALL show the current editorial state
- AND the system SHALL show the latest known version

#### Scenario: Transition state
- GIVEN a career is under review
- WHEN a maintainer updates its state
- THEN the system MUST record the new state
- AND the prior state SHALL remain in audit history

### Requirement: Review task management
The system MUST allow maintainers to create, assign, and close review tasks for curriculum reports.

#### Scenario: Create a review task
- GIVEN a report has been submitted
- WHEN a maintainer creates a task from that report
- THEN the system SHALL link the task to the report
- AND the task SHALL start in an open state

#### Scenario: Close a task with outcome
- GIVEN an open review task exists
- WHEN a maintainer closes the task
- THEN the system MUST record the outcome and closing note

### Requirement: Ingestion request creation
The system MUST allow an admin or authorized user to create a career ingestion request with source URL, institution, career name, degree type, expected periods/semesters, source type, and notes.

#### Scenario: Create a complete ingestion request
- GIVEN an authorized actor has a career source URL and required metadata
- WHEN the actor submits the ingestion request
- THEN the system SHALL store the request in `requested` state
- AND the request SHALL retain the submitted source URL and metadata

#### Scenario: Reject incomplete ingestion request
- GIVEN an actor omits source URL or required metadata
- WHEN the actor submits the ingestion request
- THEN the system MUST reject the request
- AND the system SHALL show field-level validation errors

### Requirement: Extraction job dispatch
The system MUST send accepted ingestion requests to n8n as extraction jobs and track dispatch status.

#### Scenario: Dispatch extraction job
- GIVEN an ingestion request is accepted
- WHEN the Control Center dispatches extraction
- THEN the system SHALL send source URL and metadata to n8n
- AND the request SHALL move to `extracting`

#### Scenario: Dispatch failure
- GIVEN n8n cannot accept the extraction job
- WHEN dispatch fails
- THEN the system MUST store the failure reason
- AND the request SHALL remain reviewable by maintainers

### Requirement: Extracted candidate intake
The system MUST receive extracted candidates from n8n, validate them, store validation results, and present candidates for human review.

#### Scenario: Receive valid candidate
- GIVEN n8n returns an extracted candidate for a known request
- WHEN the Control Center receives the candidate
- THEN the system SHALL store the candidate linked to the request
- AND the system SHALL mark it `candidate_ready`

#### Scenario: Candidate has validation errors
- GIVEN n8n returns an incomplete or inconsistent candidate
- WHEN the Control Center validates it
- THEN the system MUST store validation errors with the candidate
- AND the system SHALL mark it `validation_failed`

### Requirement: Automation worker boundary
The system MUST treat n8n, OCR, and AI outputs as candidates only; automated workers MUST NOT approve or publish catalog data.

#### Scenario: n8n returns candidate only
- GIVEN n8n completes an extraction
- WHEN it sends results to the Control Center
- THEN the system SHALL accept only candidate data or extraction errors
- AND no publication job SHALL be approved by n8n output alone

### Requirement: Auditability
The system MUST record audit events for ingestion requests, candidate intake, report review, career state changes, source snapshot inspection, and publication decisions.

#### Scenario: Record an audit event
- GIVEN a maintainer inspects or changes a governed record
- WHEN the action completes
- THEN the system SHALL store an audit event with actor, action, and timestamp

#### Scenario: Preserve denied action
- GIVEN a maintainer lacks permission to approve publication
- WHEN the maintainer attempts the action
- THEN the system MUST deny the action
- AND the system SHALL record the denied attempt in audit history
