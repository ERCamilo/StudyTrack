(function (global) {
  // Estimated time to graduate. Pure: curriculum + progress + your plan in, periods and dates out.
  // It simulates period by period instead of dividing: each period takes, up to your load, the
  // subjects whose prerequisites were approved in earlier periods (longest chains first), so the
  // estimate respects prerequisite chains, "A or B" groups and the capstone that needs "ALL".
  const MAX_PERIODS = 200;
  const LIMITS = { subjects: { min: 1, max: 15 }, credits: { min: 1, max: 60 }, months: { min: 0.5, max: 12 } };

  function flattenSubjects(curriculum) {
    return (curriculum?.periods || []).flatMap((period) =>
      (period.subjects || []).map((subject) => ({ ...subject, period_number: period.period_number })));
  }

  // Subjects still to take: not approved and required (or enrolled). An optional subject counts only when
  // a required one lists it as a prerequisite (found by closure).
  function getRequiredPending(curriculum, progress) {
    const all = flattenSubjects(curriculum);
    const status = (id) => progress?.[id]?.status || 'pending';
    const pending = all.filter((s) => status(s.id) !== 'approved');
    const byId = new Map(pending.map((s) => [s.id, s]));
    const chosen = new Map(pending.filter((s) => !s.is_optional || status(s.id) === 'enrolled').map((s) => [s.id, s]));
    let grew = true;
    while (grew) {
      grew = false;
      [...chosen.values()].forEach((s) => (s.prerequisites || []).flat().forEach((pid) => {
        if (pid !== 'ALL' && byId.has(pid) && !chosen.has(pid)) { chosen.set(pid, byId.get(pid)); grew = true; }
      }));
    }
    return chosen;
  }

  function simulate(curriculum, progress, required, capacity) {
    const P = global.StudyTrackPrerequisites;
    const status = (id) => progress?.[id]?.status || 'pending';
    const remaining = new Map(required);
    const approved = new Set(Object.keys(progress || {}).filter((id) => status(id) === 'approved'));

    const dependents = new Map();
    required.forEach((s) => (s.prerequisites || []).flat().forEach((pid) => {
      if (pid === 'ALL') return;
      if (!dependents.has(pid)) dependents.set(pid, []);
      dependents.get(pid).push(s.id);
    }));
    const heightMemo = new Map();
    const height = (id, trail = new Set()) => {
      if (heightMemo.has(id)) return heightMemo.get(id);
      if (trail.has(id)) return 1;
      trail.add(id);
      const h = 1 + Math.max(0, ...(dependents.get(id) || []).filter((d) => required.has(d)).map((d) => height(d, trail)));
      trail.delete(id);
      heightMemo.set(id, h);
      return h;
    };
    const credits = (s) => Number(s.credits) || 0;

    const plan = [];
    while (remaining.size) {
      if (plan.length >= MAX_PERIODS) return { status: 'stuck', reason: 'prerequisites', plan, stuckIds: [...remaining.keys()] };
      const approvedProgress = {};
      approved.forEach((id) => { approvedProgress[id] = { status: 'approved' }; });
      const available = [...remaining.values()]
        .filter((s) => P.checkPrerequisites(s.prerequisites, approvedProgress, curriculum))
        .sort((a, b) => (height(b.id) - height(a.id))
          || ((dependents.get(b.id) || []).length - (dependents.get(a.id) || []).length)
          || (Number(a.period_number) - Number(b.period_number))
          || String(a.id).localeCompare(String(b.id)));

      // Enrolled subjects are already being taken: they open the first period whatever the load.
      const chosen = plan.length === 0 ? [...remaining.values()].filter((s) => status(s.id) === 'enrolled') : [];
      const forced = new Set(chosen.map((s) => s.id));
      let used = capacity && capacity.mode === 'credits' ? chosen.reduce((sum, s) => sum + credits(s), 0) : chosen.length;
      available.forEach((s) => {
        if (forced.has(s.id)) return;
        if (!capacity) { chosen.push(s); return; }
        const cost = capacity.mode === 'credits' ? credits(s) : 1;
        if (used + cost <= capacity.perPeriod) { chosen.push(s); used += cost; }
      });

      if (!chosen.length) {
        return { status: 'stuck', reason: available.length ? 'capacity' : 'prerequisites', plan, stuckIds: (available.length ? available : [...remaining.values()]).map((s) => s.id) };
      }
      plan.push({ period: plan.length + 1, ids: chosen.map((s) => s.id) });
      chosen.forEach((s) => { remaining.delete(s.id); approved.add(s.id); });
    }
    return { status: 'ok', plan };
  }

  function planGraduation(curriculum, progress, settings) {
    const required = getRequiredPending(curriculum, progress);
    const base = {
      remainingSubjects: required.size,
      remainingCredits: [...required.values()].reduce((sum, s) => sum + (Number(s.credits) || 0), 0)
    };
    if (!required.size) return { ...base, status: 'done', periods: 0, minPeriods: 0, limitedBy: null, plan: [] };

    const capacity = { mode: settings?.mode === 'credits' ? 'credits' : 'subjects', perPeriod: Number(settings?.perPeriod) || 0 };
    const mine = simulate(curriculum, progress, required, capacity);
    if (mine.status === 'stuck') return { ...base, status: 'stuck', reason: mine.reason, stuckIds: mine.stuckIds, periods: mine.plan.length, minPeriods: null, limitedBy: null, plan: mine.plan };

    const free = simulate(curriculum, progress, required, null);
    const minPeriods = free.status === 'ok' ? free.plan.length : null;
    const periods = mine.plan.length;
    return { ...base, status: 'ok', periods, minPeriods, limitedBy: minPeriods !== null && periods > minPeriods ? 'capacity' : 'prerequisites', plan: mine.plan };
  }

  // Same day-of-month `n` months later, clamped to the end of shorter months (Jan 31 + 1 month = Feb 28/29).
  function addMonthsClamped(startMs, n) {
    const d = new Date(startMs);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + n;
    const daysInTarget = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return Date.UTC(y, m, Math.min(d.getUTCDate(), daysInTarget), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
  }

  function estimateEnd(periods, periodMonths, startMs) {
    const months = Math.round(periods * periodMonths * 100) / 100;
    const whole = Math.floor(months);
    const extraDays = Math.round((months - whole) * 30.4375);
    return { months, endMs: addMonthsClamped(startMs, whole) + extraDays * 86400000 };
  }

  function formatDuration(months) {
    const n = Math.round(months);
    if (!(n > 0)) return 'menos de un mes';
    const years = Math.floor(n / 12);
    const rest = n % 12;
    const parts = [];
    if (years) parts.push(`${years} ${years === 1 ? 'año' : 'años'}`);
    if (rest) parts.push(`${rest} ${rest === 1 ? 'mes' : 'meses'}`);
    return parts.join(' y ');
  }

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  // Starting point so the card shows an estimate before the student types anything.
  function defaultPlanSettings(curriculum) {
    const periodCount = (curriculum?.periods || []).length;
    const years = Number(curriculum?.metadata?.duration_years);
    const months = periodCount > 0 && years > 0 ? Math.round((years * 12 / periodCount) * 10) / 10 : 4;
    const subjectCount = flattenSubjects(curriculum).length;
    const perPeriod = periodCount > 0 && subjectCount > 0 ? Math.ceil(subjectCount / periodCount) : 4;
    return {
      mode: 'subjects',
      perPeriod: clamp(perPeriod, LIMITS.subjects.min, LIMITS.subjects.max),
      periodMonths: clamp(months, LIMITS.months.min, LIMITS.months.max)
    };
  }

  function defaultCreditsPerPeriod(curriculum) {
    const periodCount = (curriculum?.periods || []).length;
    const declared = Number(curriculum?.metadata?.total_credits);
    const total = declared > 0 ? declared : flattenSubjects(curriculum).reduce((sum, s) => sum + (Number(s.credits) || 0), 0);
    if (!(periodCount > 0) || !(total > 0)) return 15;
    return clamp(Math.ceil(total / periodCount), LIMITS.credits.min, LIMITS.credits.max);
  }

  // What the student typed, kept inside sensible ranges; anything unusable falls back to the defaults.
  function normalizePlanSettings(raw, defaults) {
    const d = defaults || defaultPlanSettings(null);
    const r = raw || {};
    const mode = r.mode === 'credits' || r.mode === 'subjects' ? r.mode : d.mode;
    const limits = LIMITS[mode];
    const perRaw = Number(r.perPeriod);
    const monthsRaw = Number(r.periodMonths);
    return {
      mode,
      perPeriod: Number.isFinite(perRaw) && r.perPeriod !== null && r.perPeriod !== '' ? clamp(Math.round(perRaw), limits.min, limits.max) : d.perPeriod,
      periodMonths: Number.isFinite(monthsRaw) && r.periodMonths !== null && r.periodMonths !== '' ? clamp(Math.round(monthsRaw * 10) / 10, LIMITS.months.min, LIMITS.months.max) : d.periodMonths
    };
  }

  // "Trimestre" -> "trimestre(s)"; unknown type -> "período(s)".
  function periodNoun(type, count) {
    const base = String(type || '').trim().toLowerCase() || 'período';
    if (count === 1) return base;
    return /[aeiouáéíóú]$/.test(base) ? `${base}s` : `${base}es`;
  }

  global.StudyTrackGraduation = { periodNoun, planGraduation, estimateEnd, formatDuration, defaultPlanSettings, defaultCreditsPerPeriod, normalizePlanSettings, LIMITS };
})(typeof window !== 'undefined' ? window : globalThis);
