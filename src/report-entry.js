(function (global) {
  'use strict';

  const ISSUE_TYPES = ['missing_subject', 'extra_subject', 'prerequisite', 'credits', 'code', 'name', 'outdated_source', 'other'];

  function nonEmpty(value) { return String(value || '').trim(); }
  function catalogIdentity(curriculum) {
    const metadata = curriculum?.metadata || {};
    return {
      careerId: nonEmpty(metadata.id || metadata.catalog_id || metadata.career_id || metadata.career_name || 'local-curriculum'),
      careerVersion: nonEmpty(metadata.version || metadata.catalog_version || 'local'),
      institution: nonEmpty(metadata.institution),
      careerName: nonEmpty(metadata.career_name)
    };
  }

  function buildCurriculumReportPayload({ curriculum, subject, period, issueType = 'other', description, sourceReference, reporterEmail, evidenceUrl }) {
    const identity = catalogIdentity(curriculum);
    const type = ISSUE_TYPES.includes(issueType) ? issueType : 'other';
    const subjectId = nonEmpty(subject?.id || subject?.code);
    const subjectText = nonEmpty(subject?.name || subject?.code || subjectId || 'Unknown subject');
    const payload = {
      careerId: identity.careerId,
      careerVersion: identity.careerVersion,
      period: period?.period_number || period?.number || period?.name || 'unknown',
      subject: subjectId ? { subjectId, subjectText } : { subjectText },
      issueType: type,
      description: nonEmpty(description) || `User reported a ${type} issue for ${subjectText}.`,
      sourceReference: nonEmpty(sourceReference) || 'StudyTrack in-app report entry point',
      status: 'new'
    };
    if (reporterEmail) payload.reporterEmail = nonEmpty(reporterEmail);
    if (evidenceUrl) payload.evidenceUrl = nonEmpty(evidenceUrl);
    return payload;
  }

  function createReportDraft({ curriculum, subject, period, issueType, reporterEmail, evidenceUrl }) {
    const payload = buildCurriculumReportPayload({ curriculum, subject, period, issueType, reporterEmail, evidenceUrl });
    return {
      target: 'StudyTrack-ControlCenter.CreateCurriculumReportInput',
      createdAt: new Date().toISOString(),
      payload
    };
  }

  global.StudyTrackReportEntry = { ISSUE_TYPES, buildCurriculumReportPayload, createReportDraft };
})(typeof globalThis !== 'undefined' ? globalThis : window);
