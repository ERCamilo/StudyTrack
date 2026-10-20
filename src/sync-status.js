(function (global) {
  // Pure model for the header sync indicator (the dot on the account button). The app feeds it the
  // sync facts and renders the result; it never touches the DOM or the network.
  const LABELS = {
    none: '',
    syncing: 'Sincronizando…',
    error: 'Error al sincronizar',
    offline: 'Sin conexión: cambios pendientes',
    pending: 'Cambios por sincronizar',
    synced: 'Todo sincronizado'
  };

  // Most urgent state wins: syncing > error > offline with changes > pending changes > synced.
  // Offline with nothing pending is not an alarm. Not signed in means no indicator at all.
  function getSyncIndicator(facts) {
    const f = facts || {};
    let state = 'synced';
    if (!f.signedIn) state = 'none';
    else if (f.syncing) state = 'syncing';
    else if (f.error) state = 'error';
    else if (f.dirty && f.online === false) state = 'offline';
    else if (f.dirty) state = 'pending';
    return { state, label: LABELS[state] };
  }

  global.StudyTrackSyncStatus = { getSyncIndicator };
})(typeof window !== 'undefined' ? window : globalThis);
