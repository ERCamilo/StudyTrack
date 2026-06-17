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
StudyTrackStorage.setItem(StudyTrackStorage.KEYS.passingGrade, '65.5');
StudyTrackStorage.setItem(StudyTrackStorage.KEYS.scheduleViewType, 'grid');

const state = StudyTrackFirebaseSync.getLocalState();
assert.equal(state.curriculum.metadata.career_name, 'Demo');
assert.equal(state.progress.A.status, 'approved');
assert.equal(state.schedule.A[0].day, 'lunes');
assert.equal(state.allowSkipPrereqs, false);
assert.equal(state.maxEnrolledSubjects, 8);
assert.equal(state.passingGrade, 65.5, 'passingGrade should sync as a float');
assert.equal(state.scheduleViewType, 'grid');
// A device that never synced must report no local timestamp so cloud data wins on
// first login from a fresh device, instead of overwriting the cloud with empty state.
assert.equal(state.updatedAt, null, 'updatedAt should be null when localUpdatedAt was never stored');

StudyTrackFirebaseSync.applyStateLocally({
  progress: {},
  schedule: {},
  allowSkipPrereqs: true,
  maxEnrolledSubjects: 3,
  passingGrade: 60,
  darkMode: true,
  scheduleViewType: 'list',
  updatedAt: '2026-05-21T00:00:00.000Z'
});
assert.equal(JSON.stringify(StudyTrackStorage.getJson(StudyTrackStorage.KEYS.progress)), '{}');
assert.equal(JSON.stringify(StudyTrackStorage.getJson(StudyTrackStorage.KEYS.schedule)), '{}');
assert.equal(StudyTrackStorage.getBoolean(StudyTrackStorage.KEYS.allowSkipPrerequisites), true);
assert.equal(StudyTrackStorage.getNumber(StudyTrackStorage.KEYS.maxEnrolledSubjects), 3);
assert.equal(StudyTrackStorage.getFloat(StudyTrackStorage.KEYS.passingGrade), 60, 'passingGrade should apply from cloud state');
assert.equal(store.get(StudyTrackFirebaseSync.STORAGE_KEYS.localUpdatedAt), '2026-05-21T00:00:00.000Z');

// Verify null values propagate (cloud deletion scenario)
StudyTrackStorage.setJson(StudyTrackStorage.KEYS.progress, { A: { status: 'approved' } });
StudyTrackFirebaseSync.applyStateLocally({ progress: null, updatedAt: '2026-05-22T00:00:00.000Z' });
assert.equal(StudyTrackStorage.getJson(StudyTrackStorage.KEYS.progress, 'fallback'), null, 'null progress from cloud should overwrite local');

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

// statesDiffer must be order-independent: same data, different key order = not different.
assert.equal(
  StudyTrackFirebaseSync.statesDiffer(
    { progress: { a: 1, b: 2 }, schedule: {} },
    { progress: { b: 2, a: 1 }, schedule: {} }
  ),
  false,
  'Key order alone should not be treated as a difference'
);
assert.equal(
  StudyTrackFirebaseSync.statesDiffer({ passingGrade: 70 }, { passingGrade: 80 }),
  true,
  'A real value change should be detected as a difference'
);

// notifyChange is the explicit sync hook: it must stamp the local timestamp.
store.delete(StudyTrackFirebaseSync.STORAGE_KEYS.localUpdatedAt);
StudyTrackFirebaseSync.notifyChange();
assert.ok(store.get(StudyTrackFirebaseSync.STORAGE_KEYS.localUpdatedAt), 'notifyChange should record a local modification timestamp');

// ── resolveSyncDecision: clock-independent 3-way baseline conflict detection ──
// This pure function is the heart of safe sync. It must never silently pick a
// winner when both sides diverged from the last synced common ancestor.
const decide = StudyTrackFirebaseSync.resolveSyncDecision;
assert.equal(typeof decide, 'function', 'resolveSyncDecision should be exported');

// 1. No cloud document yet → push local (nothing to lose).
assert.equal(decide({ cloudExists: false, cloudRev: null, baseline: null, localDirty: false }), 'push');
assert.equal(decide({ cloudExists: false, cloudRev: null, baseline: 'r1', localDirty: true }), 'push');

