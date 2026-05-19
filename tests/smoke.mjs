import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');

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
assert.ok(serviceWorker.includes('./src/progress.js'));
assert.ok(serviceWorker.includes('./icons/studytrack-icon.svg'));

for (const file of ['src/storage.js', 'src/sanitize.js', 'src/curriculum.js', 'src/grades.js', 'src/progress.js', 'src/prerequisites.js', 'src/periods.js', 'src/requirements.js', 'src/schedule.js']) {
  new Function(fs.readFileSync(file, 'utf8'));
}

assert.match(html, /id="stat-gpa">N\/A/);
assert.match(html, /id="stat-global-letter">N\/A/);
assert.match(html, /id="stat-global-gpa-points">N\/A/);
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
assert.ok(html.includes('updateMobileAcademicHub({ progress, earned, globalAvg, globalGPA, letter: letterObj?.label || \'N/A\', remaining: total - completed });'));
assert.ok(html.includes('grid grid-cols-4'), 'Mobile bottom navigation should expose four primary actions');
assert.ok(html.includes('id="nav-progress"'));
assert.ok(html.includes('id="nav-more"'));
assert.ok(html.includes('function setActiveMobileNav(activeId)'));
assert.ok(html.includes('function showMobileProgress()'));
assert.ok(html.includes('function openMobileMore()'));
assert.ok(html.includes('id="settings-quick-nav"'), 'Settings modal should expose quick navigation on mobile');
for (const id of ['settings-section-career', 'settings-section-preferences', 'settings-section-requirements', 'settings-section-grades', 'settings-section-data']) {
  assert.ok(html.includes(`id="${id}"`), `Missing settings section ${id}`);
}
assert.ok(html.includes('function scrollSettingsSection(sectionId)'));
assert.ok(html.includes('const statusLabel ='));
assert.ok(html.includes('subject-card-mobile'));
assert.ok(html.includes('mobile-subject-actions'));
assert.ok(html.includes('w-9 h-9 sm:w-7 sm:h-7'), 'Mobile subject controls should have larger touch targets');
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
assert.ok(!/details-room[^;\n]*innerHTML|innerHTML[^;\n]*details-room/.test(html), 'Schedule room details should not use innerHTML');
assert.ok(html.includes('StudyTrackProgress.normalizeUserProgress(StudyTrackStorage.getJson'));
assert.ok(html.includes('userProgress = StudyTrackProgress.normalizeUserProgress(d.progress, d.curriculum);'));
assert.ok(html.includes('function refreshAffectedSubjects(subjectId)'));
assert.ok(html.includes('StudyTrackProgress.getAffectedSubjectIds(subjectId, dependencyGraph)'));
assert.ok(html.includes('StudyTrackProgress.toggleSubjectApproval(userProgress[id])'));
assert.ok(html.includes("const safeGrade = escapeHtml(st.grade ?? '');"), 'Grade input must preserve zero values');
assert.ok(html.includes('const isApprovedWithoutGrade ='), 'Subject cards must detect approved subjects without grade');
assert.ok(html.includes('Materia completada sin nota registrada'), 'Grade input must expose the missing-grade warning state');
assert.ok(html.includes('const cardSurfaceClass = isApprovedWithoutGrade'), 'Missing-grade cards should own their warning surface class');
assert.ok(html.includes('grade-warning-message'), 'Missing-grade cards should show a visible mobile warning');
assert.ok(html.includes('Falta registrar nota'), 'Missing-grade cards should explain the pending action');
assert.ok(html.includes('grid grid-cols-[1fr_auto_auto] sm:flex'), 'Mobile subject actions should keep grade controls scannable');
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
