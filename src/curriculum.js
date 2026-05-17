(function (global) {
  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function validateCurriculum(curriculum) {
    const errors = [];

    if (!isObject(curriculum)) {
      return { valid: false, errors: ['El pensum debe ser un objeto JSON'] };
    }

    if (!isObject(curriculum.metadata)) {
      errors.push('Falta metadata');
    } else {
      if (!curriculum.metadata.career_name) errors.push('Falta metadata.career_name');
      if (!curriculum.metadata.institution) errors.push('Falta metadata.institution');
    }

    if (!Array.isArray(curriculum.periods) || curriculum.periods.length === 0) {
      errors.push('Falta periods con al menos un periodo');
    } else {
      curriculum.periods.forEach((period, periodIndex) => {
        if (!isObject(period)) {
          errors.push(`Periodo ${periodIndex + 1} no es un objeto`);
          return;
        }

        if (!Array.isArray(period.subjects)) {
          errors.push(`Periodo ${periodIndex + 1} no tiene subjects`);
          return;
        }

        period.subjects.forEach((subject, subjectIndex) => {
          const label = `Periodo ${periodIndex + 1}, materia ${subjectIndex + 1}`;
          if (!isObject(subject)) {
            errors.push(`${label} no es un objeto`);
            return;
          }

          if (!subject.id) errors.push(`${label} no tiene id`);
          if (!subject.name) errors.push(`${label} no tiene name`);
          if (!subject.code) errors.push(`${label} no tiene code`);
          if (!Number.isFinite(Number(subject.credits))) errors.push(`${label} no tiene credits numerico`);
          if (subject.prerequisites !== undefined && !Array.isArray(subject.prerequisites)) {
            errors.push(`${label} tiene prerequisites invalido`);
          }
        });
      });
    }

    return { valid: errors.length === 0, errors };
  }

  global.StudyTrackCurriculum = {
    validateCurriculum
  };
})(typeof window !== 'undefined' ? window : globalThis);
