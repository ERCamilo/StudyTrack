(function (global) {
  function normalizeScale(scale) {
    return [...(scale || [])].sort((a, b) => b.min - a.min);
  }

  function getGradeLabel(score, scale) {
    if (score === null || score === '' || Number.isNaN(Number(score))) return null;

    const numericScore = Number(score);
    for (const grade of normalizeScale(scale)) {
      if (numericScore >= grade.min) return grade;
    }

    return { label: 'F', color: 'text-red-500', points: 0 };
  }

  function getGradePoints(score, scale) {
    const label = getGradeLabel(score, scale);
    return label?.points ?? 0;
  }

  global.StudyTrackGrades = {
    getGradeLabel,
    getGradePoints,
    normalizeScale
  };
})(typeof window !== 'undefined' ? window : globalThis);
