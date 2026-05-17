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

JSON.parse(fs.readFileSync('manifest.json', 'utf8'));

for (const file of ['src/storage.js', 'src/sanitize.js', 'src/curriculum.js', 'src/grades.js', 'src/progress.js', 'src/prerequisites.js', 'src/requirements.js', 'src/schedule.js']) {
  new Function(fs.readFileSync(file, 'utf8'));
}

assert.match(html, /id="stat-gpa">N\/A/);
assert.match(html, /id="stat-global-letter">N\/A/);
assert.match(html, /id="stat-global-gpa-points">N\/A/);
assert.ok(html.includes('const escapeHtml = StudyTrackSanitize.escapeHtml;'));
assert.ok(html.includes('const sanitizeCssClasses = StudyTrackSanitize.sanitizeCssClasses;'));
assert.ok(html.includes('const safeColor = sanitizeCssClasses(g.color);'));
assert.ok(html.includes('<script src="./src/requirements.js"></script>'));
assert.ok(html.includes('StudyTrackRequirements.renderRequirementsWidgetHTML(currentCurriculum.requirements'));
assert.ok(html.includes('StudyTrackRequirements.renderSettingsRequirementsHTML(currentCurriculum.requirements'));
assert.ok(html.includes('StudyTrackRequirements.addRequirement(currentCurriculum.requirements'));
assert.ok(html.includes('<script src="./src/schedule.js"></script>'));
assert.ok(html.includes('StudyTrackSchedule.collectScheduleBlocks(enrolled, scheduleData);'));
assert.ok(html.includes('StudyTrackSchedule.renderEnrolledScheduleHTML(enrolled, scheduleData'));
assert.ok(html.includes('StudyTrackSchedule.renderWeeklyScheduleHTML(allBlocks'));
assert.ok(html.includes('StudyTrackSchedule.renderVisualScheduleHTML(allBlocks'));
assert.ok(html.includes('StudyTrackSchedule.findScheduleConflict({'));
assert.ok(html.includes('StudyTrackSchedule.validateScheduleBlockOperation({'));
assert.ok(html.includes('excludeSubjectId: currentEditingBlock?.subjectId || null'));
assert.ok(html.includes('StudyTrackSchedule.upsertScheduleBlock(scheduleData'));
assert.ok(html.includes('StudyTrackSchedule.deleteScheduleBlock(scheduleData'));
assert.ok(html.includes('StudyTrackProgress.normalizeUserProgress(StudyTrackStorage.getJson'));
assert.ok(html.includes('userProgress = StudyTrackProgress.normalizeUserProgress(d.progress, d.curriculum);'));
assert.ok(html.includes('function refreshAffectedSubjects(subjectId)'));
assert.ok(html.includes('StudyTrackProgress.getAffectedSubjectIds(subjectId, dependencyGraph)'));
assert.ok(html.includes('StudyTrackProgress.toggleSubjectApproval(userProgress[id])'));
assert.ok(html.includes("const safeGrade = escapeHtml(st.grade ?? '');"), 'Grade input must preserve zero values');
assert.ok(html.includes('const isApprovedWithoutGrade ='), 'Subject cards must detect approved subjects without grade');
assert.ok(html.includes('Materia completada sin nota registrada'), 'Grade input must expose the missing-grade warning state');
assert.ok(html.includes('aria-label="Nota de ${safeSubjectName}"'), 'Grade input must be accessible');
assert.ok(!html.includes('${q.name}'), 'Requirement names must be escaped before innerHTML');
assert.ok(!html.includes('${r.name}'), 'Settings requirement names must be escaped before innerHTML');
assert.ok(!html.includes('<span>${block.room}</span>'), 'Schedule room must be escaped before innerHTML');
assert.equal((html.match(/window\.addEventListener\('scroll'/g) || []).length, 1, 'Expected one scroll listener');
assert.equal((html.match(/uniSelect\.addEventListener\('change'/g) || []).length, 0, 'setupSelectors should not stack university listeners');
assert.equal((html.match(/careerSelect\.addEventListener\('change'/g) || []).length, 0, 'setupSelectors should not stack career listeners');

console.log('Smoke checks passed');
