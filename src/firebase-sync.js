(function (global) {
  let db = null;
  let auth = null;
  let currentUser = null;
  let syncTimeout = null;
  let authUnsubscribe = null;

  const STORAGE_KEYS = {
    firebaseConfig: 'studytrack_firebase_config',
    localUpdatedAt: 'studytrack_local_updated_at'
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

  function initFirebase() {
    const config = getStoredFirebaseConfig();
    const inputArea = getElement('firebase-config-input');
    if (inputArea && config) inputArea.value = JSON.stringify(config, null, 2);

    if (!config) {
      showConfigSetupUI();
      return false;
    }

    try {
      if (!global.firebase) throw new Error('Firebase SDK no disponible');

      if (global.firebase.apps.length === 0) {
        global.firebase.initializeApp(config);
      }

      db = global.firebase.firestore();
      auth = global.firebase.auth();

      if (typeof db.enablePersistence === 'function') {
        db.enablePersistence().catch((err) => {
          console.warn('Firestore persistence error:', err.code);
        });
      }

      showSessionUI();
      setupAuthListener();
      return true;
    } catch (error) {
      console.error('Firebase init failed:', error);
      notify('Error al inicializar Firebase: ' + error.message, 'error');
      showConfigSetupUI();
      return false;
    }
  }

  function setupAuthListener() {
    if (!auth) return;
    if (authUnsubscribe) authUnsubscribe();
    authUnsubscribe = auth.onAuthStateChanged(async (user) => {
      currentUser = user;
      updateAuthUI(user);
      if (user) await syncCloudData();
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

  function getLocalState() {
    return {
      curriculum: StudyTrackStorage.getJson(StudyTrackStorage.KEYS.curriculum, null),
      progress: StudyTrackStorage.getJson(StudyTrackStorage.KEYS.progress, {}),
      schedule: StudyTrackStorage.getJson(StudyTrackStorage.KEYS.schedule, {}),
      gradeScale: StudyTrackStorage.getJson(StudyTrackStorage.KEYS.gradeScale, null),
      allowSkipPrereqs: StudyTrackStorage.getBoolean(StudyTrackStorage.KEYS.allowSkipPrerequisites, true),
      maxEnrolledSubjects: StudyTrackStorage.getNumber(StudyTrackStorage.KEYS.maxEnrolledSubjects, 10),
      darkMode: StudyTrackStorage.getBoolean(StudyTrackStorage.KEYS.darkMode, false),
      scheduleViewType: StudyTrackStorage.getItem(StudyTrackStorage.KEYS.scheduleViewType) || 'list',
      updatedAt: getStorageItem(STORAGE_KEYS.localUpdatedAt) || new Date().toISOString()
    };
  }

  function applyStateLocally(state) {
    if (!state || typeof state !== 'object') return;

    if (Object.hasOwn(state, 'curriculum') && state.curriculum) StudyTrackStorage.setJson(StudyTrackStorage.KEYS.curriculum, state.curriculum);
    if (Object.hasOwn(state, 'progress') && state.progress) StudyTrackStorage.setJson(StudyTrackStorage.KEYS.progress, state.progress);
    if (Object.hasOwn(state, 'schedule') && state.schedule) StudyTrackStorage.setJson(StudyTrackStorage.KEYS.schedule, state.schedule);
    if (Object.hasOwn(state, 'gradeScale') && state.gradeScale) StudyTrackStorage.setJson(StudyTrackStorage.KEYS.gradeScale, state.gradeScale);

    StudyTrackStorage.setBoolean(StudyTrackStorage.KEYS.allowSkipPrerequisites, state.allowSkipPrereqs !== false);
    StudyTrackStorage.setNumber(StudyTrackStorage.KEYS.maxEnrolledSubjects, state.maxEnrolledSubjects || 10);
    StudyTrackStorage.setBoolean(StudyTrackStorage.KEYS.darkMode, !!state.darkMode);
    if (state.scheduleViewType) StudyTrackStorage.setItem(StudyTrackStorage.KEYS.scheduleViewType, state.scheduleViewType);
    if (state.updatedAt) setStorageItem(STORAGE_KEYS.localUpdatedAt, state.updatedAt);
  }

  async function pushToCloud() {
    if (!db || !currentUser) return;
    const syncStatus = getElement('firebase-sync-status');
    if (syncStatus) {
      syncStatus.textContent = 'Sincronizando...';
      syncStatus.className = 'font-bold text-primary-500 animate-pulse';
    }

    try {
      const state = getLocalState();
      state.updatedAt = new Date().toISOString();
      setStorageItem(STORAGE_KEYS.localUpdatedAt, state.updatedAt);

      await db.collection('users').doc(currentUser.uid).set(state);

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
    }
  }

  function statesDiffer(cloudState, localState) {
    const keysToCompare = ['curriculum', 'progress', 'schedule', 'gradeScale', 'allowSkipPrereqs', 'maxEnrolledSubjects', 'darkMode', 'scheduleViewType'];
    return keysToCompare.some((key) => JSON.stringify(cloudState?.[key]) !== JSON.stringify(localState?.[key]));
  }

  async function syncCloudData() {
    if (!db || !currentUser) return;

    const syncStatus = getElement('firebase-sync-status');
    if (syncStatus) {
      syncStatus.textContent = 'Verificando nube...';
      syncStatus.className = 'font-bold text-primary-500 animate-pulse';
    }

    try {
      const doc = await db.collection('users').doc(currentUser.uid).get();
      if (!doc.exists) {
        await pushToCloud();
        return;
      }

      const cloudState = doc.data();
      const localState = getLocalState();

      if (!statesDiffer(cloudState, localState)) {
        if (syncStatus) {
          syncStatus.textContent = 'Sincronizado';
          syncStatus.className = 'font-bold text-emerald-600';
        }
        return;
      }

      const localTime = new Date(localState.updatedAt).getTime() || 0;
      const cloudTime = new Date(cloudState.updatedAt || 0).getTime() || 0;

      if (cloudTime > localTime) {
        applyStateLocally(cloudState);
        if (syncStatus) {
          syncStatus.textContent = 'Sincronizado';
          syncStatus.className = 'font-bold text-emerald-600';
        }
        notify('Datos actualizados desde la nube', 'success');
        if (typeof global.initApp === 'function') global.initApp();
      } else if (localTime > cloudTime) {
        await pushToCloud();
      } else {
        showConflictModal(cloudState, localState);
      }
    } catch (error) {
      console.error('Sync failed:', error);
      if (syncStatus) {
        syncStatus.textContent = 'Error de sincronización';
        syncStatus.className = 'font-bold text-red-600';
      }
      notify('Error al sincronizar con la nube: ' + error.message, 'error');
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

    const cloudDate = cloudState.updatedAt ? new Date(cloudState.updatedAt).toLocaleString() : 'Desconocida';
    const localDate = localState.updatedAt ? new Date(localState.updatedAt).toLocaleString() : 'Desconocida';

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

    if (!db || !currentUser) return;
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(async () => {
      await pushToCloud();
    }, 2000);
  }

  function setupLocalInterceptors() {
    const wrapFunction = (name) => {
      if (typeof global[name] === 'function' && !global[name].__studyTrackSyncWrapped) {
        const original = global[name];
        const wrapped = function (...args) {
          const result = original.apply(this, args);
          handleLocalModification();
          return result;
        };
        wrapped.__studyTrackSyncWrapped = true;
        global[name] = wrapped;
      }
    };

    wrapFunction('saveCurriculum');
    wrapFunction('saveUserProgress');
    wrapFunction('saveScheduleData');
    wrapFunction('updateEnrollmentLimit');

    const originalShowToast = global.showToast;
    if (typeof originalShowToast === 'function' && !originalShowToast.__studyTrackSyncWrapped) {
      const wrappedToast = function (msg, type) {
        const result = originalShowToast.apply(this, arguments);
        if (type === 'success' && (msg.includes('escala') || msg.includes('rango') || msg.includes('reiniciado') || msg.includes('Cargado') || msg.includes('Éxito'))) {
          handleLocalModification();
        }
        return result;
      };
      wrappedToast.__studyTrackSyncWrapped = true;
      global.showToast = wrappedToast;
    }
  }

  global.saveFirebaseConfig = function () {
    const input = getElement('firebase-config-input');
    const value = input?.value.trim() || '';
    if (!value) {
      notify('Ingresa credenciales válidas', 'error');
      return;
    }

    try {
      const config = JSON.parse(value);
      if (!config.apiKey || !config.projectId) throw new Error('Falta apiKey o projectId');

      setStorageItem(STORAGE_KEYS.firebaseConfig, JSON.stringify(config));
      notify('Configuración guardada', 'success');
      initFirebase();
    } catch (error) {
      notify('JSON inválido: ' + error.message, 'error');
    }
  };

  global.clearFirebaseConfig = function () {
    if (confirm('¿Estás seguro de que deseas borrar la configuración de Firebase y cerrar sesión?')) {
      if (auth) auth.signOut().catch(console.error);
      removeStorageItem(STORAGE_KEYS.firebaseConfig);
      removeStorageItem(STORAGE_KEYS.localUpdatedAt);
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

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('load', () => {
      initFirebase();
      setupLocalInterceptors();
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
    setupLocalInterceptors
  };
})(typeof window !== 'undefined' ? window : globalThis);
