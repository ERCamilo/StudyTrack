(function (global) {
  // Academic honors (Cum Laude / Magna / Summa by default). Pure: grades in, standing and advice out.
  // The average is the app's own "Índice": credit-weighted over every subject that has a grade.
  const DEFAULT_LEVELS = [
    { name: 'Cum Laude', min: 90 },
    { name: 'Magna Cum Laude', min: 95 },
    { name: 'Summa Cum Laude', min: 98 }
  ];
  const MAX_NAME = 30;
  const CANDIDATE_GRADES = [100, 95, 90];

  const round2 = (n) => Math.round(n * 100) / 100;
  const ceil1 = (n) => Math.ceil(n * 10 - 1e-9) / 10;
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  // What the student edited, kept to 1-100, named, and ordered from lowest to highest minimum.
  function normalizeHonorLevels(raw) {
    const source = Array.isArray(raw) ? raw : [];
    return DEFAULT_LEVELS.map((def, i) => {
      const entry = source[i] && typeof source[i] === 'object' ? source[i] : {};
      const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim().slice(0, MAX_NAME) : def.name;
      const minNum = Number(entry.min);
      const min = entry.min !== null && entry.min !== '' && entry.min !== undefined && Number.isFinite(minNum)
        ? clamp(Math.round(minNum * 10) / 10, 1, 100)
        : def.min;
      return { name, min };
    }).sort((a, b) => a.min - b.min).map((level, i) => ({ id: `honor-${i}`, ...level }));
  }

  // Average a student must keep on the credits still to take to end with `target` overall:
  // (target x (graded credits + remaining credits) - points so far) / remaining credits.
  function requiredAverage(target, weightedSum, weightBase, remaining) {
    return (target * (weightBase + remaining) - weightedSum) / remaining;
  }

  function evaluateHonors(input) {
    const levels = normalizeHonorLevels(input?.levels);
    const S = Number(input?.weightedSum) || 0;
    const W = Number(input?.weightBase) || 0;
    const R = Math.max(0, Number(input?.remainingCredits) || 0);
    const passing = Number(input?.passingGrade) || 0;
    const typical = Number(input?.typicalCredits) || 0;
    const heaviest = Number(input?.heaviestCredits) || 0;
    const perPeriod = Number(input?.perPeriodCredits) || 0;

    const hasGrades = W > 0;
    const average = hasGrades ? round2(S / W) : null;
    const current = hasGrades ? ([...levels].reverse().find((l) => average >= l.min) || null) : null;
    const next = levels.find((l) => average === null || l.min > average) || null;
    const finished = R <= 0;

    let progressToNext = null;
    if (hasGrades && next) {
      const lower = current ? current.min : 0;
      progressToNext = Math.round(clamp(((average - lower) / (next.min - lower)) * 100, 0, 100));
    }

    let toKeep = null;
    if (current) {
      if (finished) toKeep = { level: current, requiredAvg: null, onlyPassing: false, secure: true };
      else {
        const raw = requiredAverage(current.min, S, W, R);
        toKeep = { level: current, requiredAvg: Math.max(ceil1(raw), passing), onlyPassing: raw <= passing, secure: false };
      }
    }

    let toReach = null;
    if (next) {
      const gap = hasGrades ? round2(next.min - average) : null;
      if (finished) toReach = { level: next, target: next.min, requiredAvg: null, feasible: false, gap, options: [] };
      else {
        const raw = requiredAverage(next.min, S, W, R);
        const options = [];
        if (hasGrades) {
          CANDIDATE_GRADES.filter((g) => g > next.min && g > passing).forEach((g) => {
            const credits = (next.min * W - S) / (g - next.min);
            if (!(credits > 0)) return;
            options.push({
              grade: g,
              credits: ceil1(credits),
              subjects: typical > 0 ? Math.ceil(credits / typical - 1e-9) : null,
              periods: perPeriod > 0 ? Math.ceil(credits / perPeriod - 1e-9) : null,
              enough: credits <= R + 1e-9
            });
          });
        }
        toReach = { level: next, target: next.min, requiredAvg: Math.max(ceil1(raw), passing), feasible: raw <= 100 + 1e-9, gap, options };
      }
    }

    // Lowest grade a single next subject can get without dropping below the current level.
    let risk = null;
    if (current && !finished) {
      const single = (credits) => {
        if (!(credits > 0)) return null;
        const g = (current.min * (W + credits) - S) / credits;
        return { credits, minGrade: ceil1(g), safe: g <= passing };
      };
      risk = { levelName: current.name, typical: single(typical), heaviest: single(heaviest) };
    }

    return { status: hasGrades ? 'ok' : 'no-grades', average, current, next, progressToNext, finished, remainingCredits: R, toKeep, toReach, risk };
  }

  // Grades and what is still to take, from the curriculum and the student's progress.
  function summarizeGrades(curriculum, progress) {
    const parse = global.StudyTrackGrades.parseGradeNumber;
    const subjects = (curriculum?.periods || []).flatMap((p) => p.subjects || []);
    let weightedSum = 0;
    let weightBase = 0;
    const ungradedApproved = { count: 0, credits: 0 };
    subjects.forEach((s) => {
      const entry = progress?.[s.id];
      const credits = Number(s.credits) || 0;
      const grade = entry ? parse(entry.grade) : null;
      if (grade !== null) { weightedSum += grade * credits; weightBase += credits; }
      else if (entry?.status === 'approved') { ungradedApproved.count += 1; ungradedApproved.credits += credits; }
    });

    const remaining = [...global.StudyTrackGraduation.getRequiredPending(curriculum, progress).values()]
      .filter((s) => parse(progress?.[s.id]?.grade) === null)
      .map((s) => Number(s.credits) || 0)
      .filter((c) => c > 0);
    const remainingCredits = remaining.reduce((a, b) => a + b, 0);
    return {
      weightedSum,
      weightBase,
      remainingCredits,
      typicalCredits: remaining.length ? remainingCredits / remaining.length : 0,
      heaviestCredits: remaining.length ? Math.max(...remaining) : 0,
      ungradedApproved
    };
  }

  // Honors are shown unless the user explicitly hid them (not everyone can reach one, and that's their call).
  function isHonorsVisible(hidden) { return hidden !== true; }

  global.StudyTrackHonors = { isHonorsVisible, DEFAULT_LEVELS, normalizeHonorLevels, evaluateHonors, summarizeGrades };
})(typeof window !== 'undefined' ? window : globalThis);
