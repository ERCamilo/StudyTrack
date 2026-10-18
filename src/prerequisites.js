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

  function isGroupSatisfied(group, progress) {
    if (Array.isArray(group)) return group.some((subjectId) => isApproved(progress, subjectId));
    return isApproved(progress, group);
  }

  function checkPrerequisites(prerequisites, progress, curriculum) {
    if (!prerequisites || !prerequisites.length) return true;
    // "ALL" plus other entries requires both: "ALL" skips optional subjects and other
    // "ALL" subjects, so an extra entry (e.g. an optional seminar) is a real requirement.
    const others = prerequisites.filter((group) => group !== 'ALL');
    if (others.length < prerequisites.length && !areAllOtherSubjectsCompleted(curriculum, progress)) return false;

    return others.every((group) => isGroupSatisfied(group, progress));
  }

  function formatPrerequisiteString(prerequisites) {
    if (!prerequisites?.length) return '';
    return prerequisites
      .map((group) => {
        if (group === 'ALL') return 'Todas';
        return Array.isArray(group) ? `(${group.join(' o ')})` : group;
      })
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