// 2. No known baseline on this device (fresh login / migration from pre-rev doc):
//    clean local must pull, dirty local must surface a conflict (never silent overwrite).
assert.equal(decide({ cloudExists: true, cloudRev: 'cloud-1', baseline: null, localDirty: false }), 'pull',
  'Fresh device with clean local should pull cloud');
assert.equal(decide({ cloudExists: true, cloudRev: 'cloud-1', baseline: null, localDirty: true }), 'conflict',
  'No common ancestor + local edits must NOT silently overwrite cloud');

// 3. Cloud has not moved since our baseline → only local could have changed.
assert.equal(decide({ cloudExists: true, cloudRev: 'r1', baseline: 'r1', localDirty: true }), 'push',
  'Cloud unchanged + local dirty should fast-forward cloud');
assert.equal(decide({ cloudExists: true, cloudRev: 'r1', baseline: 'r1', localDirty: false }), 'in-sync',
  'Cloud unchanged + local clean means nothing to do');

// 4. Cloud moved since our baseline (another device pushed).
assert.equal(decide({ cloudExists: true, cloudRev: 'r2', baseline: 'r1', localDirty: false }), 'pull',
  'Cloud moved + local clean should fast-forward local');
assert.equal(decide({ cloudExists: true, cloudRev: 'r2', baseline: 'r1', localDirty: true }), 'conflict',
  'Both sides diverged from baseline => real conflict, the bug we are fixing');

// markSynced / notifyChange must drive the baseline + dirty lifecycle so the
// pure decision above receives accurate inputs from storage.
StudyTrackFirebaseSync.markSynced('rev-applied');
assert.equal(store.get(StudyTrackFirebaseSync.STORAGE_KEYS.lastSyncedRev), 'rev-applied',
  'markSynced should persist the synced revision as the new baseline');
assert.equal(store.get(StudyTrackFirebaseSync.STORAGE_KEYS.localDirty), 'false',
  'markSynced should clear the local dirty flag');

StudyTrackFirebaseSync.notifyChange();
assert.equal(store.get(StudyTrackFirebaseSync.STORAGE_KEYS.localDirty), 'true',
  'A local modification should mark the state dirty for the next sync decision');

