(function (global) {
  function isApproved(progress, subjectId) {
    return progress?.[subjectId]?.status === 'approved';
  }

  function areAllOtherSubjectsCompleted(curriculum, progress) {
    if (!curriculum) return false;

    for (const period of curriculum.periods || []) {
      for (const subject of period.subjects || []) {
        const requiresAll = subject.prerequisites?.includes('ALL');
        if (!requiresAll && !subject.is_optional && !isApproved(progress, subject.id)) {
          return false;
        }
      }
    }

    return true;
  }

  function checkPrerequisites(prerequisites, progress, curriculum) {
    if (!prerequisites || !prerequisites.length) return true;
    if (prerequisites.includes('ALL')) return areAllOtherSubjectsCompleted(curriculum, progress);

    return prerequisites.every((group) => {
      if (Array.isArray(group)) {
        return group.some((subjectId) => isApproved(progress, subjectId));
      }

      return isApproved(progress, group);
    });
  }

  function formatPrerequisiteString(prerequisites) {
    if (!prerequisites?.length) return '';
    if (prerequisites.includes('ALL')) return 'Todas';

    return prerequisites
      .map((group) => Array.isArray(group) ? `(${group.join(' o ')})` : group)
      .join(' y ');
  }

  function buildDependencyGraph(curriculum) {
    const dependents = new Map();
    const unlocks = new Map();
    const allPrereqSubjects = [];

    (curriculum?.periods || []).forEach((period) => {
      (period.subjects || []).forEach((subject) => {
        const rawPrerequisites = subject.prerequisites || [];
        if (rawPrerequisites.includes('ALL')) allPrereqSubjects.push(subject.id);

        rawPrerequisites.flat().forEach((prerequisiteId) => {
          if (prerequisiteId === 'ALL') return;

          unlocks.set(prerequisiteId, (unlocks.get(prerequisiteId) || 0) + 1);
          if (!dependents.has(prerequisiteId)) dependents.set(prerequisiteId, []);
          dependents.get(prerequisiteId).push(subject.id);
        });
      });
    });

    return { dependents, unlocks, allPrereqSubjects };
  }

  global.StudyTrackPrerequisites = {
    areAllOtherSubjectsCompleted,
    buildDependencyGraph,
    checkPrerequisites,
    formatPrerequisiteString
  };
})(typeof window !== 'undefined' ? window : globalThis);
