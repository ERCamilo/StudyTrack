(function (global) {
  // Which subjects are holding back your progress. Pure: curriculum + progress in, ranked list out.
  // A "blocker" is a subject that is not approved, can be taken right now (prerequisites met, or already
  // in progress) and that, directly or through a chain, other currently-locked subjects depend on.
  // Subjects that require 'ALL' (the whole rest of the curriculum) are left out of both sides: every
  // pending subject holds them back equally, so they say nothing about what to pass first.
  const HIGH_PERCENT = 50;
  const MEDIUM_PERCENT = 20;

  // Urgency from the share of locked subjects a blocker holds back. Compared with integers (no rounding).
  function getUrgency(blocks, total) {
    if (!(blocks > 0) || !(total > 0)) return null;
    if (blocks * 100 >= HIGH_PERCENT * total) return 'high';
    if (blocks * 100 >= MEDIUM_PERCENT * total) return 'medium';
    return 'low';
  }

  function analyzeBlockers(curriculum, progress) {
    const P = global.StudyTrackPrerequisites;
    const subjects = (curriculum?.periods || []).flatMap((period) =>
      (period.subjects || []).map((subject) => ({ ...subject, period_number: period.period_number })));
    const status = (id) => progress?.[id]?.status || 'pending';
    const requiresAll = (s) => (s.prerequisites || []).includes('ALL');
    const canTakeNow = (s) => P.checkPrerequisites(s.prerequisites, progress, curriculum);

    const locked = subjects.filter((s) => !requiresAll(s) && status(s.id) !== 'approved' && status(s.id) !== 'enrolled' && !canTakeNow(s));
    const lockedById = new Map(locked.map((s) => [s.id, s]));
    if (!locked.length) return { lockedCount: 0, blockers: [] };

    const dependents = new Map();
    subjects.forEach((s) => {
      if (requiresAll(s)) return;
      (s.prerequisites || []).flat().forEach((prereqId) => {
        if (!dependents.has(prereqId)) dependents.set(prereqId, []);
        dependents.get(prereqId).push(s.id);
      });
    });

    const blockers = [];
    subjects.forEach((candidate) => {
      const st = status(candidate.id);
      if (st === 'approved' || requiresAll(candidate)) return;
      if (st !== 'enrolled' && !canTakeNow(candidate)) return;

      // Everything reachable through unapproved subjects (an approved one in the middle cuts the chain).
      const seen = new Set([candidate.id]);
      const queue = [candidate.id];
      while (queue.length) {
        const current = queue.shift();
        (dependents.get(current) || []).forEach((depId) => {
          if (seen.has(depId) || status(depId) === 'approved') return;
          seen.add(depId);
          queue.push(depId);
        });
      }
      const blocked = locked.filter((s) => seen.has(s.id) && s.id !== candidate.id);
      if (!blocked.length) return;

      const withCandidate = { ...(progress || {}), [candidate.id]: { status: 'approved' } };
      const unlocksNow = blocked.filter((s) => P.checkPrerequisites(s.prerequisites, withCandidate, curriculum)).length;
      blocked.sort((a, b) => (Number(a.period_number) - Number(b.period_number)) || String(a.id).localeCompare(String(b.id)));
      blockers.push({
        id: candidate.id,
        code: candidate.code || candidate.id,
        name: candidate.name,
        period: candidate.period_number,
        status: st,
        blocks: blocked.length,
        total: locked.length,
        percent: Math.round((blocked.length * 100) / locked.length),
        urgency: getUrgency(blocked.length, locked.length),
        unlocksNow,
        blockedIds: blocked.map((s) => s.id)
      });
    });

    blockers.sort((a, b) =>
      (b.blocks - a.blocks)
      || (b.unlocksNow - a.unlocksNow)
      || (Number(a.period) - Number(b.period))
      || String(a.id).localeCompare(String(b.id)));
    return { lockedCount: locked.length, blockers };
  }

  const URGENCY_LABELS = { high: 'Urgencia alta', medium: 'Urgencia media', low: 'Urgencia baja' };

  // Plain-language lines for one blocker row.
  function describeBlocker(b) {
    const noun = (n, one, many) => (n === 1 ? one : many);
    return {
      headline: `Frena ${b.blocks} de ${b.total} ${noun(b.total, 'materia bloqueada', 'materias bloqueadas')} (${b.percent}%)`,
      detail: b.unlocksNow > 0
        ? `Aprobarla desbloquea ${b.unlocksNow} ${noun(b.unlocksNow, 'materia', 'materias')} ya.`
        : 'Abre el camino a las siguientes de la cadena.'
    };
  }

  global.StudyTrackBlockers = { analyzeBlockers, getUrgency, describeBlocker, URGENCY_LABELS, HIGH_PERCENT, MEDIUM_PERCENT };
})(typeof window !== 'undefined' ? window : globalThis);
