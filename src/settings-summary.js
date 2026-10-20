(function (global) {
  // Pure one-line summaries shown under each Settings row, so the list explains itself without opening anything.
  // The app passes plain values in; this module never touches the DOM or storage.
  function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

  function buildSettingsSummary(ctx) {
    const c = ctx || {};
    const max = Number(c.maxEnrolled);
    const passing = Number(c.passingGrade);
    const reqs = Math.max(0, Math.floor(Number(c.requirementsCount)) || 0);
    return {
      cloud: c.signedIn ? (c.syncLabel || 'Conectada') : 'Sin iniciar sesión',
      career: c.careerName ? String(c.careerName) : 'Sin carrera cargada',
      unical: c.calendarSet ? 'Conectado' : 'Sin conectar',
      preferences: Number.isFinite(max) && max > 0 ? `Hasta ${plural(max, 'materia inscrita', 'materias inscritas')}` : '',
      grades: Number.isFinite(passing) && passing > 0 ? `Se aprueba con ${passing}` : '',
      requirements: reqs === 0 ? 'Ninguno' : plural(reqs, 'requisito', 'requisitos'),
      data: c.version ? `Versión ${c.version}` : '',
      share: ''
    };
  }

  global.StudyTrackSettingsSummary = { buildSettingsSummary };
})(typeof window !== 'undefined' ? window : globalThis);