// Test .env loading in development (localhost)
(async () => {
  context.location = { hostname: 'localhost' };
  context.fetch = async (url) => {
    assert.equal(url, '/.env');
    return {
      ok: true,
      text: async () => `
        # Mock environment file
        FIREBASE_API_KEY=env-mock-key
        FIREBASE_PROJECT_ID=env-mock-project
        FIREBASE_AUTH_DOMAIN=env-mock-auth.firebaseapp.com
        FIREBASE_STORAGE_BUCKET=env-mock-storage.app
        FIREBASE_MESSAGING_SENDER_ID=987654321
        FIREBASE_APP_ID=1:987654321:web:abcdef123456
      `
    };
  };

  let initializedConfig = null;
  context.firebase = {
    apps: [],
    initializeApp: (config) => {
      initializedConfig = config;
    },
    firestore: () => ({
      enablePersistence: () => Promise.resolve()
    }),
    auth: () => ({
      onAuthStateChanged: () => {}
    })
  };

  await StudyTrackFirebaseSync.initFirebase();
  assert.ok(initializedConfig, 'Firebase should be initialized with config');
  assert.equal(initializedConfig.apiKey, 'env-mock-key');
  assert.equal(initializedConfig.projectId, 'env-mock-project');
  assert.equal(initializedConfig.authDomain, 'env-mock-auth.firebaseapp.com');
  assert.equal(initializedConfig.storageBucket, 'env-mock-storage.app');
  assert.equal(initializedConfig.messagingSenderId, '987654321');
  assert.equal(initializedConfig.appId, '1:987654321:web:abcdef123456');

  // Verify it falls back to DEFAULT when fetch fails
  context.fetch = async () => ({ ok: false });
  context.firebase.apps = []; // reset apps
  await StudyTrackFirebaseSync.initFirebase();
  assert.equal(initializedConfig.projectId, 'studytrack-ercamilo'); // fallback value

  assert.ok(!fs.readFileSync('src/firebase-sync.js', 'utf8').includes('innerHTML'));
  assert.ok(!fs.readFileSync('src/firebase-sync.js', 'utf8').includes('insertAdjacentHTML'));

  // ── End-to-end sync flow against a mock Firestore ──────────────────────────
  // Drives the real syncCloudData decision path to prove the clock-independent
  // 3-way logic behaves: pull, push, and — the bug we fixed — surface a conflict
  // instead of silently overwriting when both sides diverged.
  let capturedAuthCb = null;
  const cloud = { exists: false, data: null };
  const writes = [];
  const KEYS = StudyTrackFirebaseSync.STORAGE_KEYS;

  context.firebase = Object.assign({}, {
    apps: [],
    initializeApp: () => {},
    firestore: Object.assign(
      () => ({
        enablePersistence: () => Promise.resolve(),
        collection: () => ({
          doc: () => ({
            get: async () => ({ exists: cloud.exists, data: () => cloud.data }),
            set: async (data) => { writes.push(data); cloud.exists = true; cloud.data = { ...data }; }
          })
        })
      }),
      { FieldValue: { serverTimestamp: () => '__SERVER_TS__' } }
    ),
    auth: () => ({ onAuthStateChanged: (cb) => { capturedAuthCb = cb; return () => {}; } })
  });

  await StudyTrackFirebaseSync.initFirebase();
  assert.ok(typeof capturedAuthCb === 'function', 'Auth listener should be registered on init');

  function resetModal() {
    const existing = elements.get('sync-conflict-modal');
    if (existing) existing.remove();
  }

  // Scenario CONFLICT: stale baseline, cloud moved, local has unsynced edits.
  resetModal();
  writes.length = 0;
  StudyTrackStorage.setJson(StudyTrackStorage.KEYS.progress, { A: { status: 'approved' } });
  store.set(KEYS.lastSyncedRev, 'rev-base');
  store.set(KEYS.localDirty, 'true');
  cloud.exists = true;
  cloud.data = { progress: { B: { status: 'approved' } }, schedule: {}, rev: 'rev-cloud-new', updatedAtClient: '2026-06-01T00:00:00.000Z' };
  await capturedAuthCb({ uid: 'user-1', displayName: 'Conflict', email: 'c@example.com' });
  assert.ok(elements.get('sync-conflict-modal'), 'Divergent local + cloud MUST open the conflict modal (no silent overwrite)');
  assert.equal(writes.length, 0, 'A conflict must not write to the cloud automatically');

  // Scenario PULL: clean local, cloud advanced past our baseline.
  resetModal();
  writes.length = 0;
  store.set(KEYS.lastSyncedRev, 'rev-old');
  store.set(KEYS.localDirty, 'false');
  StudyTrackStorage.setJson(StudyTrackStorage.KEYS.progress, { OLD: true });
  cloud.exists = true;
  cloud.data = { progress: { NEW: true }, schedule: {}, rev: 'rev-cloud-2', updatedAtClient: '2026-06-02T00:00:00.000Z' };
  await capturedAuthCb({ uid: 'user-1', displayName: 'Pull', email: 'p@example.com' });
  // JSON.stringify comparison avoids the cross-realm prototype mismatch: objects
  // built inside the vm context are not reference-equal to outer-realm literals.
  assert.equal(JSON.stringify(StudyTrackStorage.getJson(StudyTrackStorage.KEYS.progress)), JSON.stringify({ NEW: true }), 'Clean local should pull cloud data');
  assert.equal(store.get(KEYS.lastSyncedRev), 'rev-cloud-2', 'Baseline should advance to the pulled revision');
  assert.equal(store.get(KEYS.localDirty), 'false', 'Pull leaves local clean');
  assert.equal(writes.length, 0, 'Pull must not write to the cloud');

  // Scenario PUSH: cloud unchanged since baseline, local has edits.
  resetModal();
  writes.length = 0;
  store.set(KEYS.lastSyncedRev, 'rev-shared');
  store.set(KEYS.localDirty, 'true');
  StudyTrackStorage.setJson(StudyTrackStorage.KEYS.progress, { LOCAL: true });
  cloud.exists = true;
  cloud.data = { progress: { SHARED: true }, schedule: {}, rev: 'rev-shared', updatedAtClient: '2026-06-03T00:00:00.000Z' };
  await capturedAuthCb({ uid: 'user-1', displayName: 'Push', email: 'u@example.com' });
  assert.equal(writes.length, 1, 'Cloud unchanged + dirty local should push exactly once');
  assert.equal(JSON.stringify(writes[0].progress), JSON.stringify({ LOCAL: true }), 'Push should upload local data');
  assert.ok(writes[0].rev && writes[0].rev !== 'rev-shared', 'Push should stamp a fresh revision token');
  assert.equal(store.get(KEYS.localDirty), 'false', 'Push should clear the dirty flag');
  assert.equal(store.get(KEYS.lastSyncedRev), writes[0].rev, 'Baseline should advance to the pushed revision');

  // ── cloudRevOf field precedence (legacy migration mechanism) ───────────────
  const revOf = StudyTrackFirebaseSync.cloudRevOf;
  assert.equal(revOf({ rev: 'r', updatedAtClient: 'c', updatedAt: 's' }), 'r', 'rev wins over everything');
  assert.equal(revOf({ updatedAtClient: 'c', updatedAt: 's' }), 'c', 'updatedAtClient is the next preference');
  assert.equal(revOf({ updatedAt: '2026-01-01T00:00:00.000Z' }), '2026-01-01T00:00:00.000Z', 'string updatedAt is used directly');
  assert.equal(revOf({ updatedAt: { toMillis: () => 1700000000000 } }), 'ts-1700000000000', 'Firestore Timestamp object coerced via toMillis()');
  assert.equal(revOf({ updatedAt: { seconds: 1700000000 } }), 'ts-1700000000', 'Timestamp coerced via seconds fallback');
  assert.equal(revOf({}), null, 'no usable fields yields null');
  assert.equal(revOf(null), null, 'null state yields null');

  // ── Account switch: A's baseline must NOT bleed into B's sync ──────────────
  resetModal();
  writes.length = 0;
  store.set(KEYS.lastSyncedUid, 'acct-A');
  store.set(KEYS.lastSyncedRev, 'A-rev');
  store.set(KEYS.localDirty, 'true');
  StudyTrackStorage.setJson(StudyTrackStorage.KEYS.progress, { A_DATA: true });
  cloud.exists = true;
  cloud.data = { progress: { B_DATA: true }, schedule: {}, rev: 'B-rev', updatedAtClient: '2026-06-05T00:00:00.000Z' };
  await capturedAuthCb({ uid: 'acct-B', displayName: 'B', email: 'b@example.com' });
  assert.ok(!elements.get('sync-conflict-modal'), 'Account switch must not produce a conflict sourced from the previous account baseline');
  assert.equal(writes.length, 0, 'Account switch must not push the previous account data into the new cloud doc');
  assert.equal(JSON.stringify(StudyTrackStorage.getJson(StudyTrackStorage.KEYS.progress)), JSON.stringify({ B_DATA: true }), 'New account should see its own cloud data after switch');
  assert.equal(store.get(KEYS.lastSyncedUid), 'acct-B', 'lastSyncedUid should track the new account');
  assert.equal(store.get(KEYS.lastSyncedRev), 'B-rev', 'Baseline should be the new account cloud rev after the pull');

  // ── Legacy doc migration: only a Firestore Timestamp, no rev ───────────────
  resetModal();
  writes.length = 0;
  store.delete(KEYS.lastSyncedRev);
  store.set(KEYS.localDirty, 'false');
  StudyTrackStorage.setJson(StudyTrackStorage.KEYS.progress, { LEGACY_LOCAL: true });
  const legacyTs = { toMillis: () => 1700000000000, toDate: () => new Date(1700000000000) };
  cloud.exists = true;
  cloud.data = { progress: { LEGACY_CLOUD: true }, schedule: {}, updatedAt: legacyTs };
  await StudyTrackFirebaseSync.syncCloudData();
  assert.ok(!elements.get('sync-conflict-modal'), 'Legacy migration with clean local must pull, not conflict');
  assert.equal(store.get(KEYS.lastSyncedRev), 'ts-1700000000000', 'Legacy Timestamp doc must yield a stable baseline (not null)');
  // A later local edit against the same legacy cloud must PUSH, never re-conflict.
  resetModal();
  writes.length = 0;
  StudyTrackStorage.setJson(StudyTrackStorage.KEYS.progress, { LEGACY_LOCAL_EDIT: true });
  store.set(KEYS.localDirty, 'true');
  await StudyTrackFirebaseSync.syncCloudData();
  assert.ok(!elements.get('sync-conflict-modal'), 'Migrated legacy doc must not produce recurring spurious conflicts on edit');
  assert.equal(writes.length, 1, 'Edit after legacy migration should push cleanly');

  // ── Identical content short-circuit: reconciles baseline without writing ───
  resetModal();
  writes.length = 0;
  store.set(KEYS.lastSyncedRev, 'stale-rev');
  store.set(KEYS.localDirty, 'true');
  StudyTrackStorage.setJson(StudyTrackStorage.KEYS.progress, { SAME: true });
  const localSnapshot = StudyTrackFirebaseSync.getLocalState();
  cloud.exists = true;
  cloud.data = {
    curriculum: localSnapshot.curriculum, progress: localSnapshot.progress, schedule: localSnapshot.schedule,
    gradeScale: localSnapshot.gradeScale, allowSkipPrereqs: localSnapshot.allowSkipPrereqs,
    maxEnrolledSubjects: localSnapshot.maxEnrolledSubjects, passingGrade: localSnapshot.passingGrade,
    darkMode: localSnapshot.darkMode, scheduleViewType: localSnapshot.scheduleViewType,
    profile: localSnapshot.profile, milestones: localSnapshot.milestones,
    rev: 'fresh-rev', updatedAtClient: '2026-06-06T00:00:00.000Z'
  };
  await StudyTrackFirebaseSync.syncCloudData();
  assert.ok(!elements.get('sync-conflict-modal'), 'Identical content must not open a conflict modal');
  assert.equal(writes.length, 0, 'Identical content must not write to the cloud (saves quota)');
  assert.equal(store.get(KEYS.lastSyncedRev), 'fresh-rev', 'Identical content reconciles the baseline to the cloud rev');
  assert.equal(store.get(KEYS.localDirty), 'false', 'Identical content clears the dirty flag');

  // ── Profile-only edit must push (statesDiffer now compares profile/milestones) ─
  // Regression guard: without 'profile' in the compare whitelist this edit was
  // silently dropped (dirty cleared, never pushed) against an otherwise-identical cloud.
  resetModal();
  writes.length = 0;
  store.set(KEYS.localDirty, 'true');
  StudyTrackStorage.setItem(StudyTrackStorage.KEYS.studentName, 'Erlin');
  await StudyTrackFirebaseSync.syncCloudData();
  assert.ok(!elements.get('sync-conflict-modal'), 'Profile-only edit must not open a conflict modal');
  assert.equal(writes.length, 1, 'A profile-only edit must push, not be dropped as identical content');

  // ── Offline push: serverTimestamp unavailable falls back to client ISO ─────
  resetModal();
  writes.length = 0;
  const savedFieldValue = context.firebase.firestore.FieldValue;
  context.firebase.firestore.FieldValue = undefined;
  store.set(KEYS.lastSyncedRev, 'base-x');
  store.set(KEYS.localDirty, 'true');
  StudyTrackStorage.setJson(StudyTrackStorage.KEYS.progress, { OFFLINE_PUSH: true });
  cloud.exists = true;
  cloud.data = { progress: { OTHER: true }, schedule: {}, rev: 'base-x', updatedAtClient: '2026-06-04T00:00:00.000Z' };
  await StudyTrackFirebaseSync.syncCloudData();
  assert.equal(writes.length, 1, 'Push must still happen when serverTimestamp is unavailable (offline)');
  assert.ok(writes[0].updatedAt, 'updatedAt must not be undefined when serverTimestamp is unavailable');
  assert.equal(writes[0].updatedAt, writes[0].updatedAtClient, 'updatedAt falls back to the client ISO stamp offline');
  context.firebase.firestore.FieldValue = savedFieldValue;

  // ── Conflict-modal handlers: the user-decision gate (anti-data-loss) ───────
  const conflictCloud = { progress: { CLOUD_PICK: true }, schedule: {}, rev: 'rev-pick-cloud', updatedAtClient: '2026-06-07T00:00:00.000Z' };
  const conflictLocal = { progress: { LOCAL_PICK: true }, schedule: {}, updatedAtClient: '2026-06-07T01:00:00.000Z' };

  // (a) Choosing cloud applies cloud data, advances baseline, clears dirty.
  resetModal();
  store.set(KEYS.lastSyncedRev, 'stale');
  store.set(KEYS.localDirty, 'true');
  StudyTrackFirebaseSync.showConflictModal(conflictCloud, conflictLocal);
  elements.get('btn-choose-cloud').onclick();
  assert.equal(JSON.stringify(StudyTrackStorage.getJson(StudyTrackStorage.KEYS.progress)), JSON.stringify({ CLOUD_PICK: true }), 'Choosing cloud applies cloud data locally');
  assert.equal(store.get(KEYS.lastSyncedRev), 'rev-pick-cloud', 'Choosing cloud advances baseline to the cloud rev');
  assert.equal(store.get(KEYS.localDirty), 'false', 'Choosing cloud clears the dirty flag');
  assert.ok(!elements.get('sync-conflict-modal'), 'Modal closes after choosing cloud');

  // (b) Choosing local pushes local data with a fresh rev, clears dirty.
  resetModal();
  writes.length = 0;
  store.set(KEYS.lastSyncedRev, 'stale2');
  store.set(KEYS.localDirty, 'true');
  StudyTrackStorage.setJson(StudyTrackStorage.KEYS.progress, { LOCAL_PICK: true });
  StudyTrackFirebaseSync.showConflictModal(conflictCloud, conflictLocal);
  await elements.get('btn-choose-local').onclick();
  assert.equal(writes.length, 1, 'Choosing local pushes to the cloud');
  assert.equal(JSON.stringify(writes[0].progress), JSON.stringify({ LOCAL_PICK: true }), 'Choosing local uploads local data');
  assert.ok(writes[0].rev && writes[0].rev !== 'stale2', 'Choosing local mints a fresh revision');
  assert.equal(store.get(KEYS.localDirty), 'false', 'Choosing local clears the dirty flag');
  assert.equal(store.get(KEYS.lastSyncedRev), writes[0].rev, 'Choosing local advances baseline to the pushed rev');

  // (c) "Decidir luego" must NOT silently resolve: baseline/dirty untouched.
  resetModal();
  store.set(KEYS.lastSyncedRev, 'untouched');
  store.set(KEYS.localDirty, 'true');
  StudyTrackFirebaseSync.showConflictModal(conflictCloud, conflictLocal);
  elements.get('btn-conflict-cancel').onclick();
  assert.ok(!elements.get('sync-conflict-modal'), 'Cancel closes the modal');
  assert.equal(store.get(KEYS.lastSyncedRev), 'untouched', 'Cancel must not change the baseline');
  assert.equal(store.get(KEYS.localDirty), 'true', 'Cancel must leave the state dirty (unresolved)');

  // ── REGRESSION (critical): debounced auto-save must respect conflict logic ─
  // The auto-save fires on every edit. It must NOT blindly overwrite the cloud
  // when another device pushed in the meantime.
  let debounced = null;
  const realSetTimeout = context.setTimeout;
  const realClearTimeout = context.clearTimeout;
  context.setTimeout = (fn) => { debounced = fn; return 1; };
  context.clearTimeout = () => { debounced = null; };

  resetModal();
  writes.length = 0;
  store.set(KEYS.lastSyncedRev, 'rev-synced');
  StudyTrackStorage.setJson(StudyTrackStorage.KEYS.progress, { MY_EDIT: true });
  cloud.exists = true;
  cloud.data = { progress: { OTHER_DEVICE: true }, schedule: {}, rev: 'rev-other-device', updatedAtClient: '2026-06-08T00:00:00.000Z' };
  StudyTrackFirebaseSync.notifyChange();
  assert.equal(typeof debounced, 'function', 'A local edit should schedule a debounced sync');
  await debounced();
  assert.equal(writes.length, 0, 'Auto-save must NOT blindly overwrite the cloud after another device pushed');
  assert.ok(elements.get('sync-conflict-modal'), 'Auto-save must surface a conflict instead of a silent overwrite');

  context.setTimeout = realSetTimeout;
  context.clearTimeout = realClearTimeout;

  console.log('Firebase sync checks passed');
})();
