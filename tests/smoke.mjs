import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');
const appJs = fs.readFileSync('src/app.js', 'utf8');
const cardsJs = fs.readFileSync('src/cards.js', 'utf8');
const readme = fs.readFileSync('README.md', 'utf8');

// The controller now lives in src/app.js, and the period/subject card templates
// live in src/cards.js. JS-content assertions search `code` (markup + extracted
// controller + card templates); structural checks (ids, meta, CSP, duplicate
// ids, inline-script absence) stay on `html` only.
const code = html + '\n' + appJs + '\n' + cardsJs;

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

// Regla de negocio: al publicar una versión nueva, la app no mezcla la pantalla nueva con el código viejo:
// el service worker descarga los archivos frescos (sin la caché HTTP) y, cuando la versión nueva toma el control
// (no en la primera instalación), la app le pregunta al usuario si actualiza ahora o más tarde, mostrando las mejoras.
// Solo "Actualizar ahora" recarga la página; "Más tarde" no la toca. (Regla cambiada con confirmación del usuario:
// antes la página se recargaba sola.)
assert.match(serviceWorker, /cache:\s*'reload'/, 'install must bypass the HTTP cache so the new shell is really new');
{
  const appJs = fs.readFileSync('src/app.js', 'utf8');
  const register = appJs.slice(appJs.indexOf('function registerServiceWorker'), appJs.indexOf('function registerServiceWorker') + 900);
  assert.ok(register.includes("'controllerchange'"), 'react when the new service worker takes control');
  assert.match(register, /navigator\.serviceWorker\.controller/, 'only when a previous version was in control (not on first install)');
  assert.ok(register.includes('shouldPromptForUpdate'), 'the prompt decision lives in the tested pure helper');
  assert.ok(!register.includes('location.reload()'), 'the service worker taking control must not reload the page by itself');
  const apply = appJs.slice(appJs.indexOf('function applyAppUpdate'), appJs.indexOf('function applyAppUpdate') + 600);
  assert.ok(apply.includes('location.reload()'), 'Actualizar ahora reloads into the new version');
  const later = appJs.slice(appJs.indexOf('function postponeAppUpdate'), appJs.indexOf('function postponeAppUpdate') + 500);
  assert.ok(!later.includes('location.reload()'), 'Más tarde must not reload');
  for (const id of ['update-modal', 'update-modal-body']) assert.ok(html.includes(`id="${id}"`), `index.html must contain #${id}`);
  assert.ok(html.includes('data-action="applyAppUpdate"') && html.includes('data-action="postponeAppUpdate"'), 'both choices are offered');
}
assert.ok(serviceWorker.includes('./index.html'));
assert.ok(serviceWorker.includes('./src/academics.js'));
assert.ok(serviceWorker.includes('./src/progress.js'));
assert.ok(serviceWorker.includes('./src/insights.js'));
assert.ok(serviceWorker.includes('./src/cards.js'), 'Service worker should cache the period/subject card templates module');
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

for (const file of ['src/storage.js', 'src/sanitize.js', 'src/curriculum.js', 'src/grades.js', 'src/academics.js', 'src/progress.js', 'src/prerequisites.js', 'src/periods.js', 'src/cards.js', 'src/requirements.js', 'src/schedule.js', 'src/insights.js', 'src/milestones.js', 'src/nfc.js', 'src/qr-share.js', 'src/firebase-sync.js', 'src/uni-events.js', 'src/uni-events-view.js', 'src/uni-events-ui.js', 'src/app-version.js', 'src/sync-status.js', 'src/dev-mode.js', 'src/blockers.js', 'src/graduation.js', 'src/honors.js']) {
  new Function(fs.readFileSync(file, 'utf8'));
}

