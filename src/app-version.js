(function (global) {
  // Single source of truth for the app version and its "what's new" history.
  // To ship a release: add a new entry at the TOP of CHANGELOG, set APP_VERSION to
  // the same number, and bump CACHE_NAME in sw.js. tests/logic.mjs enforces that
  // APP_VERSION matches the newest entry. Pure module: it never touches the DOM or Date.
  const APP_VERSION = '1.0.0';

  const CHANGELOG = [
    {
      version: '1.0.0',
      date: '2026-10-19',
      title: 'Ahora ves qué hay de nuevo',
      items: [
        'La versión de la app aparece al final de Configuración.',
        'Cuando se actualice, verás aquí un resumen de lo que mejoró.',
        'Puedes volver a ver las novedades cuando quieras desde Configuración.'
      ]
    }
  ];

  function parseVersion(value) {
    const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(String(value == null ? '' : value).trim());
    if (!match) return [0, 0, 0];
    return [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)];
  }

  // -1 when a < b, 0 when equal, 1 when a > b. Invalid or empty counts as 0.0.0.
  function compareVersions(a, b) {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    for (let i = 0; i < 3; i++) {
      if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1;
    }
    return 0;
  }

  // Releases newer than lastSeen and not newer than current, newest first.
  // No lastSeen means a fresh install: nothing to announce.
  function getUnseenReleases(changelog, lastSeen, current, limit = 5) {
    if (!lastSeen || !Array.isArray(changelog)) return [];
    return changelog
      .filter((r) => r && compareVersions(r.version, lastSeen) > 0 && compareVersions(r.version, current) <= 0)
      .sort((a, b) => compareVersions(b.version, a.version))
      .slice(0, Math.max(0, limit));
  }

  global.StudyTrackVersion = { APP_VERSION, CHANGELOG, compareVersions, getUnseenReleases };
})(typeof window !== 'undefined' ? window : globalThis);
