(function (global) {
  function getAllSubjects(curriculum) {
    return (curriculum?.periods || []).flatMap((period) => (period.subjects || []).map((subject) => ({
      ...subject,
      period_number: period.period_number,
      period_name: period.name
    })));
  }

  function getSubjectStatus(progress, subjectId) {
    return progress?.[subjectId]?.status || 'pending';
  }

  function isMissingGrade(progressEntry) {
    return progressEntry?.status === 'approved' && (progressEntry.grade === null || progressEntry.grade === undefined || progressEntry.grade === '');
  }

  function getEnrolledSubjects(curriculum, progress) {
    return getAllSubjects(curriculum).filter((subject) => getSubjectStatus(progress, subject.id) === 'enrolled');
  }

  function getMissingGradeSubjects(curriculum, progress) {
    return getAllSubjects(curriculum).filter((subject) => isMissingGrade(progress?.[subject.id]));
  }

  function getAvailableSubjects(curriculum, progress, canTakeSubject = () => true) {
    return getAllSubjects(curriculum).filter((subject) => {
      const status = getSubjectStatus(progress, subject.id);
      return status === 'pending' && canTakeSubject(subject);
    });
  }

  function getBlockedSubjects(curriculum, progress, canTakeSubject = () => true) {
    return getAllSubjects(curriculum).filter((subject) => {
      const status = getSubjectStatus(progress, subject.id);
      return status === 'pending' && subject.prerequisites?.length && !canTakeSubject(subject);
    });
  }

  function rankRecommendedSubjects(curriculum, progress, dependencyGraph, canTakeSubject = () => true) {
    return getAvailableSubjects(curriculum, progress, canTakeSubject)
      .map((subject) => ({
        ...subject,
        unlocks: dependencyGraph?.unlocks?.get(subject.id) || 0,
        creditsValue: Number(subject.credits) || 0
      }))
      .sort((a, b) => {
        if (b.unlocks !== a.unlocks) return b.unlocks - a.unlocks;
        if (b.creditsValue !== a.creditsValue) return b.creditsValue - a.creditsValue;
        return String(a.period_number || '').localeCompare(String(b.period_number || ''));
      });
  }

  function getScheduleSummary(enrolledSubjects, scheduleData) {
    const scheduled = enrolledSubjects.filter((subject) => (scheduleData?.[subject.id] || []).length > 0);
    const pending = enrolledSubjects.length - scheduled.length;
    const blocks = enrolledSubjects.flatMap((subject) => (scheduleData?.[subject.id] || []).map((block) => ({ ...block, subject })));
    return {
      enrolled: enrolledSubjects.length,
      scheduled: scheduled.length,
      pending,
      blocks
    };
  }

  function getNextBestAction({ missingGrades = [], available = [], blocked = [], enrolled = [], scheduleSummary = {} } = {}) {
    if (missingGrades.length > 0) {
      return {
        type: 'missing-grade',
        title: 'Agregar nota pendiente',
        detail: `${missingGrades.length} ${missingGrades.length === 1 ? 'materia aprobada necesita nota' : 'materias aprobadas necesitan nota'}`,
        icon: 'fas fa-exclamation-triangle',
        tone: 'amber',
        target: 'completed'
      };
    }

    if (enrolled.length > 0 && scheduleSummary.pending > 0) {
      return {
        type: 'schedule',
        title: 'Completar horario semanal',
        detail: `${scheduleSummary.pending} ${scheduleSummary.pending === 1 ? 'materia inscrita no tiene horario' : 'materias inscritas no tienen horario'}`,
        icon: 'fas fa-calendar-plus',
        tone: 'blue',
        target: 'schedule'
      };
    }

    if (available.length > 0) {
      return {
        type: 'available',
        title: 'Inscribir próxima materia',
        detail: `Puedes avanzar con ${available.length} ${available.length === 1 ? 'materia disponible' : 'materias disponibles'}`,
        icon: 'fas fa-route',
        tone: 'emerald',
        target: 'pending'
      };
    }

    if (blocked.length > 0) {
      return {
        type: 'blocked',
        title: 'Revisar bloqueos',
        detail: `${blocked.length} ${blocked.length === 1 ? 'materia depende de requisitos' : 'materias dependen de requisitos'}`,
        icon: 'fas fa-lock',
        tone: 'slate',
        target: 'pending'
      };
    }

    return {
      type: 'steady',
      title: 'Tu ruta está al día',
      detail: 'No hay acciones urgentes en este momento',
      icon: 'fas fa-check-circle',
      tone: 'emerald',
      target: 'subjects'
    };
  }

  function buildHomeInsights({ curriculum, progress, dependencyGraph, scheduleData, canTakeSubject }) {
    const enrolled = getEnrolledSubjects(curriculum, progress);
    const missingGrades = getMissingGradeSubjects(curriculum, progress);
    const available = getAvailableSubjects(curriculum, progress, canTakeSubject);
    const blocked = getBlockedSubjects(curriculum, progress, canTakeSubject);
    const recommended = rankRecommendedSubjects(curriculum, progress, dependencyGraph, canTakeSubject);
    const scheduleSummary = getScheduleSummary(enrolled, scheduleData);
    const nextAction = getNextBestAction({ missingGrades, available, blocked, enrolled, scheduleSummary });

    return {
      enrolled,
      missingGrades,
      available,
      blocked,
      recommended,
      scheduleSummary,
      nextAction
    };
  }

  global.StudyTrackInsights = {
    buildHomeInsights,
    getAllSubjects,
    getAvailableSubjects,
    getBlockedSubjects,
    getEnrolledSubjects,
    getMissingGradeSubjects,
    getNextBestAction,
    getScheduleSummary,
    getSubjectStatus,
    rankRecommendedSubjects
  };
})(typeof window !== 'undefined' ? window : globalThis);
