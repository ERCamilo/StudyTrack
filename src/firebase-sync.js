(function (global) {
  let db = null;
  let auth = null;
  let currentUser = null;
  let syncTimeout = null;
  let authUnsubscribe = null;
  let syncing = false;

  const STORAGE_KEYS = {
    firebaseConfig: 'studytrack_firebase_config',
    localUpdatedAt: 'studytrack_local_updated_at',
    // Baseline = the cloud revision token at the last successful sync (common
    // ancestor). localDirty = there are local edits not yet pushed. Together they
    // let resolveSyncDecision detect a real conflict without trusting device clocks.
    lastSyncedRev: 'studytrack_last_synced_rev',
    localDirty: 'studytrack_local_dirty',
    // The uid that owns the sync state above. If a different account signs in on
    // this device, that state must be reset so one user's baseline/dirty edits
    // never bleed into another account's cloud document.
    lastSyncedUid: 'studytrack_last_synced_uid'
  };

  const DEFAULT_FIREBASE_CONFIG = {
    apiKey: 'AIzaSyA9fQA7AtmTpmX9z_vaCvbz1TwI1xRk7UI',
    authDomain: 'studytrack-ercamilo.firebaseapp.com',
    projectId: 'studytrack-ercamilo',
    storageBucket: 'studytrack-ercamilo.firebasestorage.app',
    messagingSenderId: '1090717602681',
    appId: '1:1090717602681:web:e114bd6b0a9369962095a8'
  };

  function getStorageItem(key) {
    if (global.StudyTrackStorage?.getItem) return global.StudyTrackStorage.getItem(key);
    try {
      return global.localStorage?.getItem(key) || null;
    } catch {
      return null;
    }
  }

  function setStorageItem(key, value) {
    if (global.StudyTrackStorage?.setItem) return global.StudyTrackStorage.setItem(key, value);
    try {
      global.localStorage?.setItem(key, String(value));
      return true;
    } catch {
      return false;
    }
  }

  function removeStorageItem(key) {
    try {
      global.localStorage?.removeItem(key);
    } catch {
      // Storage may be unavailable in private or restricted contexts.
    }
  }

  function notify(message, type = 'info') {
    if (typeof global.showToast === 'function') global.showToast(message, type);
  }

  function getElement(id) {
    return global.document?.getElementById(id) || null;
  }

  function setHidden(id, hidden) {
    const element = getElement(id);
    if (element) element.classList.toggle('hidden', hidden);
  }

  function clearNode(node) {
    if (node) node.replaceChildren();
  }

  function appendIcon(node, className) {
    if (!node || !global.document) return;
    clearNode(node);
    const icon = global.document.createElement('i');
    icon.className = className;
    node.appendChild(icon);
  }

  function appendInitial(node, initial, className) {
    if (!node || !global.document) return;
    clearNode(node);
    const avatar = global.document.createElement('div');
    avatar.className = className;
    avatar.textContent = initial;
    node.appendChild(avatar);
  }

  function appendProfileImage(node, photoURL) {
    if (!node || !global.document) return;
    clearNode(node);
    const image = global.document.createElement('img');
    image.src = photoURL;
    image.className = 'w-full h-full object-cover';
    image.referrerPolicy = 'no-referrer';
    image.alt = 'Foto de perfil';
    node.appendChild(image);
  }

  function getStoredFirebaseConfig() {
    const raw = getStorageItem(STORAGE_KEYS.firebaseConfig);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function showConfigSetupUI() {
    setHidden('firebase-config-setup-box', false);
    setHidden('firebase-session-box', true);
    setHidden('firebase-reset-box', true);
    setHidden('auth-header-btn', true);
  }

  function showSessionUI() {
    setHidden('firebase-config-setup-box', true);
    setHidden('firebase-session-box', false);
    setHidden('firebase-reset-box', false);
    setHidden('auth-header-btn', false);
  }

  async function initFirebase() {
    let config = DEFAULT_FIREBASE_CONFIG;

    const isLocalhost = global.location && (
      global.location.hostname === 'localhost' ||
      global.location.hostname === '127.0.0.1' ||
      global.location.hostname === '[::1]'
    );

    if (isLocalhost) {
      try {
        const response = await global.fetch?.('/.env');
        if (response && response.ok) {
          const text = await response.text();
          const env = {};
          text.split(/\r?\n/).forEach((line) => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
              const parts = trimmed.split('=');
              if (parts.length >= 2) {
                const key = parts[0].trim();
                const val = parts.slice(1).join('=').trim();
                env[key] = val;
              }
            }
          });

          if (env.FIRE_API_KEY || env.FIREBASE_API_KEY) {
            config = {
              apiKey: env.FIREBASE_API_KEY || env.FIRE_API_KEY,
              authDomain: env.FIREBASE_AUTH_DOMAIN || env.FIRE_AUTH_DOMAIN,
              projectId: env.FIREBASE_PROJECT_ID || env.FIRE_PROJECT_ID,
              storageBucket: env.FIREBASE_STORAGE_BUCKET || env.FIRE_STORAGE_BUCKET,
              messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || env.FIRE_MESSAGING_SENDER_ID,
              appId: env.FIREBASE_APP_ID || env.FIRE_APP_ID
            };
          }
        }
      } catch (err) {
        console.warn('Could not load local .env, using default config:', err);
      }
    }

    try {
      if (!global.firebase) throw new Error('Firebase SDK no disponible');

      if (global.firebase.apps.length === 0) {
        global.firebase.initializeApp(config);
      }

      db = global.firebase.firestore();
      auth = global.firebase.auth();

      if (typeof db.enablePersistence === 'function') {
        db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
          console.warn('Firestore persistence error:', err.code);
        });
      }

      showSessionUI();
      setupAuthListener();
      return true;
    } catch (error) {
      console.error('Firebase init failed:', error);
      notify('Error al inicializar Firebase: ' + error.message, 'error');
      return false;
    }
  }

  // Drops the previous identity's sync baseline/dirty state when a different
  // account signs in on the same device. Without this, user A's stale baseline
  // and unsynced edits would be evaluated against user B's cloud document and
  // could be pushed into it (cross-account corruption).
  function resetSyncStateIfIdentityChanged(uid) {
    const previous = getStorageItem(STORAGE_KEYS.lastSyncedUid);
    if (previous && previous !== uid) {
      removeStorageItem(STORAGE_KEYS.lastSyncedRev);
      removeStorageItem(STORAGE_KEYS.localDirty);
      removeStorageItem(STORAGE_KEYS.localUpdatedAt);
    }
    setStorageItem(STORAGE_KEYS.lastSyncedUid, uid);
  }

  function setupAuthListener() {
    if (!auth) return;
    if (authUnsubscribe) authUnsubscribe();
    authUnsubscribe = auth.onAuthStateChanged(async (user) => {
      currentUser = user;
      updateAuthUI(user);
      if (user) {
        resetSyncStateIfIdentityChanged(user.uid);
        await syncCloudData();
      }
    });
  }

  function updateAuthUI(user) {
    const headerBtn = getElement('auth-header-btn');
    const loginBtn = getElement('firebase-login-btn');
    const syncBtn = getElement('firebase-sync-now-btn');
    const logoutBtn = getElement('firebase-logout-btn');
    const userAvatar = getElement('firebase-user-avatar');
    const userName = getElement('firebase-user-name');
    const userEmail = getElement('firebase-user-email');
    const syncStatus = getElement('firebase-sync-status');

    if (!headerBtn) return;

    if (user) {
      loginBtn?.classList.add('hidden');
      syncBtn?.classList.remove('hidden');
      logoutBtn?.classList.remove('hidden');

      if (userName) userName.textContent = user.displayName || 'Usuario StudyTrack';
      if (userEmail) userEmail.textContent = user.email || '';
      if (syncStatus) {
        syncStatus.textContent = 'Conectado';
        syncStatus.className = 'font-bold text-emerald-600';
      }

      if (user.photoURL) {
        appendProfileImage(userAvatar, user.photoURL);
        appendProfileImage(headerBtn, user.photoURL);
      } else {
        const initial = (user.displayName || user.email || '?').charAt(0).toUpperCase();
        appendInitial(userAvatar, initial, 'w-full h-full flex items-center justify-center bg-primary-600 text-white font-bold text-lg');
        appendInitial(headerBtn, initial, 'w-full h-full flex items-center justify-center bg-primary-600 text-white font-bold text-xs');
      }
      return;
    }

    loginBtn?.classList.remove('hidden');
    syncBtn?.classList.add('hidden');
    logoutBtn?.classList.add('hidden');

    if (userName) userName.textContent = 'Usuario No Identificado';
    if (userEmail) userEmail.textContent = 'Inicia sesión para sincronizar';
    if (syncStatus) {
      syncStatus.textContent = 'No autenticado';
      syncStatus.className = 'font-bold text-slate-500';
    }

    appendIcon(userAvatar, 'fas fa-user text-slate-400 text-lg');
    appendIcon(headerBtn, 'fas fa-user text-xs sm:text-sm text-slate-500 dark:text-slate-400');
  }

  // Unique, clock-independent revision token for each cloud write. A client UUID
  // works offline and never collides, so baseline comparison stays correct even
  // when two devices push while disconnected.
  function makeRev() {
    try {
      if (global.crypto?.randomUUID) return global.crypto.randomUUID();
    } catch {
      // crypto may be unavailable in restricted contexts; fall through.
    }
    return 'rev-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  }

  // The revision token of a cloud document. Falls back to legacy timestamp fields
  // for documents written before revision tracking existed, so the upgrade is
  // seamless and never forces a spurious conflict.
  function cloudRevOf(state) {
    if (!state) return null;
    if (state.rev != null) return state.rev;
    if (state.updatedAtClient) return state.updatedAtClient;
    if (typeof state.updatedAt === 'string') return state.updatedAt;
    // Pre-rev docs stored a Firestore Timestamp object in updatedAt (never a
    // string on read). Coerce it to a stable, comparable token so the baseline
    // can advance and these docs upgrade without a permanent spurious conflict.
    if (state.updatedAt && typeof state.updatedAt.toMillis === 'function') return 'ts-' + state.updatedAt.toMillis();
    if (state.updatedAt && typeof state.updatedAt.seconds === 'number') return 'ts-' + state.updatedAt.seconds;
    return null;
  }

  function getBaseline() {
    return getStorageItem(STORAGE_KEYS.lastSyncedRev) || null;
  }

  function isLocalDirty() {
    return getStorageItem(STORAGE_KEYS.localDirty) === 'true';
  }

  // Records that local and cloud now agree on `rev`: it becomes the new common
  // ancestor and local is no longer dirty. Called after every push, pull, or
  // resolved conflict.
  function markSynced(rev) {
    if (rev != null) setStorageItem(STORAGE_KEYS.lastSyncedRev, rev);
    setStorageItem(STORAGE_KEYS.localDirty, 'false');
  }

  // Pure 3-way merge decision (git-style), independent of device clocks.
  // Designed to stay correct if it is later evaluated per data section instead of
  // per whole document, so evolving to section-level sync is an extension, not a
  // rewrite.
  function resolveSyncDecision({ cloudExists, cloudRev, baseline, localDirty }) {
    if (!cloudExists) return 'push';                       // nothing in cloud to lose
    if (baseline == null) return localDirty ? 'conflict' : 'pull'; // no common ancestor known
    if (cloudRev === baseline) return localDirty ? 'push' : 'in-sync'; // only local could differ
    return localDirty ? 'conflict' : 'pull';               // cloud moved: pull, or conflict if local moved too
  }

  function toDisplayDate(state) {
    const value = state?.updatedAtClient
      || (typeof state?.updatedAt === 'string' ? state.updatedAt : null)
      || (typeof state?.updatedAt?.toDate === 'function' ? state.updatedAt.toDate().toISOString() : null);
    return value ? new Date(value).toLocaleString() : 'Desconocida';
  }

  function getLocalState() {
    return {
      curriculum: StudyTrackStorage.getJson(StudyTrackStorage.KEYS.curriculum, null),
      progress: StudyTrackStorage.getJson(StudyTrackStorage.KEYS.progress, {}),
      schedule: StudyTrackStorage.getJson(StudyTrackStorage.KEYS.schedule, {}),
      gradeScale: StudyTrackStorage.getJson(StudyTrackStorage.KEYS.gradeScale, null),
      allowSkipPrereqs: StudyTrackStorage.getBoolean(StudyTrackStorage.KEYS.allowSkipPrerequisites, true),
      maxEnrolledSubjects: StudyTrackStorage.getNumber(StudyTrackStorage.KEYS.maxEnrolledSubjects, 10),
      passingGrade: StudyTrackStorage.getFloat(StudyTrackStorage.KEYS.passingGrade, 70),
      darkMode: StudyTrackStorage.getBoolean(StudyTrackStorage.KEYS.darkMode, false),
      scheduleViewType: StudyTrackStorage.getItem(StudyTrackStorage.KEYS.scheduleViewType) || 'list',
      // No fabricated timestamp: a device that never synced must lose to existing
      // cloud data so logging in on a fresh device pulls down instead of overwriting.
      updatedAt: getStorageItem(STORAGE_KEYS.localUpdatedAt) || null
    };
  }

  function applyStateLocally(state) {
    if (!state || typeof state !== 'object') return;

    if (Object.hasOwn(state, 'curriculum')) StudyTrackStorage.setJson(StudyTrackStorage.KEYS.curriculum, state.curriculum);
    if (Object.hasOwn(state, 'progress')) StudyTrackStorage.setJson(StudyTrackStorage.KEYS.progress, state.progress);
    if (Object.hasOwn(state, 'schedule')) StudyTrackStorage.setJson(StudyTrackStorage.KEYS.schedule, state.schedule);
    if (Object.hasOwn(state, 'gradeScale')) StudyTrackStorage.setJson(StudyTrackStorage.KEYS.gradeScale, state.gradeScale);

    StudyTrackStorage.setBoolean(StudyTrackStorage.KEYS.allowSkipPrerequisites, state.allowSkipPrereqs !== false);
    StudyTrackStorage.setNumber(StudyTrackStorage.KEYS.maxEnrolledSubjects, state.maxEnrolledSubjects || 10);
    StudyTrackStorage.setItem(StudyTrackStorage.KEYS.passingGrade, state.passingGrade ?? 70);
    StudyTrackStorage.setBoolean(StudyTrackStorage.KEYS.darkMode, !!state.darkMode);
    if (state.scheduleViewType) StudyTrackStorage.setItem(StudyTrackStorage.KEYS.scheduleViewType, state.scheduleViewType);
    // Prefer the client ISO stamp; the server `updatedAt` may be a Firestore
    // Timestamp object that must not be stringified into storage.
    const localStamp = state.updatedAtClient || (typeof state.updatedAt === 'string' ? state.updatedAt : null);
    if (localStamp) setStorageItem(STORAGE_KEYS.localUpdatedAt, localStamp);
  }

  async function pushToCloud() {
    if (!db || !currentUser || syncing) return;
    syncing = true;
    const syncStatus = getElement('firebase-sync-status');
    if (syncStatus) {
      syncStatus.textContent = 'Sincronizando...';
      syncStatus.className = 'font-bold text-primary-500 animate-pulse';
    }

    try {
      const rev = makeRev();
      const nowIso = new Date().toISOString();
      const state = getLocalState();
      state.rev = rev;
      state.updatedAtClient = nowIso;
      // Server-authoritative time for display/ordering; falls back to the client
      // stamp if the SDK is unavailable. The conflict DECISION never depends on it.
      state.updatedAt = global.firebase?.firestore?.FieldValue?.serverTimestamp?.() ?? nowIso;
      setStorageItem(STORAGE_KEYS.localUpdatedAt, nowIso);

      await db.collection('users').doc(currentUser.uid).set(state);

      // Cloud now holds our revision: it is the new common ancestor, local is clean.
      markSynced(rev);

      if (syncStatus) {
        syncStatus.textContent = 'Sincronizado';
        syncStatus.className = 'font-bold text-emerald-600';
      }
    } catch (error) {
      console.error('Cloud push failed:', error);
      if (syncStatus) {
        syncStatus.textContent = 'Error al sincronizar';
        syncStatus.className = 'font-bold text-red-600';
      }
      notify('Error al subir datos: ' + error.message, 'error');
    } finally {
      syncing = false;
    }
  }

  // Order-independent serialization so two equivalent states with keys in a
  // different order are not reported as a spurious conflict.
  function stableStringify(value) {
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
    }
    return JSON.stringify(value);
  }

  function statesDiffer(cloudState, localState) {
    const keysToCompare = ['curriculum', 'progress', 'schedule', 'gradeScale', 'allowSkipPrereqs', 'maxEnrolledSubjects', 'passingGrade', 'darkMode', 'scheduleViewType'];
    return keysToCompare.some((key) => stableStringify(cloudState?.[key]) !== stableStringify(localState?.[key]));
  }

  async function syncCloudData() {
    if (!db || !currentUser || syncing) return;
    syncing = true;

    const syncStatus = getElement('firebase-sync-status');
    if (syncStatus) {
      syncStatus.textContent = 'Verificando nube...';
      syncStatus.className = 'font-bold text-primary-500 animate-pulse';
    }

    try {
      const doc = await db.collection('users').doc(currentUser.uid).get();
      const cloudExists = doc.exists;
      const cloudState = cloudExists ? doc.data() : null;
      const localState = getLocalState();

      // Identical content: no write needed (saves Firestore quota at scale), just
      // reconcile the baseline and clear the dirty flag.
      if (cloudExists && !statesDiffer(cloudState, localState)) {
        markSynced(cloudRevOf(cloudState) || getBaseline());
        if (syncStatus) {
          syncStatus.textContent = 'Sincronizado';
          syncStatus.className = 'font-bold text-emerald-600';
        }
        return;
      }

      const decision = resolveSyncDecision({
        cloudExists,
        cloudRev: cloudRevOf(cloudState),
        baseline: getBaseline(),
        localDirty: isLocalDirty()
      });

      if (decision === 'push') {
        syncing = false;
        await pushToCloud();
        return;
      }

      if (decision === 'pull') {
        applyStateLocally(cloudState);
        markSynced(cloudRevOf(cloudState));
        if (syncStatus) {
          syncStatus.textContent = 'Sincronizado';
          syncStatus.className = 'font-bold text-emerald-600';
        }
        notify('Datos actualizados desde la nube', 'success');
        if (typeof global.initApp === 'function') global.initApp();
        return;
      }

      if (decision === 'in-sync') {
        markSynced(cloudRevOf(cloudState) || getBaseline());
        if (syncStatus) {
          syncStatus.textContent = 'Sincronizado';
          syncStatus.className = 'font-bold text-emerald-600';
        }
        return;
      }

      // decision === 'conflict': both sides diverged from the common ancestor.
      // Never auto-resolve — let the user choose which version to keep.
      showConflictModal(cloudState, localState);
    } catch (error) {
      console.error('Sync failed:', error);
      if (syncStatus) {
        syncStatus.textContent = 'Error de sincronización';
        syncStatus.className = 'font-bold text-red-600';
      }
      notify('Error al sincronizar con la nube: ' + error.message, 'error');
    } finally {
      syncing = false;
    }
  }

  function createElement(tag, className, text = '') {
    const element = global.document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function createConflictChoice({ id, eyebrow, title, dateText, onClick }) {
    const button = createElement('button', 'w-full text-left p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:border-primary-500 dark:hover:border-primary-500 hover:bg-primary-500/5 transition-all flex flex-col gap-1');
    button.id = id;
    button.type = 'button';
    button.append(
      createElement('span', 'text-xs uppercase font-bold text-primary-500', eyebrow),
      createElement('span', 'text-sm font-bold text-slate-700 dark:text-slate-200', title),
      createElement('span', 'text-[11px] text-slate-400 dark:text-slate-500', `Última modificación: ${dateText}`)
    );
    button.onclick = onClick;
    return button;
  }

  function showConflictModal(cloudState, localState) {
    if (!global.document?.body) return;
    const modalId = 'sync-conflict-modal';
    const existing = getElement(modalId);
    if (existing) existing.remove();

    const cloudDate = toDisplayDate(cloudState);
    const localDate = toDisplayDate(localState);

    const modal = createElement('div', 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4');
    modal.id = modalId;

    const panel = createElement('div', 'bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800 animate-scale-up');
    const header = createElement('div', 'flex items-center gap-3 text-amber-500 mb-4');
    header.append(
      createElement('i', 'fas fa-exclamation-triangle text-2xl'),
      createElement('h3', 'text-lg font-extrabold text-slate-900 dark:text-white', 'Conflicto de Sincronización')
    );

    const description = createElement('p', 'text-sm text-slate-500 dark:text-slate-400 mb-5 leading-normal', 'Se han detectado cambios discrepantes entre la nube y tu dispositivo actual. Selecciona cuál versión deseas conservar.');

    const choices = createElement('div', 'space-y-3 mb-6');
    choices.append(
      createConflictChoice({
        id: 'btn-choose-cloud',
        eyebrow: 'Usar datos de la nube',
        title: 'Descargar y reemplazar local',
        dateText: cloudDate,
        onClick: () => {
          applyStateLocally(cloudState);
          markSynced(cloudRevOf(cloudState));
          modal.remove();
          notify('Datos descargados de la nube', 'success');
          if (typeof global.initApp === 'function') global.initApp();
        }
      }),
      createConflictChoice({
        id: 'btn-choose-local',
        eyebrow: 'Usar datos locales',
        title: 'Sobrescribir datos en la nube',
        dateText: localDate,
        onClick: async () => {
          modal.remove();
          await pushToCloud();
          notify('Datos locales subidos a la nube', 'success');
        }
      })
    );

    const footer = createElement('div', 'flex gap-2');
    const cancel = createElement('button', 'flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors', 'Decidir luego');
    cancel.id = 'btn-conflict-cancel';
    cancel.type = 'button';
    cancel.onclick = () => modal.remove();
    footer.appendChild(cancel);

    panel.append(header, description, choices, footer);
    modal.appendChild(panel);
    global.document.body.appendChild(modal);
  }

  function handleLocalModification() {
    setStorageItem(STORAGE_KEYS.localUpdatedAt, new Date().toISOString());
    setStorageItem(STORAGE_KEYS.localDirty, 'true');

    if (!db || !currentUser) return;
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(async () => {
      // Route through syncCloudData (not pushToCloud) so the auto-save still
      // respects the 3-way conflict check. A blind push here would silently
      // overwrite another device's newer edits — the exact bug Phase 1 kills.
      await syncCloudData();
    }, 2000);
  }

  global.clearFirebaseConfig = function () {
    if (confirm('¿Cerrar sesión y desconectar la sincronización?')) {
      if (auth) auth.signOut().catch(console.error);
      removeStorageItem(STORAGE_KEYS.localUpdatedAt);
      removeStorageItem(STORAGE_KEYS.lastSyncedRev);
      removeStorageItem(STORAGE_KEYS.localDirty);
      removeStorageItem(STORAGE_KEYS.lastSyncedUid);
      global.location?.reload();
    }
  };

  global.loginWithGoogle = async function () {
    if (!auth) {
      notify('Firebase no inicializado', 'error');
      return;
    }

    const provider = new global.firebase.auth.GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');

    try {
      const syncStatus = getElement('firebase-sync-status');
      if (syncStatus) syncStatus.textContent = 'Autenticando...';
      await auth.signInWithPopup(provider);
      notify('Sesión iniciada con Google', 'success');
    } catch (error) {
      console.warn('Popup blocked or failed, trying redirect...', error);
      try {
        await auth.signInWithRedirect(provider);
      } catch (redirectError) {
        notify('Error de autenticación: ' + redirectError.message, 'error');
      }
    }
  };

  global.logoutFirebase = async function () {
    if (!auth) return;
    if (confirm('¿Cerrar sesión de Google? Tus datos locales se conservarán en este navegador.')) {
      try {
        await auth.signOut();
        notify('Sesión cerrada', 'info');
      } catch (error) {
        notify('Error: ' + error.message, 'error');
      }
    }
  };

  global.forceSyncCloud = async function () {
    if (!db || !currentUser) return;
    notify('Sincronizando...', 'info');
    await syncCloudData();
  };

  global.openGoogleSyncSettings = function () {
    if (typeof global.openSettings === 'function') {
      global.openSettings();
      setTimeout(() => {
        if (typeof global.scrollSettingsSection === 'function') {
          global.scrollSettingsSection('settings-section-cloud');
        } else {
          const cloudEl = getElement('settings-section-cloud');
          if (cloudEl) cloudEl.scrollIntoView({ behavior: 'smooth' });
        }
      }, 200);
    }
  };

  // ── Offline Banner ─────────────────────────────────
  function setupOfflineBanner() {
    const banner = document.getElementById('offline-banner');
    if (!banner) return;

    // Transition styles: slide down/up with opacity
    banner.style.transition = 'max-height 300ms ease, opacity 300ms ease, margin 300ms ease';
    banner.style.overflow = 'hidden';

    function showBanner() {
      banner.classList.remove('hidden');
      // Force reflow before animating
      banner.offsetHeight;
      banner.style.maxHeight = '60px';
      banner.style.opacity = '1';
      banner.style.marginTop = '8px';
      banner.style.marginBottom = '0';
    }

    function hideBanner() {
      banner.style.maxHeight = '0';
      banner.style.opacity = '0';
      banner.style.marginTop = '0';
      banner.style.marginBottom = '0';
      setTimeout(() => banner.classList.add('hidden'), 300);
    }

    global.addEventListener('offline', showBanner);
    global.addEventListener('online', hideBanner);

    // Initial check
    if (!navigator.onLine) showBanner();
  }

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('load', () => {
      initFirebase();
      setupOfflineBanner();
    });
  }

  global.StudyTrackFirebaseSync = {
    STORAGE_KEYS,
    initFirebase,
    syncCloudData,
    pushToCloud,
    getLocalState,
    applyStateLocally,
    getStoredFirebaseConfig,
    updateAuthUI,
    showConflictModal,
    statesDiffer,
    resolveSyncDecision,
    cloudRevOf,
    markSynced,
    notifyChange: handleLocalModification
  };
})(typeof window !== 'undefined' ? window : globalThis);
