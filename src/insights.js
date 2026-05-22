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

  function getPeriodProgress(curriculum, progress, periodNumber) {
    const period = (curriculum?.periods || []).find((item) => String(item.period_number) === String(periodNumber));
    const subjects = period?.subjects || [];
    if (!subjects.length) return { total: 0, completed: 0, remaining: 0, completionRatio: 0 };

    const completed = subjects.filter((subject) => getSubjectStatus(progress, subject.id) === 'approved').length;
    return {
      total: subjects.length,
      completed,
      remaining: subjects.length - completed,
      completionRatio: completed / subjects.length
    };
  }

  function getSubjectRecommendationProfile(subject, curriculum, progress, dependencyGraph) {
    const unlocks = dependencyGraph?.unlocks?.get(subject.id) || 0;
    const creditsValue = Number(subject.credits) || 0;
    const periodProgress = getPeriodProgress(curriculum, progress, subject.period_number);
    const isLightLoad = creditsValue > 0 && creditsValue <= 3;
    const helpsClosePeriod = periodProgress.remaining > 0 && periodProgress.remaining <= 3;
    const earlyPeriodBonus = Math.max(0, 12 - (Number.parseInt(subject.period_number, 10) || 0));

    const score = (unlocks * 18)
      + (helpsClosePeriod ? 16 : 0)
      + (isLightLoad ? 8 : 0)
      + (creditsValue * 2)
      + earlyPeriodBonus;

    let category = 'advance';
    let reason = `${creditsValue || 0} créditos disponibles`;
    let badge = 'Avance';

    if (unlocks >= 2) {
      category = 'unlock';
      reason = `Desbloquea ${unlocks} materias`;
      badge = 'Alto impacto';
    } else if (helpsClosePeriod) {
      category = 'close-period';
      reason = `Ayuda a cerrar el periodo ${subject.period_number}`;
      badge = 'Cierre de periodo';
    } else if (isLightLoad) {
      category = 'light-load';
      reason = 'Buena opción de carga ligera';
      badge = 'Carga ligera';
    } else if (unlocks === 1) {
      category = 'unlock';
      reason = 'Desbloquea 1 materia';
      badge = 'Desbloquea';
    }

    return {
      unlocks,
      creditsValue,
      periodProgress,
      isLightLoad,
      helpsClosePeriod,
      score,
      category,
      reason,
      badge
    };
  }

  function getBlockedSubjects(curriculum, progress, canTakeSubject = () => true) {
    return getAllSubjects(curriculum).filter((subject) => {
      const status = getSubjectStatus(progress, subject.id);
      return status === 'pending' && subject.prerequisites?.length && !canTakeSubject(subject);
    });
  }

  function rankRecommendedSubjects(curriculum, progress, dependencyGraph, canTakeSubject = () => true) {
    return getAvailableSubjects(curriculum, progress, canTakeSubject)
      .map((subject) => ({ ...subject, recommendation: getSubjectRecommendationProfile(subject, curriculum, progress, dependencyGraph) }))
      .sort((a, b) => {
        if (b.recommendation.score !== a.recommendation.score) return b.recommendation.score - a.recommendation.score;
        if (b.recommendation.unlocks !== a.recommendation.unlocks) return b.recommendation.unlocks - a.recommendation.unlocks;
        if (b.recommendation.creditsValue !== a.recommendation.creditsValue) return b.recommendation.creditsValue - a.recommendation.creditsValue;
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
    getPeriodProgress,
    getScheduleSummary,
    getSubjectStatus,
    getSubjectRecommendationProfile,
    rankRecommendedSubjects
  };
})(typeof window !== 'undefined' ? window : globalThis);