// Eventos de la universidad: el módulo se carga y queda disponible sin conexión.
assert.ok(code.includes('<script src="./src/uni-events.js"></script>'), 'index.html must load the university events module');
assert.ok(serviceWorker.includes("'./src/uni-events.js'"), 'Service worker should cache the university events module');
for (const file of ['uni-events-view.js', 'uni-events-ui.js']) {
  assert.ok(code.includes(`<script src="./src/${file}"></script>`), `index.html must load src/${file}`);
  assert.ok(serviceWorker.includes(`'./src/${file}'`), `Service worker should cache src/${file}`);
}
{
  const order = ['uni-events.js', 'uni-events-view.js', 'uni-events-ui.js', 'app.js'].map((f) => code.indexOf(`<script src="./src/${f}"></script>`));
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'university event modules load in order, before app.js');
  const csp = /connect-src ([^;]+);/.exec(code)?.[1] || '';
  assert.ok(csp.includes('https://eva.uapa.edu.do'), 'CSP must allow the direct calendar download');
  assert.ok(csp.includes('https://studytrack-ics-proxy.ecamilo-ec.workers.dev'), 'CSP must allow the calendar relay');
  const appJs = fs.readFileSync('src/app.js', 'utf8');
  assert.ok(appJs.includes("'https://studytrack-ics-proxy.ecamilo-ec.workers.dev'"), 'app.js must point at the deployed relay');
  for (const id of ['settings-section-unical', 'uni-calendar-url-input', 'uni-calendar-status', 'home-uni-events', 'home-uni-events-list', 'uni-calendar-card', 'uni-calendar-grid', 'uni-calendar-day', 'uni-calendar-month']) {
    assert.ok(code.includes(`id="${id}"`), `index.html must have #${id}`);
  }
  for (const action of ['refreshUniEvents', 'clearUniCalendar', 'openUniCalendarDay', 'selectUniCalendarDay', 'shiftUniCalendarMonth']) {
    assert.match(appJs, new RegExp(`function ${action}\\(`), `app.js must define ${action}`);
  }
}

