(function (global) {
  function getAllSubjects(curriculum) {
    return (curriculum?.periods || []).flatMap((period) => period.subjects || []);
  }

  function getNumericGrade(progressEntry) {
    if (!progressEntry || progressEntry.grade === null || progressEntry.grade === undefined || progressEntry.grade === '') return null;
    const grade = Number.parseFloat(progressEntry.grade);
    return Number.isFinite(grade) ? grade : null;
  }

  function calculateAcademicSummary(curriculum, progress, { getGradePoints = () => 0, getGradeLabel = () => null } = {}) {
    let total = 0;
    let completed = 0;
    let earned = 0;
    let weightedSum = 0;
    let weightedPoints = 0;
    let weightBase = 0;

    getAllSubjects(curriculum).forEach((subject) => {
      total++;
      const entry = progress?.[subject.id];
      const credits = Number(subject.credits) || 0;

      if (entry?.status === 'approved') {
        completed++;
        earned += credits;
      }

      const grade = getNumericGrade(entry);
      if (grade !== null) {
        weightedSum += grade * credits;
        weightedPoints += getGradePoints(grade) * credits;
        weightBase += credits;
      }
    });

    const hasGrades = weightBase > 0;
    const globalAvg = hasGrades ? weightedSum / weightBase : null;
    const globalGPA = hasGrades ? weightedPoints / weightBase : null;
    const progressPercent = total > 0 ? (completed / total) * 100 : 0;

    return {
      total,
      completed,
      earned,
      remaining: total - completed,
      progress: progressPercent,
      hasGrades,
      globalAvg,
      globalGPA,
      letter: hasGrades ? getGradeLabel(globalAvg) : null
    };
  }

  function calculatePeriodStats(period, progress) {
    const subjects = period?.subjects || [];
    const completed = subjects.filter((subject) => progress?.[subject.id]?.status === 'approved').length;
    return {
      completed,
      completionPercentage: subjects.length > 0 ? (completed / subjects.length) * 100 : 0,
      avgGrade: 0
    };
  }

  function calculatePeriodAverage(period, progress) {
    let sum = 0;
    let credits = 0;

    (period?.subjects || []).forEach((subject) => {
      const grade = getNumericGrade(progress?.[subject.id]);
      const subjectCredits = Number(subject.credits) || 0;
      if (grade !== null) {
        sum += grade * subjectCredits;
        credits += subjectCredits;
      }
    });

    return credits > 0 ? (sum / credits).toFixed(1) : null;
  }

  function calculatePeriodGPA4(period, progress, getGradePoints = () => 0) {
    let points = 0;
    let credits = 0;

    (period?.subjects || []).forEach((subject) => {
      const grade = getNumericGrade(progress?.[subject.id]);
      const subjectCredits = Number(subject.credits) || 0;
      if (grade !== null) {
        points += getGradePoints(grade) * subjectCredits;
        credits += subjectCredits;
      }
    });

    return credits > 0 ? (points / credits).toFixed(2) : null;
  }

  function calculateFilterCounts(curriculum, progress) {
    const counts = { all: 0, enrolled: 0, completed: 0, pending: 0 };
    getAllSubjects(curriculum).forEach((subject) => {
      counts.all++;
      const status = progress?.[subject.id]?.status || 'pending';
      if (status === 'enrolled') counts.enrolled++;
      else if (status === 'approved') counts.completed++;
      else counts.pending++;
    });
    return counts;
  }

  global.StudyTrackAcademics = {
    calculateAcademicSummary,
    calculateFilterCounts,
    calculatePeriodAverage,
    calculatePeriodGPA4,
    calculatePeriodStats,
    getNumericGrade
  };
})(typeof window !== 'undefined' ? window : globalThis);
