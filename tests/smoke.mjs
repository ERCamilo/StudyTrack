import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');
const appJs = fs.readFileSync('src/app.js', 'utf8');
const readme = fs.readFileSync('README.md', 'utf8');

// The controller now lives in src/app.js. JS-content assertions search `code`
// (markup + extracted controller); structural checks (ids, meta, CSP, duplicate
// ids, inline-script absence) stay on `html` only.
const code = html + '\n' + appJs;

const scripts = [];
let position = 0;

while (true) {
  const scriptStart = html.indexOf('<script', position);
  if (scriptStart < 0) break;

  const tagEnd = html.indexOf('>', scriptStart);
  const scriptEnd = html.indexOf('</script>', tagEnd);
  assert.notEqual(tagEnd, -1, 'Found an unclosed <script> tag');
  assert.notEqual(scriptEnd, -1, 'Found a <script> tag without </script>');

  const body = html.slice(tagEnd + 1, scriptEnd).trim();
  if (body) scripts.push(body);
  position = scriptEnd + '</script>'.length;
}

assert.equal(scripts.length, 0, 'index.html must not contain inline scripts (CSP hardening: the controller lives in src/app.js)');
new Function(appJs);

const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
assert.deepEqual(duplicateIds, [], `Duplicate ids found: ${duplicateIds.join(', ')}`);

const mojibakePattern = /\u00c3[\u0080-\u00bf]|\u00c2[\u0080-\u00bf]|\u00e2[\u0080-\u00bf]{1,2}|\u00f0[\u0080-\u00bf]{1,3}|\u00ef\u00b8\u008f/g;
const foundMojibake = [...code.matchAll(mojibakePattern)].map((match) => match[0]);
assert.deepEqual(foundMojibake, [], `Mojibake found: ${foundMojibake.join(', ')}`);

