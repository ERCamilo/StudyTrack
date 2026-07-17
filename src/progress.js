(function (global) {
  function createDefaultSubjectProgress() {
    return { status: 'pending', grade: null, attempts: [], completionDate: null, section: '', classroom: '', teacher: '' };
  }

  const VALID_STATUSES = new Set(['pending', 'enrolled', 'approved']);

  function getCurriculumSubjectIds(curriculum) {
    const ids = new Set();
    (curriculum?.periods || []).forEach((period) => {
      (period.subjects || []).forEach((subject) => {
        if (subject?.id) ids.add(subject.id);
      });
    });
    return ids;
  }

  function parseGradeInput(value) {
    if (value === null || value === undefined || value === '') return null;

    const grade = Number.parseFloat(value);
    return Number.isFinite(grade) ? grade : null;
  }

  function applyGradeToSubjectProgress(currentProgress, value, passingGrade = 70) {
    const nextProgress = { ...createDefaultSubjectProgress(), ...(currentProgress || {}) };
    const grade = parseGradeInput(value);
    nextProgress.grade = grade;

    if (grade === null) return nextProgress;

    if (grade >= passingGrade) {
      nextProgress.status = 'approved';
    } else if (nextProgress.status === 'approved') {
      nextProgress.status = 'pending';
    }

    return nextProgress;
  }

  function toggleSubjectApproval(currentProgress) {
    const nextProgress = { ...createDefaultSubjectProgress(), ...(currentProgress || {}) };
    nextProgress.status = nextProgress.status === 'approved' ? 'pending' : 'approved';
    return nextProgress;
  }

  function getAffectedSubjectIds(subjectId, dependencyGraph) {
    const affected = new Set([subjectId]);
    (dependencyGraph?.dependents?.get(subjectId) || []).forEach((dependentId) => affected.add(dependentId));
    (dependencyGraph?.allPrereqSubjects || []).forEach((allPrereqSubjectId) => affected.add(allPrereqSubjectId));
    return [...affected];
  }

  function normalizeSubjectProgress(progress) {
    const source = progress && typeof progress === 'object' ? progress : {};
    const status = VALID_STATUSES.has(source.status) ? source.status : 'pending';
    const grade = parseGradeInput(source.grade);
    // Preserve real attempt objects when present; only synthesize placeholders when
    // attempts is stored as a plain count (number/string).
    const attempts = Array.isArray(source.attempts)
      ? source.attempts.map((attempt) => (attempt && typeof attempt === 'object' ? attempt : {}))
      : Array(Math.max(0, Number.parseInt(source.attempts, 10) || 0)).fill({});

    return {
      status,
      grade,
      attempts,
      completionDate: typeof source.completionDate === 'string' ? source.completionDate : null,
      section: typeof source.section === 'string' ? source.section : '',
      classroom: typeof source.classroom === 'string' ? source.classroom : '',
      teacher: typeof source.teacher === 'string' ? source.teacher : ''
    };
  }

  // Onboarding's "I already have history" step: the student marks whole periods as
  // completed and picks one average grade per period, instead of grading every
  // subject one by one. periodGrades is { [period_number]: grade }; only periods
  // present there are bulk-approved (a period the student didn't mark done is left
  // untouched). Pure and immutable so it's directly testable without a curriculum
  // JSON fixture beyond the minimal { periods: [{ period_number, subjects }] } shape.
  function applyBulkApprovalForPeriods(curriculum, progress, periodGrades) {
    const next = { ...(progress && typeof progress === 'object' ? progress : {}) };
    const grades = periodGrades && typeof periodGrades === 'object' ? periodGrades : {};

    (curriculum?.periods || []).forEach((period) => {
      const grade = grades[period.period_number];
      if (grade === undefined || grade === null) return;

      (period.subjects || []).forEach((subject) => {
        if (!subject?.id) return;
        next[subject.id] = {
          ...createDefaultSubjectProgress(),
          ...(next[subject.id] || {}),
          status: 'approved',
          grade: Number(grade)
        };
      });
    });

    return next;
  }

  function normalizeUserProgress(progress, curriculum) {
    if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return {};

    const subjectIds = getCurriculumSubjectIds(curriculum);
    const normalized = {};

    Object.entries(progress).forEach(([subjectId, subjectProgress]) => {
      if (!subjectIds.has(subjectId)) return;
      normalized[subjectId] = normalizeSubjectProgress(subjectProgress);
    });

    return normalized;
  }

  global.StudyTrackProgress = {
    applyBulkApprovalForPeriods,
    applyGradeToSubjectProgress,
    createDefaultSubjectProgress,
    getAffectedSubjectIds,
    getCurriculumSubjectIds,
    normalizeSubjectProgress,
    normalizeUserProgress,
    parseGradeInput,
    toggleSubjectApproval
  };
})(typeof window !== 'undefined' ? window : globalThis);
