(function (global) {
  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function hasText(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function looksLikeSubjectReference(value) {
    return hasText(value) && /^[A-Za-z0-9_-]+$/.test(value);
  }

  function collectPrerequisiteIds(prerequisites) {
    const ids = [];

    if (!Array.isArray(prerequisites)) return ids;

    prerequisites.forEach((item) => {
      if (Array.isArray(item)) {
        item.forEach((nestedItem) => {
          if (hasText(nestedItem) && nestedItem !== 'ALL') ids.push(nestedItem);
        });
      } else if (hasText(item) && item !== 'ALL') {
        ids.push(item);
      }
    });

    return ids;
  }

  function validateSourceMetadata(source, errors) {
    if (source === undefined) return;

    if (!isObject(source)) {
      errors.push('metadata.source debe ser un objeto');
      return;
    }

    if (!hasText(source.name)) errors.push('Falta metadata.source.name');
    if (source.url !== undefined && (!hasText(source.url) || !/^https?:\/\//.test(source.url))) {
      errors.push('metadata.source.url invalido');
    }
    if (source.retrieved_at !== undefined && !hasText(source.retrieved_at)) {
      errors.push('metadata.source.retrieved_at invalido');
    }
  }

  function validateCurriculum(curriculum) {
    const errors = [];
    const subjectIds = new Set();
    const subjectsToValidate = [];

    if (!isObject(curriculum)) {
      return { valid: false, errors: ['El pensum debe ser un objeto JSON'] };
    }

    if (curriculum.schema_version !== undefined && !hasText(curriculum.schema_version)) {
      errors.push('schema_version debe ser texto');
    }

    if (!isObject(curriculum.metadata)) {
      errors.push('Falta metadata');
    } else {
      if (!curriculum.metadata.career_name) errors.push('Falta metadata.career_name');
      if (!curriculum.metadata.institution) errors.push('Falta metadata.institution');
      validateSourceMetadata(curriculum.metadata.source, errors);
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

        if (period.subjects.length === 0) {
          errors.push(`Periodo ${periodIndex + 1} tiene subjects vacio`);
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
          if (!Number.isFinite(Number(subject.credits)) || Number(subject.credits) < 0) {
            errors.push(`${label} tiene credits invalido`);
          }
          if (subject.prerequisites !== undefined && !Array.isArray(subject.prerequisites)) {
            errors.push(`${label} tiene prerequisites invalido`);
          }
          if (subject.id) {
            if (subjectIds.has(subject.id)) {
              errors.push(`${label} tiene id duplicado: ${subject.id}`);
            }
            subjectIds.add(subject.id);
          }
          subjectsToValidate.push({ subject, label });
        });
      });

      if (curriculum.schema_version !== undefined) {
        subjectsToValidate.forEach(({ subject, label }) => {
          collectPrerequisiteIds(subject.prerequisites).forEach((prerequisiteId) => {
            if (!looksLikeSubjectReference(prerequisiteId) || subjectIds.has(prerequisiteId)) return;

            errors.push(`${label} tiene prerequisite desconocido: ${prerequisiteId}`);
          });
        });
      }
    }

    return { valid: errors.length === 0, errors };
  }

  function validateCatalogEntry(entry, curriculum) {
    const errors = [];

    if (!isObject(entry)) {
      return { valid: false, errors: ['La entrada del catalogo debe ser un objeto JSON'] };
    }

    if (!hasText(entry.id)) errors.push('Falta catalogo.id');
    if (!hasText(entry.institution)) errors.push('Falta catalogo.institution');
    if (!hasText(entry.degree_type)) errors.push('Falta catalogo.degree_type');
    if (!hasText(entry.career_name)) errors.push('Falta catalogo.career_name');
    if (!hasText(entry.path)) errors.push('Falta catalogo.path');
    if (!hasText(entry.last_update)) errors.push('Falta catalogo.last_update');

    const curriculumResult = validateCurriculum(curriculum);
    curriculumResult.errors.forEach((error) => errors.push(error));

    return { valid: errors.length === 0, errors };
  }

  global.StudyTrackCurriculum = {
    validateCurriculum,
    validateCatalogEntry
  };
})(typeof window !== 'undefined' ? window : globalThis);
