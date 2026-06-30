# curriculum-reporting Specification

## Purpose

Enable StudyTrack users to submit structured curriculum issues that can be reviewed by maintainers and traced to a specific career, version, period, and source state.

## Requirements

### Requirement: Structured report submission
The system MUST allow a user to submit a curriculum report with career, version, period, subject, issue type, description, and source reference fields.

#### Scenario: Submit a complete report
- GIVEN a user has a valid curriculum issue to report
- WHEN the user submits the required fields
- THEN the system SHALL store the report as a new record
- AND the report SHALL be linked to the referenced career and version

#### Scenario: Reject incomplete report
- GIVEN a user omits a required field
- WHEN the user submits the report
- THEN the system MUST reject the submission
- AND the user SHALL receive a validation error for the missing field

### Requirement: Report traceability
The system MUST preserve the original report content and source reference so reviewers can verify what the user observed.

#### Scenario: Preserve submitted details
- GIVEN a report was accepted
- WHEN a reviewer opens the report later
- THEN the system SHALL show the original issue description and source reference

#### Scenario: Handle unknown subject
- GIVEN the user reports a subject that does not match the current catalog
- WHEN the report is submitted
- THEN the system MUST store the report without losing the user-provided subject text
- AND the report SHALL be marked for review

### Requirement: Report lifecycle visibility
The system SHOULD expose report states that let users and maintainers see whether a report is new, under review, resolved, or closed.

#### Scenario: View current state
- GIVEN a report exists
- WHEN a user inspects it
- THEN the system SHALL show its current lifecycle state

#### Scenario: Resolve a report
- GIVEN a reviewer marks a report as resolved
- WHEN the state changes
- THEN the system MUST preserve the prior state history