const gradePointFunctions = [...code.matchAll(/function\s+getGradePoints\s*\(/g)];
assert.equal(gradePointFunctions.length, 1, 'Expected exactly one getGradePoints function');
assert.equal((code.match(/function\s+renderTableSchedule\s*\(/g) || []).length, 1, 'Expected one renderTableSchedule function');
assert.equal((code.match(/function\s+renderWeeklySchedule\s*\(/g) || []).length, 1, 'Expected one renderWeeklySchedule function');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const libraryIndex = JSON.parse(fs.readFileSync('library/index.json', 'utf8'));
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.scope, './');
assert.equal(manifest.start_url, './');
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'Manifest should declare installable icons');
for (const icon of manifest.icons) {
  assert.ok(fs.existsSync(icon.src), `Missing manifest icon: ${icon.src}`);
}
const serviceWorker = fs.readFileSync('sw.js', 'utf8');
new Function(serviceWorker);
assert.ok(serviceWorker.includes('CACHE_NAME'));
assert.ok(serviceWorker.includes('./index.html'));
assert.ok(serviceWorker.includes('./src/academics.js'));
assert.ok(serviceWorker.includes('./src/progress.js'));
assert.ok(serviceWorker.includes('./src/insights.js'));
assert.ok(serviceWorker.includes('./src/nfc.js'));
assert.ok(serviceWorker.includes('./src/milestones.js'), 'Service worker should cache the milestones module');
assert.ok(serviceWorker.includes('./src/vendor/qrcode.min.js'), 'Service worker should cache the vendored QR library');
assert.ok(serviceWorker.includes('./src/vendor/jsqr.min.js'), 'Service worker should cache the vendored QR decoder');
assert.ok(serviceWorker.includes('./src/qr-share.js'), 'Service worker should cache the QR share module');
assert.ok(serviceWorker.includes('./src/firebase-sync.js'));
assert.ok(serviceWorker.includes('./src/app.js'), 'Service worker should cache the external controller');
assert.ok(serviceWorker.includes('./icons/studytrack-icon.svg'));
assert.ok(serviceWorker.includes("event.request.mode === 'navigate'"), 'Service worker should handle navigations explicitly');
assert.ok(serviceWorker.indexOf('fetch(event.request)') < serviceWorker.indexOf("caches.match('./index.html')"), 'Navigations should prefer network before cached index');
assert.ok(serviceWorker.includes('requestUrl.origin !== self.location.origin'), 'Service worker should not intercept GitHub fetches');
assert.ok(readme.includes('python -m http.server 8080 --bind 127.0.0.1'));
assert.ok(readme.includes('node tests/smoke.mjs'));
assert.ok(readme.includes('node tests/firebase-sync.mjs'));
assert.ok(readme.includes('studytrack.erlin.do'));
assert.ok(Array.isArray(libraryIndex) && libraryIndex.length > 0, 'Local library mirror should include careers');
for (const item of libraryIndex) {
  assert.ok(fs.existsSync(`library/${item.path}`), `Missing mirrored career file: ${item.path}`);
}

for (const file of ['src/storage.js', 'src/sanitize.js', 'src/curriculum.js', 'src/grades.js', 'src/academics.js', 'src/progress.js', 'src/prerequisites.js', 'src/periods.js', 'src/requirements.js', 'src/schedule.js', 'src/insights.js', 'src/milestones.js', 'src/nfc.js', 'src/qr-share.js', 'src/firebase-sync.js']) {
  new Function(fs.readFileSync(file, 'utf8'));
}

assert.match(html, /id="stat-gpa">N\/A/);
assert.match(html, /id="stat-global-letter">N\/A/);
assert.match(html, /id="stat-global-gpa-points">N\/A/);
assert.ok(code.includes('<meta name="referrer" content="no-referrer">'));
assert.ok(code.includes('http-equiv="Permissions-Policy"'));
assert.ok(code.includes('http-equiv="Content-Security-Policy"'));
assert.ok(code.includes("worker-src 'self'"));
const scriptSrc = (html.match(/script-src[^;]*/) || [''])[0];
assert.ok(scriptSrc.length > 0, 'CSP must define script-src');
assert.ok(!scriptSrc.includes("'unsafe-inline'"), "script-src must not allow 'unsafe-inline' (CSP hardening complete)");
assert.ok(code.includes('href="dist/tailwind.css"'), 'Tailwind must be loaded from the local compiled build');
assert.ok(!code.includes('cdn.tailwindcss.com"') && !code.includes('src="https://cdn.tailwindcss.com'), 'Play CDN must not be used in production');
assert.ok(code.includes("connect-src 'self' https://raw.githubusercontent.com https://cdn.jsdelivr.net"), 'CSP must allow remote curriculum fetches');
assert.ok(code.includes('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js'));
assert.ok(code.includes('<script src="./src/firebase-sync.js"></script>'));
assert.ok(code.includes('<script src="./src/app.js"></script>'), 'index.html must load the externalized controller');
assert.ok(code.includes('<script src="./src/milestones.js"></script>'), 'index.html must load the milestones module');
assert.ok(code.includes('<script src="./src/vendor/qrcode.min.js"></script>'), 'index.html must load the vendored QR library');
assert.ok(code.includes('<script src="./src/vendor/jsqr.min.js"></script>'), 'index.html must load the vendored QR decoder');
assert.ok(code.includes('<script src="./src/qr-share.js"></script>'), 'index.html must load the QR share module');
assert.ok(code.includes('data-action="openQrShareModal"') && code.includes('function openQrShareModal()'), 'QR share/scan chooser must be wired');
assert.ok(code.includes('id="qr-scan-input"') && code.includes('function onQrPhotoSelected('), 'QR photo scanning must be wired');
assert.ok(code.includes('data-action="forceAppRefresh"') && code.includes('function forceAppRefresh('), 'App cache-refresh button must be wired');
assert.ok(code.includes('id="profile-milestones"') && code.includes('function renderMilestones()'), 'Profile milestones timeline must be wired');
assert.ok(code.includes('id="home-motivation"') && code.includes('function renderHomeMotivation()'), 'Home motivational layer must be wired');
assert.ok(code.includes('id="settings-section-cloud"'));
assert.ok(code.includes('id="auth-header-btn"'));
assert.ok(code.includes('id="mobile-academic-hub"'));
assert.ok(code.includes('Hoy en tu carrera'));
assert.ok(code.includes('id="mobile-letter"'));
assert.ok(code.includes('id="mobile-gpa-points"'));
assert.ok(code.includes('<link rel="icon" type="image/svg+xml" href="icons/studytrack-icon.svg">'));
assert.ok(code.includes('<link rel="apple-touch-icon" href="icons/studytrack-icon.svg">'));
assert.ok(code.includes('function registerServiceWorker()'));
assert.ok(code.includes("window.addEventListener('load', registerServiceWorker);"));
assert.ok(code.includes("navigator.serviceWorker.register('./sw.js')"));
assert.ok(code.includes('id="desktop-summary-cards"'));
assert.ok(code.includes('class="hidden sm:flex gap-2 sm:gap-3 overflow-x-auto'), 'Desktop summary cards must be hidden on mobile');
assert.ok(code.includes('id="requirements-card"'));
assert.ok(code.includes('class="hidden sm:block bg-white'), 'Requirements card must not interrupt mobile subject flow');
assert.ok(code.includes("updateMobileAcademicHub({ progress, earned, globalAvg, globalGPA, letter: letterObj?.label || 'N/A', remaining });"));
assert.ok(code.includes('grid grid-cols-5'), 'Mobile bottom navigation should expose five primary actions');
assert.ok(code.includes('id="nav-home"'));
assert.ok(code.includes('id="nav-progress"'));
assert.ok(code.includes('id="nav-more"'));
assert.ok(code.includes('function setActiveMobileNav(activeId)'));
assert.ok(code.includes('function showProfile()'), 'Profile tab should open a dedicated profile view');
assert.ok(code.includes('id="profile-view"'), 'Profile must be its own view, not a duplicate of Materias');
assert.ok(code.includes('function renderProfileView()'), 'Profile view should have a renderer');
assert.ok(code.includes('id="profile-photo-input"') && code.includes('function onProfilePhotoSelected(input)'), 'Profile photo picker must be wired');
assert.ok(code.includes('data-action="showProfile"'), 'Nav must route the Perfil tab to the profile view');
assert.ok(code.includes('function openMobileMore()'));
assert.ok(code.includes('id="settings-quick-nav"'), 'Settings modal should expose quick navigation on mobile');
for (const id of ['settings-section-career', 'settings-section-preferences', 'settings-section-requirements', 'settings-section-grades', 'settings-section-data']) {
  assert.ok(code.includes(`id="${id}"`), `Missing settings section ${id}`);
}
assert.ok(code.includes('function scrollSettingsSection(sectionId)'));
assert.ok(code.includes('const shortStatus ='), 'Subject card should compute a status label');
assert.ok(code.includes('subject-card-mobile'));
assert.ok(code.includes('stk-actions'), 'Subject card should expose its primary actions row');
assert.ok(code.includes('width: 42px; height: 42px'), 'Subject status control (orb) should have a comfortable touch target');
assert.ok(code.includes('const escapeHtml = StudyTrackSanitize.escapeHtml;'));
assert.ok(code.includes('const sanitizeCssClasses = StudyTrackSanitize.sanitizeCssClasses;'));
assert.ok(code.includes('const safeColor = sanitizeCssClasses(g.color);'));
assert.ok(code.includes('<script src="./src/periods.js"></script>'));
assert.ok(code.includes('StudyTrackPeriods.getVisibleSubjects(p, userProgress, filter, currentFilter)'));
assert.ok(code.includes('StudyTrackPeriods.renderPeriodCardHTML({'));
assert.ok(code.includes('<script src="./src/requirements.js"></script>'));
assert.ok(code.includes('StudyTrackRequirements.renderRequirementsWidgetHTML(currentCurriculum.requirements'));
assert.ok(code.includes('StudyTrackRequirements.renderSettingsRequirementsHTML(currentCurriculum.requirements'));
assert.ok(code.includes('StudyTrackRequirements.addRequirement(currentCurriculum.requirements'));
assert.ok(code.includes('<script src="./src/schedule.js"></script>'));
assert.ok(code.includes('<script src="./src/academics.js"></script>'));
assert.ok(code.includes('<script src="./src/insights.js"></script>'));
assert.ok(code.includes('<script src="./src/nfc.js"></script>'), 'index.html must load the NFC student-card module');
assert.ok(code.includes('id="settings-section-share"'), 'Settings should expose the NFC student-card section');
assert.ok(code.includes('id="home-view"'));
assert.ok(code.includes('id="subjects-view"'));
assert.ok(code.includes('StudyTrackInsights.buildHomeInsights'));
assert.ok(code.includes('function renderHomeView'));
assert.ok(code.includes('function handleHomeAction'));
assert.ok(code.includes('function renderHomeRecommendationRow'));
assert.ok(code.includes('recommendation.reason'));
assert.ok(code.includes('recommendation.badge'));
assert.ok(code.includes('StudyTrackAcademics.calculateAcademicSummary(currentCurriculum, userProgress'));
assert.ok(code.includes('StudyTrackAcademics.calculateFilterCounts(currentCurriculum, userProgress'));
assert.ok(code.includes('StudyTrackAcademics.calculatePeriodAverage(p, userProgress'));
assert.ok(code.includes('StudyTrackAcademics.calculatePeriodGPA4(p, userProgress, getGradePoints'));
assert.ok(code.includes('const REMOTE_LIBRARY_SOURCES = ['));
assert.ok(code.includes('https://cdn.jsdelivr.net/gh/ERCamilo/LIBRERIA_DE_CARRERAS@main/index.json'));
assert.ok(code.includes("{ baseUrl: './library', indexUrl: './library/index.json' }"));
assert.ok(code.includes('function fetchRemoteLibraryIndex()'));
assert.ok(code.includes('new AbortController()'), 'Remote library sources should timeout before falling back');
assert.ok(code.includes('controller.abort()'));
assert.ok(!code.includes('const LOCAL_LIBRARY'), 'Careers should come from the library, not hardcoded local entries');
assert.ok(!code.includes("source: 'local'"), 'Hardcoded local career source should not exist');
assert.ok(!code.includes('getUAPAData'));
assert.ok(!code.includes('getUASDQuimicaData'));
assert.ok(code.includes('id="schedule-summary"'), 'Schedule view should expose a mobile summary');
assert.ok(code.includes('id="schedule-summary-enrolled"'));
assert.ok(code.includes('id="schedule-summary-scheduled"'));
assert.ok(code.includes('id="schedule-summary-pending"'));
assert.ok(code.includes('function updateScheduleSummary(enrolled)'));
assert.ok(code.includes('StudyTrackSchedule.collectScheduleBlocks(enrolled, scheduleData);'));
assert.ok(code.includes('StudyTrackSchedule.renderEnrolledScheduleHTML(enrolled, scheduleData'));
assert.ok(code.includes('StudyTrackSchedule.renderWeeklyScheduleHTML(allBlocks'));
assert.ok(code.includes('StudyTrackSchedule.renderVisualScheduleHTML(allBlocks'));
assert.ok(code.includes('StudyTrackSchedule.findScheduleConflict({'));
assert.ok(code.includes('StudyTrackSchedule.validateScheduleBlockOperation({'));
assert.ok(code.includes('excludeSubjectId: currentEditingBlock?.subjectId || null'));
assert.ok(code.includes('StudyTrackSchedule.upsertScheduleBlock(scheduleData'));
assert.ok(code.includes('StudyTrackSchedule.deleteScheduleBlock(scheduleData'));
assert.ok(code.includes('id="schedule-save-btn"'), 'Schedule save button should have a stable id');
assert.ok(code.includes('function setIconButtonContent(button, iconClass, text)'));
assert.ok(code.includes('function setScheduleRoomDetails(room)'));
assert.ok(code.includes('setScheduleRoomDetails(block.room)'));
assert.ok(!code.includes('insertAdjacentHTML'), 'Dynamic badges should be created with DOM APIs');
assert.ok(!code.includes('text-slate-750'));
assert.ok(!code.includes('text-slate-550'));
assert.ok(!code.includes('text-red-650'));
assert.ok(!/details-room[^;\n]*innerHTML|innerHTML[^;\n]*details-room/.test(html), 'Schedule room details should not use innerHTML');
assert.ok(code.includes('StudyTrackProgress.normalizeUserProgress(StudyTrackStorage.getJson'));
assert.ok(code.includes('userProgress = StudyTrackProgress.normalizeUserProgress(d.progress, d.curriculum);'));
assert.ok(code.includes('function refreshAffectedSubjects(subjectId)'));
assert.ok(code.includes('StudyTrackProgress.getAffectedSubjectIds(subjectId, dependencyGraph)'));
assert.ok(code.includes('StudyTrackProgress.toggleSubjectApproval(userProgress[id])'));
assert.ok(code.includes("const safeGrade = escapeHtml(st.grade ?? '');"), 'Grade input must preserve zero values');
assert.ok(code.includes('const isApprovedWithoutGrade ='), 'Subject cards must detect approved subjects without grade');
assert.ok(code.includes('function showPrerequisitePopover(event, subjectId)'));
assert.ok(code.includes('function navigateToSubject(subjectId)'));
assert.ok(code.includes('id = \'prerequisite-popover\'') || code.includes('id="prerequisite-popover"') || code.includes("popover.id = 'prerequisite-popover'"));
assert.ok(code.includes('data-action="showPrerequisitePopover"'), 'Prerequisite chips should open a contextual popover via delegated action');
assert.ok(!code.includes('showToast(`Requisitos:'), 'Prerequisites should not use toast-only feedback');
assert.ok(code.includes('Materia completada sin nota registrada'), 'Grade input must expose the missing-grade warning state');
assert.ok(code.includes('stk-card--warning'), 'Missing-grade cards should own their warning accent via state class');
assert.ok(code.includes('stk-warn-text'), 'Missing-grade cards should show a visible warning');
assert.ok(code.includes('Falta registrar la nota'), 'Missing-grade cards should explain the pending action');
assert.ok(code.includes('stk-grade'), 'Subject actions should keep the literal grade control scannable');
assert.ok(code.includes('function animateSubjectEntrance()'), 'Subjects view should run a staggered entrance');
assert.ok(code.includes('function popSubjectOrb(id)'), 'Approving a subject should trigger a celebratory pop');
assert.ok(code.includes('@media (prefers-reduced-motion: reduce)'), 'Motion must respect the reduced-motion preference');
assert.ok(code.includes('aria-label="Ver detalles de ${safeSubjectName}"'), 'Subject details button must be accessible');
assert.ok(code.includes('aria-label="Nota de ${safeSubjectName}"'), 'Grade input must be accessible');
assert.ok(!code.includes('${q.name}'), 'Requirement names must be escaped before innerHTML');
assert.ok(!code.includes('${r.name}'), 'Settings requirement names must be escaped before innerHTML');
assert.ok(!code.includes('<span>${block.room}</span>'), 'Schedule room must be escaped before innerHTML');
assert.equal((code.match(/window\.addEventListener\('scroll'/g) || []).length, 1, 'Expected one scroll listener');
assert.equal((code.match(/uniSelect\.addEventListener\('change'/g) || []).length, 0, 'setupSelectors should not stack university listeners');
assert.equal((code.match(/careerSelect\.addEventListener\('change'/g) || []).length, 0, 'setupSelectors should not stack career listeners');
assert.ok(html.indexOf('id="search-input"') < html.indexOf('id="filter-bar"'), 'Filter bar should sit after search');

// ── CSP hardening: no inline event handlers; everything is delegated ───────
const delegationFiles = ['index.html', 'src/app.js', 'src/periods.js', 'src/requirements.js', 'src/schedule.js'];
const inlineHandlerPattern = /on(?:click|change|input|submit|keyup|keydown|keypress|focus|blur|mousedown|mouseup|mouseover|mouseout|touchstart|touchend|load|error|scroll|wheel|contextmenu|dblclick)="/g;
for (const file of delegationFiles) {
  const src = fs.readFileSync(file, 'utf8');
  const inline = src.match(inlineHandlerPattern) || [];
  assert.equal(inline.length, 0, `${file} must not contain inline event handlers (found: ${inline.join(', ')})`);
}

// The delegated dispatcher must be registered for both events.
assert.ok(appJs.includes("document.addEventListener('click'"), 'A delegated click dispatcher must be registered');
assert.ok(appJs.includes("document.addEventListener('change'"), 'A delegated change dispatcher must be registered');

// Every declared data-action / data-change / data-action-self must resolve to a
// defined function (catches typos and orphaned actions). "stop" is a reserved no-op.
const allJs = [
  'src/storage.js', 'src/sanitize.js', 'src/curriculum.js', 'src/grades.js', 'src/academics.js',
  'src/progress.js', 'src/prerequisites.js', 'src/periods.js', 'src/requirements.js', 'src/schedule.js',
  'src/insights.js', 'src/nfc.js', 'src/firebase-sync.js', 'src/app.js'
].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const declaredActions = new Set();
for (const file of delegationFiles) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/data-(?:action|change|action-self)="([A-Za-z_$][\w$]*)"/g)) {
    declaredActions.add(m[1]);
  }
}
assert.ok(declaredActions.size > 20, `Expected the delegated actions to be discovered (found ${declaredActions.size})`);
// "stop" is a reserved no-op shield. saveFirebaseConfig is a vestigial handler in
// the hidden firebase-config-setup-box (the old manual-config flow, superseded by
// the default config + Google sign-in); the dispatcher safely no-ops it. Remove it
// when that box is cleaned up.
const reservedActions = new Set(['stop', 'saveFirebaseConfig']);
for (const action of declaredActions) {
  if (reservedActions.has(action)) continue;
  const defined = new RegExp(`function\\s+${action}\\b|\\b${action}\\s*=\\s*function|(?:global|window)\\.${action}\\s*=`).test(allJs);
  assert.ok(defined, `data-action "${action}" must map to a defined function`);
}

// Static data-args in index.html must be valid JSON (dynamic ones live in template literals).
for (const m of html.matchAll(/data-args='([^']*)'/g)) {
  assert.doesNotThrow(() => JSON.parse(m[1]), `data-args must be valid JSON: ${m[1]}`);
}

console.log('Smoke checks passed');
