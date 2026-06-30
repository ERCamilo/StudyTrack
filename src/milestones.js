(function (global) {
  // Pure, data-driven academic milestones. Order matters (timeline / "latest").
  // The module never calls Date: the app stamps achievement dates.
  const DEFS = [
    { id: 'first-subject', icon: 'fa-seedling', label: 'Primera materia aprobada', test: (s) => s.subjectsApproved >= 1 },
    { id: 'first-period', icon: 'fa-calendar-check', label: 'Primer período cursado', test: (s) => s.periodsTaken >= 1 },
    { id: 'subjects-5', icon: 'fa-layer-group', label: '5 materias aprobadas', test: (s) => s.subjectsApproved >= 5 },
    { id: 'progress-25', icon: 'fa-flag', label: '25% de la carrera', test: (s) => s.progress >= 25 },
    { id: 'subjects-10', icon: 'fa-cubes-stacked', label: '10 materias aprobadas', test: (s) => s.subjectsApproved >= 10 },
    { id: 'progress-50', icon: 'fa-flag-checkered', label: 'Mitad de camino', test: (s) => s.progress >= 50 },
    { id: 'excellence', icon: 'fa-star', label: 'Promedio de excelencia (90+)', test: (s) => s.subjectsApproved >= 1 && s.average !== null && s.average >= 90 },
    { id: 'progress-75', icon: 'fa-mountain', label: '75% completado', test: (s) => s.progress >= 75 },
    { id: 'progress-100', icon: 'fa-trophy', label: 'Carrera completada', test: (s) => s.progress >= 100 }
  ];

  function normalizeStats(stats) {
    const s = stats || {};
    const avg = Number(s.average);
    return {
      subjectsApproved: Number(s.subjectsApproved) || 0,
      subjectsTotal: Number(s.subjectsTotal) || 0,
      creditsEarned: Number(s.creditsEarned) || 0,
      progress: Number(s.progress) || 0,
      periodsTaken: Number(s.periodsTaken) || 0,
      average: Number.isFinite(avg) ? avg : null
    };
  }

  // Returns the milestone definitions currently achieved, in definition order.
  function evaluateMilestones(stats) {
    const s = normalizeStats(stats);
    return DEFS.filter((d) => d.test(s));
  }

  // Compares the currently-achieved set against a stored {id: ISODate} map and
  // returns which ids are achieved now and which are newly achieved this run.
  function reconcileMilestones(achievedNow, storedMap) {
    const stored = storedMap && typeof storedMap === 'object' ? storedMap : {};
    const achievedIds = (achievedNow || []).map((d) => d.id);
    const newlyAchieved = achievedIds.filter((id) => !stored[id]);
    return { achievedIds, newlyAchieved };
  }

  global.StudyTrackMilestones = {
    DEFS,
    normalizeStats,
    evaluateMilestones,
    reconcileMilestones
  };
})(typeof window !== 'undefined' ? window : globalThis);