// Regla de negocio: el enlace del calendario de la universidad es secreto: se guarda solo en el dispositivo y nunca se sincroniza.
{
  const storageJs = fs.readFileSync('src/storage.js', 'utf8');
  const syncJs = fs.readFileSync('src/firebase-sync.js', 'utf8');
  assert.match(storageJs, /uniCalendarUrl:\s*'[^']+'/, 'storage.js must define a key for the calendar link');
  assert.match(storageJs, /uniEvents:\s*'[^']+'/, 'storage.js must define a key for the imported events');
  assert.ok(!syncJs.includes('uniCalendarUrl'), 'The calendar link must never be part of Firebase sync');
  assert.ok(!syncJs.includes('uniEvents'), 'Imported university events stay on the device');
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
assert.ok(code.includes('<script src="./src/app-version.js"></script>'), 'index.html must load the app-version module before app.js');
assert.ok(serviceWorker.includes('./src/app-version.js'), 'Service worker should cache the app-version module');
for (const id of ['app-version-label', 'whats-new-modal', 'whats-new-body']) assert.ok(html.includes(`id="${id}"`), `index.html must contain #${id}`);
for (const fn of ['openWhatsNew', 'closeWhatsNew']) assert.ok(appJs.includes(`function ${fn}(`), `app.js must define ${fn} for the delegated dispatcher`);
assert.ok(html.includes('data-action="openWhatsNew"'), 'Settings must offer a way to reopen the news');
// Mobile / PWA hardening
assert.ok(!/\bconfirm\(/.test(appJs), 'app.js must use askConfirm instead of the native confirm()');
for (const fn of ['askConfirm', 'checkForAppUpdate', 'setupDialogLayers']) assert.ok(appJs.includes(`function ${fn}(`), `app.js must define ${fn}`);
assert.ok(/id="toast-container"[^>]*aria-live="polite"/.test(html), 'toasts must be announced to screen readers');
assert.ok(appJs.includes("addEventListener('popstate'") && appJs.includes("'Escape'"), 'dialogs must close with the back button and Escape');
assert.ok(html.includes('data-action="checkForAppUpdate"'), 'Settings must offer a manual update check');
assert.ok(!html.includes('text-[9px]') && !appJs.includes('text-[9px]'), 'no 9px text on mobile');
assert.ok(/\.stk-input\.stk-input[^}]*font-size:\s*16px/.test(html), 'inputs must be 16px on phones to avoid the iOS focus zoom');
assert.ok(/--stk-text-3:\s*#6b7290/.test(html), 'tertiary text must keep 4.5:1 contrast on white');
assert.ok(/height:\s*44px/.test(html.slice(html.indexOf('.stk-icon-btn {'), html.indexOf('.stk-icon-btn {') + 200)), 'icon buttons are at least 44px');
assert.equal(manifest.orientation, 'any', 'schedule view needs landscape');
// Profile: academic honors
assert.ok(code.includes('<script src="./src/honors.js"></script>') && serviceWorker.includes('./src/honors.js'), 'honors module is loaded and cached');
for (const id of ['profile-honors', 'honors-result', 'settings-section-honors', 'honor-settings-list']) assert.ok(html.includes(`id="${id}"`), `index.html must contain #${id}`);
for (const fn of ['renderHonors', 'renderHonorSettings', 'updateHonorLevel', 'resetHonorLevels', 'openHonorSettings']) assert.ok(appJs.includes(`function ${fn}(`), `app.js must define ${fn}`);
assert.ok(/renderGraduationPlan\(\);\s*renderHonors\(\);/.test(appJs), 'the profile view renders the honors card');
assert.ok(html.includes('data-action="resetHonorLevels"'), 'honor minimums can be reset');

// Profile: time to graduate
assert.ok(code.includes('<script src="./src/graduation.js"></script>') && serviceWorker.includes('./src/graduation.js'), 'graduation module is loaded and cached');
for (const id of ['profile-plan', 'plan-result', 'plan-months', 'plan-per-period', 'plan-mode-subjects', 'plan-mode-credits', 'plan-note']) assert.ok(html.includes(`id="${id}"`), `index.html must contain #${id}`);
assert.ok(/for="plan-months"/.test(html) && /for="plan-per-period"/.test(html), 'plan inputs have visible labels');
for (const fn of ['renderGraduationPlan', 'updatePlanMonths', 'updatePlanPerPeriod', 'setPlanMode', 'savePlanSettings']) assert.ok(appJs.includes(`function ${fn}(`), `app.js must define ${fn}`);
assert.ok(/renderGraduationPlan\(\);\s*renderHonors\(\);\s*const card = collectStudentCard\(\)/.test(appJs), 'the profile view renders the plan and the honors');

// Home: subjects that hold back progress
assert.ok(code.includes('<script src="./src/blockers.js"></script>') && serviceWorker.includes('./src/blockers.js'), 'blockers module is loaded and cached');
for (const id of ['home-blockers', 'home-blockers-list', 'home-blockers-count']) assert.ok(html.includes(`id="${id}"`), `index.html must contain #${id}`);
assert.ok(appJs.includes('function renderHomeBlockers(') && /renderHomeBlockers\(\);\s*\}/.test(appJs), 'the home view renders the blockers card');
assert.ok(/\.stk-urg--high/.test(html) && appJs.includes('URGENCY_ICON') && appJs.includes('URGENCY_LABELS'), 'urgency is shown with icon + words, not colour alone');

// Developer mode: QR/NFC hidden by default, unlocked from the app version, no header gear
assert.ok(code.includes('<script src="./src/dev-mode.js"></script>') && serviceWorker.includes('./src/dev-mode.js'), 'dev-mode module is loaded and cached');
assert.ok(!/data-action="openSettings"[^>]*aria-label="Configuración"/.test(html), 'the header gear next to the account button is gone');
assert.ok(html.includes('data-action="openSettings" class="side-tab"') && html.includes('data-args=\'["openSettings"]\''), 'Configuración stays reachable from the sidebar and the Más sheet');
for (const [act, feat] of [['shareStudentCardViaNfc', 'nfc'], ['readStudentCardViaNfc', 'nfc'], ['openQrShareModal', 'qr']]) assert.ok(new RegExp(`data-action="${act}"[^>]*data-dev-feature="${feat}"`).test(html), `${act} must be gated by data-dev-feature=${feat}`);
assert.ok(/html:not\(\.dev-qr\) \[data-dev-feature="qr"\]/.test(html) && /html:not\(\.dev-nfc\) \[data-dev-feature="nfc"\]/.test(html), 'gated features are hidden unless <html> carries dev-qr / dev-nfc');
for (const id of ['dev-sheet', 'dev-sheet-list', 'more-dev-row']) assert.ok(html.includes(`id="${id}"`), `index.html must contain #${id}`);
assert.ok(/id="more-dev-row"[^>]*hidden/.test(html), 'the Desarrollador row starts hidden');
assert.ok(html.includes('data-action="tapAppVersion"') && ['tapAppVersion', 'applyDevMode', 'openDevSheet', 'closeDevSheet', 'toggleDevFeature', 'disableDevMode'].every((fn) => appJs.includes(`function ${fn}(`)), 'version taps and the dev sheet are wired');

// Header sync indicator
assert.ok(code.includes('<script src="./src/sync-status.js"></script>') && serviceWorker.includes('./src/sync-status.js'), 'sync-status module is loaded and cached');
assert.ok(html.includes('id="sync-dot"') && html.includes('id="more-sync-label"'), 'indicator markup exists');
assert.ok(appJs.includes("'studytrack:sync-state'") && fs.readFileSync('src/firebase-sync.js', 'utf8').includes("'studytrack:sync-state'"), 'firebase-sync publishes and app listens');
assert.ok(/syncing:\s*true,\s*error:\s*false/.test(fs.readFileSync('src/firebase-sync.js', 'utf8')), 'sync start clears the previous error');

// Keyboard / screen-reader support
assert.ok(/data-action="togglePeriod"[^>]*role="button"[^>]*tabindex="0"[^>]*aria-expanded/.test(fs.readFileSync('src/periods.js', 'utf8')), 'period headers are keyboard-operable');
assert.ok(/class="stk-expand-btn" aria-expanded="false"/.test(cardsJs) && !/role="button"/.test(cardsJs), 'subject cards expose one real expand button (no nested role=button headers)');
assert.ok(/id="toggle-skip-prereqs"[^>]*role="switch"[^>]*aria-checked/.test(html), 'the prerequisites toggle is a switch');
for (const f of ['all', 'enrolled', 'completed', 'pending']) assert.ok(html.includes(`id="filter-${f}" aria-pressed=`), `filter ${f} exposes aria-pressed`);
assert.ok(appJs.includes("'aria-current'") && appJs.includes('clearSubjectFilters') && appJs.includes('getEmptyListMessage'), 'tabs expose the current page and empty lists offer a way out');
assert.ok(/data-action="scrollToTop" aria-label=/.test(html) && /data-action="closeDetailsModal" aria-label=/.test(html), 'icon-only buttons are labelled');

// Self-hosted icons/fonts (work offline) and the mobile "Más" sheet
assert.ok(!/https:\/\/(cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)/.test(html), 'icons and fonts must be self-hosted, not loaded from CDNs');
for (const f of ['src/vendor/fa/css/all.min.css', 'src/vendor/fa/webfonts/fa-solid-900.woff2', 'src/vendor/fa/webfonts/fa-regular-400.woff2', 'src/vendor/fonts/fonts.css', 'src/vendor/fonts/outfit.woff2', 'src/vendor/fonts/sora.woff2', 'src/vendor/fonts/space-grotesk.woff2']) { assert.ok(fs.existsSync(f), `Missing ${f}`); assert.ok(serviceWorker.includes('./' + f), `Service worker should precache ${f}`); }
assert.ok(html.includes("font-src 'self' data:;"), 'CSP font-src must only need our own origin');
for (const id of ['more-sheet', 'more-update-label', 'more-version-label']) assert.ok(html.includes(`id="${id}"`), `index.html must contain #${id}`);
for (const fn of ['closeMoreSheet', 'moreAction', 'moreOpenSettings', 'showPrerequisiteBlockedToast', 'offerUndo']) assert.ok(appJs.includes(`function ${fn}(`), `app.js must define ${fn}`);
assert.ok(!appJs.includes('Debes completar los prerrequisitos primero'), 'blocked toasts must name the missing prerequisites');
assert.ok(/openMobileMore\(\) \{[^}]*more-sheet/.test(appJs), 'the Más tab opens the short sheet, not the full settings');

for (const png of ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png']) { assert.ok(fs.existsSync(png), `Missing ${png}`); assert.ok(serviceWorker.includes('./' + png), `Service worker should cache ${png}`); }


assert.ok(code.includes('<script src="./src/vendor/qrcode.min.js"></script>'), 'index.html must load the vendored QR library');
assert.ok(code.includes('<script src="./src/vendor/jsqr.min.js"></script>'), 'index.html must load the vendored QR decoder');
assert.ok(code.includes('<script src="./src/qr-share.js"></script>'), 'index.html must load the QR share module');
assert.ok(code.includes('data-action="openQrShareModal"') && code.includes('function openQrShareModal()'), 'QR share/scan chooser must be wired');
assert.ok(code.includes('id="qr-scan-input"') && code.includes('function onQrPhotoSelected('), 'QR photo scanning must be wired');
assert.ok(code.includes('data-action="forceAppRefresh"') && code.includes('function forceAppRefresh('), 'App cache-refresh button must be wired');
assert.ok(code.includes('id="profile-milestones"') && code.includes('function renderMilestones()'), 'Profile milestones timeline must be wired');
assert.ok(code.includes('id="home-motivation"') && code.includes('function renderHomeMotivation()'), 'Home motivational layer must be wired');

// ── MiRuta splash + multi-step onboarding ───────────────────────────────────
assert.ok(code.includes('id="splash-screen"'), 'Splash overlay must exist');
assert.ok(code.includes('function scheduleSplashDismiss()'), 'Splash must dismiss itself on a timer');
const storageJs = fs.readFileSync('src/storage.js', 'utf8');
assert.ok(code.includes('StudyTrackStorage.KEYS.onboarded'), 'Onboarding must read/write through the shared storage key');
assert.ok(storageJs.includes("onboarded: 'studytrack_onboarded_v1'"), 'Onboarded flag must be declared in the storage KEYS map');
// The verify step must keep exactly these ids/behavior so setupSelectors('welcome') and
// startAppFromWelcome keep resolving regardless of how the surrounding flow changes.
for (const id of ['welcome-uni-select', 'welcome-career-select', 'welcome-career-container', 'welcome-start-btn']) {
  assert.ok(code.includes(`id="${id}"`), `Welcome selector id must be preserved: ${id}`);
}
assert.ok(code.includes('data-action="startAppFromWelcome"'), 'Verify step confirm button must still trigger startAppFromWelcome');
for (const id of ['ob-step-welcome', 'ob-step-status', 'ob-step-verify', 'ob-step-grades', 'ob-step-tour', 'ob-step-awards']) {
  assert.ok(code.includes(`id="${id}"`), `Onboarding step section missing: ${id}`);
}
assert.ok(code.includes('function renderOnboardingStep()'), 'Onboarding must have a step renderer');
assert.ok(code.includes('function goOnboardingStep(step)'), 'Onboarding must expose a step-transition function');
assert.ok(code.includes('function resetOnboardingState()'), 'Onboarding state must be resettable for a fresh new-user run');
assert.ok(code.includes("data-action=\"chooseOnboardingStarted\"") && code.includes("data-action=\"chooseOnboardingNew\""), 'Status step must wire both branches');
assert.ok(code.includes('function advanceOnboardingAfterVerify()') && code.includes("onboardingHasHistory ? 'grades' : 'tour'"), 'Verify step must branch on hasHistory');
assert.ok(code.includes('function toggleOnboardingPeriod(periodNumber)') && code.includes('function pickOnboardingGrade(periodNumber, grade)'), 'Grades step interactions must be wired');
assert.ok(code.includes('StudyTrackProgress.applyBulkApprovalForPeriods(currentCurriculum, userProgress, periodGrades, APP_CONFIG.passingGrade)'), 'Grades step must bulk-apply through the pure progress module, with the configured passing grade');
assert.ok(code.includes('function onboardingTourNext()') && code.includes('function onboardingTourPrev()'), 'Tour navigation must be wired');
assert.ok(code.includes("data-action=\"loginWithGoogle\""), '"Ya tengo cuenta" must call the real Google sign-in, not a fake login step');
assert.ok(!code.includes('correo@ejemplo.com') && !code.includes('••••••••'), 'Onboarding must not include a fake email/password login step');
assert.ok(code.includes('data-action="completeOnboarding"') && code.includes('function completeOnboarding()'), 'Final "Ir a mi ruta" must complete onboarding');
assert.ok(code.includes("StudyTrackStorage.setBoolean(StudyTrackStorage.KEYS.onboarded, true)"), 'Completing onboarding must persist the onboarded flag');
// Migration: existing users (curriculum on disk, flag unset) must never be trapped in onboarding.
assert.ok(code.includes('if (storedCurriculum && !StudyTrackStorage.getBoolean(StudyTrackStorage.KEYS.onboarded, false))'), 'initApp must migrate existing users to onboarded=true');
assert.ok(code.includes('id="settings-section-cloud"'));
assert.ok(code.includes('id="auth-header-btn"'));
assert.ok(code.includes('id="mobile-academic-hub"'));
assert.ok(code.includes('Hoy en tu carrera'));
assert.ok(code.includes('id="mobile-letter"'));
assert.ok(code.includes('id="mobile-gpa-points"'));
assert.ok(code.includes('<link rel="icon" type="image/svg+xml" href="icons/studytrack-icon.svg">'));
assert.ok(code.includes('<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">'), 'iOS ignores SVG touch icons: use the PNG');
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
assert.ok(code.includes('id="profile-greeting"'), 'Profile view should greet the student by name');
assert.ok(code.includes('id="profile-carne-navy"') && code.includes('id="profile-carne-bands"'), 'Profile view should render both carné variants');
assert.ok(code.includes('data-action="flipCarneVariant"') && code.includes('function flipCarneVariant()'), 'Carné flip toggle must be wired');
assert.ok(code.includes('function applyCarneVariant(') && code.includes("StudyTrackStorage.KEYS.carneVariant"), 'Carné variant preference must persist like other UI prefs');
assert.ok(code.includes('id="carne-navy-id"') && code.includes('id="carne-navy-status"'), 'Navy carné must show the student id and status');
assert.ok(code.includes('id="carne-bands-name"') && code.includes('id="carne-bands-career"') && code.includes('id="carne-bands-id"'), 'Bands carné must show name, career and id');
assert.ok(code.includes('id="carne-bands-avatar"') && code.includes('function renderCarneBandsAvatar('), 'Bands carné avatar tile must stay in sync with the profile photo');
assert.ok(code.includes('id="profile-progress-bar"'), 'Recorrido card should render a progress bar alongside the ring');
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
assert.ok(code.includes('<script src="./src/cards.js"></script>'), 'index.html must load the period/subject card templates module');
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
assert.ok(code.includes("const safeGrade = escapeHtml(data.grade ?? '');"), 'Grade input must preserve zero values');
assert.ok(code.includes('const isApprovedWithoutGrade ='), 'Subject cards must detect approved subjects without grade');
assert.ok(code.includes('function showPrerequisitePopover(event, subjectId)'));
assert.ok(code.includes('function navigateToSubject(subjectId)'));
assert.ok(code.includes('id = \'prerequisite-popover\'') || code.includes('id="prerequisite-popover"') || code.includes("popover.id = 'prerequisite-popover'"));
assert.ok(code.includes('data-action="showPrerequisitePopover"'), 'Prerequisite chips should open a contextual popover via delegated action');
assert.ok(!code.includes('showToast(`Requisitos:'), 'Prerequisites should not use toast-only feedback');
assert.ok(code.includes('Materia completada sin nota registrada'), 'Grade input must expose the missing-grade warning state');
assert.ok(code.includes('stk-subject-card--warning'), 'Missing-grade cards should own their warning accent via state class');
assert.ok(code.includes('stk-warn-text'), 'Missing-grade cards should show a visible warning');
assert.ok(code.includes('Falta registrar la nota'), 'Missing-grade cards should explain the pending action');
assert.ok(code.includes('stk-grade'), 'Subject actions should keep the literal grade control scannable');
// Regla de negocio: la coma decimal debe poder escribirse en cualquier teléfono. Un input type="number"
// la bloquea o la entrega vacía en algunos navegadores (y la nota se borraría), así que el campo de nota es
// de texto con teclado decimal.
{
  const gradeInput = cardsJs.match(/<input[^>]*class="stk-grade"[^>]*>/)?.[0] ?? '';
  assert.ok(gradeInput, 'The subject grade input must exist in src/cards.js');
  assert.ok(gradeInput.includes('type="text"'), 'The grade input must be type="text" so a decimal comma always reaches the code');
  assert.ok(gradeInput.includes('inputmode="decimal"'), 'The grade input must open the decimal keypad on phones');
}
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
const delegationFiles = ['index.html', 'src/app.js', 'src/periods.js', 'src/cards.js', 'src/requirements.js', 'src/schedule.js'];
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
  'src/progress.js', 'src/prerequisites.js', 'src/periods.js', 'src/cards.js', 'src/requirements.js', 'src/schedule.js',
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
