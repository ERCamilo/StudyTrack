(function (global) {
  function createDefaultSubjectProgress() {
    return { status: 'pending', grade: null, attempts: [], completionDate: null };
  }

  function parseGradeInput(value) {
    if (value === null || value === undefined || value === '') return null;

    const grade = Number.parseInt(value, 10);
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

  global.StudyTrackProgress = {
    applyGradeToSubjectProgress,
    createDefaultSubjectProgress,
    parseGradeInput
  };
})(typeof window !== 'undefined' ? window : globalThis);
