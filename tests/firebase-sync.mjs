import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const store = new Map();
const elements = new Map();

class TestElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.value = '';
    this.className = '';
    this.textContent = '';
    this.onclick = null;
    this.type = '';
    this.src = '';
    this.alt = '';
    this.referrerPolicy = '';

    Object.defineProperty(this, 'id', {
      get: () => this._id || '',
      set: (value) => {
        this._id = value;
        if (value) elements.set(value, this);
      }
    });

    this.classList = {
      add: (...classes) => {
        const current = new Set(this.className.split(/\s+/).filter(Boolean));
        classes.forEach((className) => current.add(className));
        this.className = [...current].join(' ');
      },
      remove: (...classes) => {
        const current = new Set(this.className.split(/\s+/).filter(Boolean));
        classes.forEach((className) => current.delete(className));
        this.className = [...current].join(' ');
      },
      toggle: (className, force) => {
        const current = new Set(this.className.split(/\s+/).filter(Boolean));
        const shouldAdd = force === undefined ? !current.has(className) : Boolean(force);
        if (shouldAdd) current.add(className);
        else current.delete(className);
        this.className = [...current].join(' ');
      }
    };
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  remove() {
    if (this.id) elements.delete(this.id);
  }

  scrollIntoView() {}
}

function addElement(id, tagName = 'div') {
  const element = new TestElement(tagName);
  element.id = id;
  elements.set(id, element);
  return element;
}

[
  'firebase-config-input',
  'firebase-config-setup-box',
  'firebase-session-box',
  'firebase-reset-box',
  'auth-header-btn',
  'firebase-login-btn',
  'firebase-sync-now-btn',
  'firebase-logout-btn',
  'firebase-user-avatar',
  'firebase-user-name',
  'firebase-user-email',
  'firebase-sync-status',
  'settings-section-cloud'
].forEach((id) => addElement(id));

const context = {
  console,
  setTimeout,
  clearTimeout,
  confirm: () => true,
  location: { reload() {} },
  addEventListener: () => {},
  localStorage: {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear()
  },
  document: {
    body: new TestElement('body'),
    createElement: (tagName) => new TestElement(tagName),
    getElementById: (id) => elements.get(id) || null
  },
  showToast: (message, type) => {
    context.lastToast = { message, type };
  },
  openSettings: () => {
    context.settingsOpened = true;
  },
  scrollSettingsSection: (sectionId) => {
    context.scrolledSection = sectionId;
  }
};
context.globalThis = context;
context.window = context;

vm.createContext(context);
vm.runInContext(fs.readFileSync('src/storage.js', 'utf8'), context, { filename: 'src/storage.js' });
vm.runInContext(fs.readFileSync('src/firebase-sync.js', 'utf8'), context, { filename: 'src/firebase-sync.js' });

const { StudyTrackFirebaseSync, StudyTrackStorage } = context;
assert.ok(StudyTrackFirebaseSync, 'Firebase sync module should export a public API');

store.set(StudyTrackFirebaseSync.STORAGE_KEYS.firebaseConfig, '{');
assert.equal(StudyTrackFirebaseSync.getStoredFirebaseConfig(), null);

const validConfig = { apiKey: 'demo-key', projectId: 'demo-project' };
store.set(StudyTrackFirebaseSync.STORAGE_KEYS.firebaseConfig, JSON.stringify(validConfig));
assert.equal(JSON.stringify(StudyTrackFirebaseSync.getStoredFirebaseConfig()), JSON.stringify(validConfig));

StudyTrackStorage.setJson(StudyTrackStorage.KEYS.curriculum, { metadata: { career_name: 'Demo' }, periods: [] });
StudyTrackStorage.setJson(StudyTrackStorage.KEYS.progress, { A: { status: 'approved' } });
StudyTrackStorage.setJson(StudyTrackStorage.KEYS.schedule, { A: [{ day: 'lunes' }] });
StudyTrackStorage.setBoolean(StudyTrackStorage.KEYS.allowSkipPrerequisites, false);
StudyTrackStorage.setNumber(StudyTrackStorage.KEYS.maxEnrolledSubjects, 8);
StudyTrackStorage.setItem(StudyTrackStorage.KEYS.scheduleViewType, 'grid');

const state = StudyTrackFirebaseSync.getLocalState();
assert.equal(state.curriculum.metadata.career_name, 'Demo');
assert.equal(state.progress.A.status, 'approved');
assert.equal(state.schedule.A[0].day, 'lunes');
assert.equal(state.allowSkipPrereqs, false);
assert.equal(state.maxEnrolledSubjects, 8);
assert.equal(state.scheduleViewType, 'grid');

StudyTrackFirebaseSync.applyStateLocally({
  progress: {},
  schedule: {},
  allowSkipPrereqs: true,
  maxEnrolledSubjects: 3,
  darkMode: true,
  scheduleViewType: 'list',
  updatedAt: '2026-05-21T00:00:00.000Z'
});
assert.equal(JSON.stringify(StudyTrackStorage.getJson(StudyTrackStorage.KEYS.progress)), '{}');
assert.equal(JSON.stringify(StudyTrackStorage.getJson(StudyTrackStorage.KEYS.schedule)), '{}');
assert.equal(StudyTrackStorage.getBoolean(StudyTrackStorage.KEYS.allowSkipPrerequisites), true);
assert.equal(StudyTrackStorage.getNumber(StudyTrackStorage.KEYS.maxEnrolledSubjects), 3);
assert.equal(store.get(StudyTrackFirebaseSync.STORAGE_KEYS.localUpdatedAt), '2026-05-21T00:00:00.000Z');

StudyTrackFirebaseSync.updateAuthUI({ displayName: 'Ana', email: 'ana@example.com', photoURL: 'https://example.com/photo.png' });
assert.equal(elements.get('firebase-user-name').textContent, 'Ana');
assert.equal(elements.get('firebase-user-email').textContent, 'ana@example.com');
assert.equal(elements.get('firebase-sync-status').textContent, 'Conectado');
assert.equal(elements.get('firebase-user-avatar').children[0].tagName, 'img');
assert.equal(elements.get('auth-header-btn').children[0].src, 'https://example.com/photo.png');

StudyTrackFirebaseSync.updateAuthUI(null);
assert.equal(elements.get('firebase-user-email').textContent, 'Inicia sesión para sincronizar');
assert.equal(elements.get('firebase-sync-status').textContent, 'No autenticado');
assert.equal(elements.get('auth-header-btn').children[0].tagName, 'i');

StudyTrackFirebaseSync.showConflictModal(
  { updatedAt: '2026-05-21T00:00:00.000Z', progress: { cloud: true }, schedule: {} },
  { updatedAt: '2026-05-21T00:00:00.000Z', progress: { local: true }, schedule: {} }
);
assert.ok(elements.get('sync-conflict-modal'), 'Conflict modal should be created with DOM APIs');
assert.equal(elements.get('btn-conflict-cancel').textContent, 'Decidir luego');

assert.ok(!fs.readFileSync('src/firebase-sync.js', 'utf8').includes('innerHTML'));
assert.ok(!fs.readFileSync('src/firebase-sync.js', 'utf8').includes('insertAdjacentHTML'));

console.log('Firebase sync checks passed');
