import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');
const readme = fs.readFileSync('README.md', 'utf8');

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

assert.ok(scripts.length > 0, 'Expected at least one inline script');
scripts.forEach((script) => new Function(script));

const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
assert.deepEqual(duplicateIds, [], `Duplicate ids found: ${duplicateIds.join(', ')}`);

const mojibakePattern = /\u00c3[\u0080-\u00bf]|\u00c2[\u0080-\u00bf]|\u00e2[\u0080-\u00bf]{1,2}|\u00f0[\u0080-\u00bf]{1,3}|\u00ef\u00b8\u008f/g;
const foundMojibake = [...html.matchAll(mojibakePattern)].map((match) => match[0]);
assert.deepEqual(foundMojibake, [], `Mojibake found: ${foundMojibake.join(', ')}`);

const gradePointFunctions = [...html.matchAll(/function\s+getGradePoints\s*\(/g)];
assert.equal(gradePointFunctions.length, 1, 'Expected exactly one getGradePoints function');
assert.equal((html.match(/function\s+renderTableSchedule\s*\(/g) || []).length, 1, 'Expected one renderTableSchedule function');
assert.equal((html.match(/function\s+renderWeeklySchedule\s*\(/g) || []).length, 1, 'Expected one renderWeeklySchedule function');

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
assert.ok(serviceWorker.includes('./src/firebase-sync.js'));
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

for (const file of ['src/storage.js', 'src/sanitize.js', 'src/curriculum.js', 'src/grades.js', 'src/academics.js', 'src/progress.js', 'src/prerequisites.js', 'src/periods.js', 'src/requirements.js', 'src/schedule.js', 'src/insights.js', 'src/firebase-sync.js']) {
  new Function(fs.readFileSync(file, 'utf8'));
}

assert.match(html, /id="stat-gpa">N\/A/);
assert.match(html, /id="stat-global-letter">N\/A/);
assert.match(html, /id="stat-global-gpa-points">N\/A/);
assert.ok(html.includes('<meta name="referrer" content="no-referrer">'));
assert.ok(html.includes('http-equiv="Permissions-Policy"'));
assert.ok(html.includes('http-equiv="Content-Security-Policy"'));
assert.ok(html.includes("worker-src 'self'"));
assert.ok(html.includes('href="dist/tailwind.css"'), 'Tailwind must be loaded from the local compiled build');
assert.ok(!html.includes('cdn.tailwindcss.com"') && !html.includes('src="https://cdn.tailwindcss.com'), 'Play CDN must not be used in production');
assert.ok(html.includes("connect-src 'self' https://raw.githubusercontent.com https://cdn.jsdelivr.net"), 'CSP must allow remote curriculum fetches');
assert.ok(html.includes('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js'));
assert.ok(html.includes('<script src="./src/firebase-sync.js"></script>'));
assert.ok(html.includes('id="settings-section-cloud"'));
assert.ok(html.includes('id="auth-header-btn"'));
assert.ok(html.includes('id="mobile-academic-hub"'));
assert.ok(html.includes('Hoy en tu carrera'));
assert.ok(html.includes('id="mobile-letter"'));
assert.ok(html.includes('id="mobile-gpa-points"'));
assert.ok(html.includes('<link rel="icon" type="image/svg+xml" href="icons/studytrack-icon.svg">'));
assert.ok(html.includes('<link rel="apple-touch-icon" href="icons/studytrack-icon.svg">'));
assert.ok(html.includes('function registerServiceWorker()'));
assert.ok(html.includes("window.addEventListener('load', registerServiceWorker);"));
assert.ok(html.includes("navigator.serviceWorker.register('./sw.js')"));
assert.ok(html.includes('id="desktop-summary-cards"'));
assert.ok(html.includes('class="hidden sm:flex gap-2 sm:gap-3 overflow-x-auto'), 'Desktop summary cards must be hidden on mobile');
assert.ok(html.includes('id="requirements-card"'));
assert.ok(html.includes('class="hidden sm:block bg-white'), 'Requirements card must not interrupt mobile subject flow');
assert.ok(html.includes("updateMobileAcademicHub({ progress, earned, globalAvg, globalGPA, letter: letterObj?.label || 'N/A', remaining });"));
assert.ok(html.includes('grid grid-cols-5'), 'Mobile bottom navigation should expose five primary actions');
assert.ok(html.includes('id="nav-home"'));
assert.ok(html.includes('id="nav-progress"'));
assert.ok(html.includes('id="nav-more"'));
assert.ok(html.includes('function setActiveMobileNav(activeId)'));
assert.ok(html.includes('function showMobileProgress()'));
assert.ok(html.includes("switchView('subjects');\r\n            setActiveMobileNav('nav-progress');") || html.includes("switchView('subjects');\n            setActiveMobileNav('nav-progress');"), 'Progress tab should not duplicate the home view');
assert.ok(html.includes("document.getElementById('mobile-academic-hub')"), 'Progress tab should target the academic progress hub');
assert.ok(html.includes('function openMobileMore()'));
assert.ok(html.includes('id="settings-quick-nav"'), 'Settings modal should expose quick navigation on mobile');
for (const id of ['settings-section-career', 'settings-section-preferences', 'settings-section-requirements', 'settings-section-grades', 'settings-section-data']) {
  assert.ok(html.includes(`id="${id}"`), `Missing settings section ${id}`);
}
assert.ok(html.includes('function scrollSettingsSection(sectionId)'));
assert.ok(html.includes('const shortStatus ='), 'Subject card should compute a status label');
assert.ok(html.includes('subject-card-mobile'));
assert.ok(html.includes('stk-actions'), 'Subject card should expose its primary actions row');
assert.ok(html.includes('width: 42px; height: 42px'), 'Subject status control (orb) should have a comfortable touch target');
assert.ok(html.includes('const escapeHtml = StudyTrackSanitize.escapeHtml;'));
assert.ok(html.includes('const sanitizeCssClasses = StudyTrackSanitize.sanitizeCssClasses;'));
assert.ok(html.includes('const safeColor = sanitizeCssClasses(g.color);'));
assert.ok(html.includes('<script src="./src/periods.js"></script>'));
assert.ok(html.includes('StudyTrackPeriods.getVisibleSubjects(p, userProgress, filter, currentFilter)'));
assert.ok(html.includes('StudyTrackPeriods.renderPeriodCardHTML({'));
assert.ok(html.includes('<script src="./src/requirements.js"></script>'));
assert.ok(html.includes('StudyTrackRequirements.renderRequirementsWidgetHTML(currentCurriculum.requirements'));
assert.ok(html.includes('StudyTrackRequirements.renderSettingsRequirementsHTML(currentCurriculum.requirements'));
assert.ok(html.includes('StudyTrackRequirements.addRequirement(currentCurriculum.requirements'));
assert.ok(html.includes('<script src="./src/schedule.js"></script>'));
assert.ok(html.includes('<script src="./src/academics.js"></script>'));
assert.ok(html.includes('<script src="./src/insights.js"></script>'));
assert.ok(html.includes('id="home-view"'));
assert.ok(html.includes('id="subjects-view"'));
assert.ok(html.includes('StudyTrackInsights.buildHomeInsights'));
assert.ok(html.includes('function renderHomeView'));
assert.ok(html.includes('function handleHomeAction'));
assert.ok(html.includes('function renderHomeRecommendationRow'));
assert.ok(html.includes('recommendation.reason'));
assert.ok(html.includes('recommendation.badge'));
assert.ok(html.includes('StudyTrackAcademics.calculateAcademicSummary(currentCurriculum, userProgress'));
assert.ok(html.includes('StudyTrackAcademics.calculateFilterCounts(currentCurriculum, userProgress'));
assert.ok(html.includes('StudyTrackAcademics.calculatePeriodAverage(p, userProgress'));
assert.ok(html.includes('StudyTrackAcademics.calculatePeriodGPA4(p, userProgress, getGradePoints'));
assert.ok(html.includes('const REMOTE_LIBRARY_SOURCES = ['));
assert.ok(html.includes('https://cdn.jsdelivr.net/gh/ERCamilo/LIBRERIA_DE_CARRERAS@main/index.json'));
assert.ok(html.includes("{ baseUrl: './library', indexUrl: './library/index.json' }"));
assert.ok(html.includes('function fetchRemoteLibraryIndex()'));
assert.ok(html.includes('new AbortController()'), 'Remote library sources should timeout before falling back');
assert.ok(html.includes('controller.abort()'));
assert.ok(!html.includes('const LOCAL_LIBRARY'), 'Careers should come from the library, not hardcoded local entries');
assert.ok(!html.includes("source: 'local'"), 'Hardcoded local career source should not exist');
assert.ok(!html.includes('getUAPAData'));
assert.ok(!html.includes('getUASDQuimicaData'));
assert.ok(html.includes('id="schedule-summary"'), 'Schedule view should expose a mobile summary');
assert.ok(html.includes('id="schedule-summary-enrolled"'));
assert.ok(html.includes('id="schedule-summary-scheduled"'));
assert.ok(html.includes('id="schedule-summary-pending"'));
assert.ok(html.includes('function updateScheduleSummary(enrolled)'));
assert.ok(html.includes('StudyTrackSchedule.collectScheduleBlocks(enrolled, scheduleData);'));
assert.ok(html.includes('StudyTrackSchedule.renderEnrolledScheduleHTML(enrolled, scheduleData'));
assert.ok(html.includes('StudyTrackSchedule.renderWeeklyScheduleHTML(allBlocks'));
assert.ok(html.includes('StudyTrackSchedule.renderVisualScheduleHTML(allBlocks'));
assert.ok(html.includes('StudyTrackSchedule.findScheduleConflict({'));
assert.ok(html.includes('StudyTrackSchedule.validateScheduleBlockOperation({'));
assert.ok(html.includes('excludeSubjectId: currentEditingBlock?.subjectId || null'));
assert.ok(html.includes('StudyTrackSchedule.upsertScheduleBlock(scheduleData'));
assert.ok(html.includes('StudyTrackSchedule.deleteScheduleBlock(scheduleData'));
assert.ok(html.includes('id="schedule-save-btn"'), 'Schedule save button should have a stable id');
assert.ok(html.includes('function setIconButtonContent(button, iconClass, text)'));
assert.ok(html.includes('function setScheduleRoomDetails(room)'));
assert.ok(html.includes('setScheduleRoomDetails(block.room)'));
assert.ok(!html.includes('insertAdjacentHTML'), 'Dynamic badges should be created with DOM APIs');
assert.ok(!html.includes('text-slate-750'));
assert.ok(!html.includes('text-slate-550'));
assert.ok(!html.includes('text-red-650'));
assert.ok(!/details-room[^;\n]*innerHTML|innerHTML[^;\n]*details-room/.test(html), 'Schedule room details should not use innerHTML');
assert.ok(html.includes('StudyTrackProgress.normalizeUserProgress(StudyTrackStorage.getJson'));
assert.ok(html.includes('userProgress = StudyTrackProgress.normalizeUserProgress(d.progress, d.curriculum);'));
assert.ok(html.includes('function refreshAffectedSubjects(subjectId)'));
assert.ok(html.includes('StudyTrackProgress.getAffectedSubjectIds(subjectId, dependencyGraph)'));
assert.ok(html.includes('StudyTrackProgress.toggleSubjectApproval(userProgress[id])'));
assert.ok(html.includes("const safeGrade = escapeHtml(st.grade ?? '');"), 'Grade input must preserve zero values');
assert.ok(html.includes('const isApprovedWithoutGrade ='), 'Subject cards must detect approved subjects without grade');
assert.ok(html.includes('function showPrerequisitePopover(event, subjectId)'));
assert.ok(html.includes('function navigateToSubject(subjectId)'));
assert.ok(html.includes('id = \'prerequisite-popover\'') || html.includes('id="prerequisite-popover"') || html.includes("popover.id = 'prerequisite-popover'"));
assert.ok(html.includes("showPrerequisitePopover(event, '${subjectIdJs}')"), 'Prerequisite chips should open a contextual popover');
assert.ok(!html.includes('showToast(`Requisitos:'), 'Prerequisites should not use toast-only feedback');
assert.ok(html.includes('Materia completada sin nota registrada'), 'Grade input must expose the missing-grade warning state');
assert.ok(html.includes('stk-card--warning'), 'Missing-grade cards should own their warning accent via state class');
assert.ok(html.includes('stk-warn-text'), 'Missing-grade cards should show a visible warning');
assert.ok(html.includes('Falta registrar la nota'), 'Missing-grade cards should explain the pending action');
assert.ok(html.includes('stk-grade'), 'Subject actions should keep the literal grade control scannable');
assert.ok(html.includes('function animateSubjectEntrance()'), 'Subjects view should run a staggered entrance');
assert.ok(html.includes('function popSubjectOrb(id)'), 'Approving a subject should trigger a celebratory pop');
assert.ok(html.includes('@media (prefers-reduced-motion: reduce)'), 'Motion must respect the reduced-motion preference');
assert.ok(html.includes('aria-label="Ver detalles de ${safeSubjectName}"'), 'Subject details button must be accessible');
assert.ok(html.includes('aria-label="Nota de ${safeSubjectName}"'), 'Grade input must be accessible');
assert.ok(!html.includes('${q.name}'), 'Requirement names must be escaped before innerHTML');
assert.ok(!html.includes('${r.name}'), 'Settings requirement names must be escaped before innerHTML');
assert.ok(!html.includes('<span>${block.room}</span>'), 'Schedule room must be escaped before innerHTML');
assert.equal((html.match(/window\.addEventListener\('scroll'/g) || []).length, 1, 'Expected one scroll listener');
assert.equal((html.match(/uniSelect\.addEventListener\('change'/g) || []).length, 0, 'setupSelectors should not stack university listeners');
assert.equal((html.match(/careerSelect\.addEventListener\('change'/g) || []).length, 0, 'setupSelectors should not stack career listeners');
assert.ok(html.indexOf('id="search-input"') < html.indexOf('id="filter-bar"'), 'Filter bar should sit after search');

console.log('Smoke checks passed');
