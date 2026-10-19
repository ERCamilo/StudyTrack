(function (global) {
  function normalizeScale(scale) {
    return [...(scale || [])].sort((a, b) => b.min - a.min);
  }

  // Regla de negocio: una nota con coma decimal vale lo mismo que con punto ("85,5" = 85.5).
  // Regla de negocio: si la nota empieza con un número y sigue texto, se toma el número ("70abc" → 70).
  // Regla de negocio: vacío, solo espacios, o texto sin número al inicio significa "sin nota".
  function parseGradeNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (value === null || value === undefined) return null;

    const text = String(value).trim().replace(',', '.');
    const match = text.match(/^[-+]?(\d+(\.\d*)?|\.\d+)/);
    if (!match) return null;

    const grade = Number.parseFloat(match[0]);
    return Number.isFinite(grade) ? grade : null;
  }

  function getGradeLabel(score, scale) {
    // Blank, whitespace-only or non-numeric means "no grade", same rule as parseGradeNumber.
    const numericScore = parseGradeNumber(score);
    if (numericScore === null) return null;

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
    parseGradeNumber,
    getGradeLabel,
    getGradePoints,
    normalizeScale
  };
})(typeof window !== 'undefined' ? window : globalThis);
