(function (global) {
  // Single source of truth for the app version and its "what's new" history.
  // To ship a release: add a new entry at the TOP of CHANGELOG, set APP_VERSION to
  // the same number, and bump CACHE_NAME in sw.js. tests/logic.mjs enforces that
  // APP_VERSION matches the newest entry. Pure module: it never touches the DOM or Date.
  const APP_VERSION = '1.8.0';

  const CHANGELOG = [
    {
      version: '1.8.0',
      date: '2026-10-20',
      title: 'Cuándo terminas tu carrera',
      items: [
        'En Perfil, «Tiempo para terminar» estima cuándo te graduarías según lo que dura cada período y cuántas materias o créditos tomas por período.',
        'La estimación respeta los prerrequisitos: te dice si tu carga o tus cadenas de materias marcan el ritmo, y cuánto tiempo ahorrarías con más carga.',
        'Empieza con valores de tu carrera y los puedes ajustar.'
      ]
    },
    {
      version: '1.7.0',
      date: '2026-10-20',
      title: 'Sabes qué materias te frenan',
      items: [
        'En la pantalla principal, «Frenan tu avance» te dice qué materias debes aprobar para desbloquear más asignaturas.',
        'Cada una muestra cuántas materias bloqueadas frena (contando las que bloquean a otras en cadena), su nivel de urgencia y cuántas desbloquea de inmediato.',
        'Toca una para ir directo a ella.'
      ]
    },
    {
      version: '1.6.0',
      date: '2026-10-20',
      title: 'Una cabecera más limpia',
      items: [
        'El carné por QR y por NFC pasa a ser una función avanzada, oculta por defecto.',
        'Se quitó el engranaje de la cabecera: la configuración sigue en «Más».'
      ]
    },
    {
      version: '1.5.0',
      date: '2026-10-20',
      title: 'Ves el estado de tu sincronización',
      items: [
        'Un punto en el botón de tu cuenta te dice si tus datos están sincronizados, subiendo, pendientes o con error.',
        'Si estás sin conexión, avisa cuándo hay cambios esperando para subirse.',
        'El estado también aparece escrito en el menú «Más», para que no dependa solo del color.',
        'Botón de detalles de cada materia más fácil de tocar.'
      ]
    },
    {
      version: '1.4.0',
      date: '2026-10-20',
      title: 'Más accesible y con mejores mensajes',
      items: [
        'Si buscas una materia y no hay resultados, la app te lo explica y te deja volver a ver todas con un toque.',
        'Los menús de períodos y materias, los filtros y los interruptores se pueden usar con teclado y los leen bien los lectores de pantalla.',
        'Las ventanas del carné y del QR también se cierran con el botón atrás del teléfono.',
        'Botones más fáciles de tocar y mejor descritos.'
      ]
    },
    {
      version: '1.3.0',
      date: '2026-10-19',
      title: 'Más rápida, más clara y con deshacer',
      items: [
        'Puedes deshacer al marcar una materia como aprobada o al inscribirla.',
        'Si una materia está bloqueada, la app te dice qué prerrequisitos te faltan y te lleva a ellos.',
        'El botón «Más» abre un menú corto con lo que más usas, en vez de toda la Configuración.',
        'Los iconos y las letras ahora vienen incluidos en la app: se ven bien sin conexión y cargan más rápido.',
        'Menos efectos de desenfoque en el celular para que el desplazamiento sea más fluido.'
      ]
    },
    {
      version: '1.2.0',
      date: '2026-10-19',
      title: 'Tú decides cuándo actualizar',
      items: [
        'Cuando hay una versión nueva, la app te muestra qué mejora y tú eliges: actualizar ahora o más tarde.',
        'Si eliges más tarde, la app no se recarga sola; la nueva versión se usa la próxima vez que la abras.',
        'En Configuración puedes instalar la actualización pendiente cuando quieras.'
      ]
    },
    {
      version: '1.1.0',
      date: '2026-10-19',
      title: 'Más cómoda en el celular y actualizaciones más claras',
      items: [
        'La app busca actualizaciones sola cada vez que vuelves a abrirla, y puedes buscarlas a mano en Configuración.',
        'Los avisos ahora salen abajo, al alcance del pulgar, y los lectores de pantalla los anuncian.',
        'El botón atrás del teléfono y la tecla Esc cierran las ventanas en vez de salir de la app.',
        'Botones más grandes y textos más legibles; los campos ya no hacen zoom al escribir en iPhone.',
        'Confirmaciones claras antes de reiniciar notas o borrar tus datos.',
        'La búsqueda de materias responde más fluida y cada pantalla empieza desde arriba.'
      ]
    },
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

  // True when enough time passed since the last update check. A clock that moved backwards
  // (now < lastCheck) allows a check instead of blocking until the clock catches up.
  function shouldCheckForUpdate(lastCheckMs, nowMs, minIntervalMs) {
    if (typeof lastCheckMs !== 'number' || !Number.isFinite(lastCheckMs)) return true;
    const elapsed = nowMs - lastCheckMs;
    return elapsed < 0 || elapsed >= minIntervalMs;
  }

  // Ask the user only when a previous version was running (not on first install) and we haven't
  // asked yet in this session.
  function shouldPromptForUpdate(hadController, alreadyPrompted) {
    return Boolean(hadController) && !alreadyPrompted;
  }

  const api = { APP_VERSION, CHANGELOG, compareVersions, getUnseenReleases, shouldCheckForUpdate, shouldPromptForUpdate };
  // The running page loads this file once. When an update is pending, app.js loads it again to read the
  // incoming release notes: that second copy must not replace the version in use.
  if (global.StudyTrackVersion) global.StudyTrackVersionIncoming = api;
  else global.StudyTrackVersion = api;
})(typeof window !== 'undefined' ? window : globalThis);
