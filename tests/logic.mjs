import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const context = { globalThis: {} };
context.globalThis = context;
vm.createContext(context);

const store = new Map();
context.localStorage = {
  clear: () => store.clear(),
  getItem: (key) => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key)
};

for (const file of ['src/storage.js', 'src/sanitize.js', 'src/curriculum.js', 'src/report-entry.js', 'src/grades.js', 'src/academics.js', 'src/progress.js', 'src/prerequisites.js', 'src/periods.js', 'src/cards.js', 'src/requirements.js', 'src/schedule.js', 'src/insights.js', 'src/milestones.js', 'src/uni-events.js', 'src/uni-events-view.js', 'src/uni-events-ui.js', 'src/app-version.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const { StudyTrackAcademics, StudyTrackCurriculum, StudyTrackGrades, StudyTrackInsights, StudyTrackPrerequisites, StudyTrackProgress, StudyTrackSanitize, StudyTrackStorage, StudyTrackSchedule, StudyTrackRequirements, StudyTrackPeriods, StudyTrackMilestones, StudyTrackCards, StudyTrackReportEntry, StudyTrackUniEvents, StudyTrackUniEventsView, StudyTrackUniEventsUI, StudyTrackVersion } = context;

const scale = [
  { min: 90, label: 'A', points: 4, color: 'a' },
  { min: 80, label: 'B', points: 3, color: 'b' },
  { min: 70, label: 'C', points: 2, color: 'c' },
  { min: 0, label: 'F', points: 0, color: 'f' }
];

assert.equal(StudyTrackGrades.getGradeLabel(85, scale).label, 'B');
assert.equal(StudyTrackGrades.getGradePoints(92, scale), 4);
assert.equal(StudyTrackGrades.getGradePoints('', scale), 0);

assert.equal(StudyTrackProgress.parseGradeInput('0'), 0);
assert.equal(StudyTrackProgress.parseGradeInput(''), null);
assert.equal(StudyTrackProgress.parseGradeInput('85.5'), 85.5);
assert.equal(StudyTrackProgress.applyGradeToSubjectProgress({ status: 'pending' }, '69.5').grade, 69.5);
assert.equal(StudyTrackProgress.applyGradeToSubjectProgress({ status: 'pending' }, '69.5').status, 'pending');
assert.equal(StudyTrackProgress.applyGradeToSubjectProgress({ status: 'pending' }, '70.0').status, 'approved');
// Configurable passing grade: the threshold is supplied by the caller, not hardcoded.
assert.equal(StudyTrackProgress.applyGradeToSubjectProgress({ status: 'pending' }, '65', 60).status, 'approved');
assert.equal(StudyTrackProgress.applyGradeToSubjectProgress({ status: 'pending' }, '75', 80).status, 'pending');
assert.equal(StudyTrackProgress.applyGradeToSubjectProgress({ status: 'approved', grade: 90 }, '75', 80).status, 'pending');
assert.equal(StudyTrackProgress.applyGradeToSubjectProgress({ status: 'pending' }, '85').status, 'approved');
assert.equal(StudyTrackProgress.applyGradeToSubjectProgress({ status: 'approved' }, '65').status, 'pending');
assert.equal(StudyTrackProgress.applyGradeToSubjectProgress({ status: 'enrolled' }, '65').status, 'enrolled');
assert.equal(StudyTrackProgress.applyGradeToSubjectProgress({ status: 'approved' }, '').status, 'approved');
assert.equal(StudyTrackProgress.toggleSubjectApproval({ status: 'pending', grade: 95 }).status, 'approved');
assert.equal(StudyTrackProgress.toggleSubjectApproval({ status: 'approved', grade: 95 }).status, 'pending');

// Onboarding bulk-approval: marks every subject in the given periods as approved
// with the period's chosen grade; periods absent from periodGrades stay untouched.
const bulkCurriculum = {
  periods: [
    { period_number: 1, subjects: [{ id: 'S1' }, { id: 'S2' }] },
    { period_number: 2, subjects: [{ id: 'S3' }] }
  ]
};
const bulkResult = StudyTrackProgress.applyBulkApprovalForPeriods(bulkCurriculum, {}, { 1: 90 });
assert.equal(bulkResult.S1.status, 'approved');
assert.equal(bulkResult.S1.grade, 90);
assert.equal(bulkResult.S2.status, 'approved');
assert.equal(bulkResult.S2.grade, 90);
assert.equal(bulkResult.S3, undefined, 'Period 2 was not marked done, so its subjects must stay untouched');
// Existing progress on an untouched subject is preserved; existing progress on a
// bulk-approved subject is overwritten (status/grade) but other fields survive.
const bulkWithExisting = StudyTrackProgress.applyBulkApprovalForPeriods(
  bulkCurriculum,
  { S1: { status: 'enrolled', grade: null, section: 'A' }, S3: { status: 'enrolled' } },
  { 1: 85 }
);
assert.equal(bulkWithExisting.S1.status, 'approved');
assert.equal(bulkWithExisting.S1.grade, 85);
assert.equal(bulkWithExisting.S1.section, 'A');
assert.equal(bulkWithExisting.S3.status, 'enrolled', 'Untouched period must not be mutated');
// Pure: does not mutate the input progress object.
const bulkInput = { S1: { status: 'pending' } };
StudyTrackProgress.applyBulkApprovalForPeriods(bulkCurriculum, bulkInput, { 1: 95 });
assert.equal(bulkInput.S1.status, 'pending', 'Input progress object must not be mutated');

assert.equal(StudyTrackSanitize.escapeHtml(`<img src=x onerror='bad'>`), '&lt;img src=x onerror=&#39;bad&#39;&gt;');
assert.equal(StudyTrackSanitize.escapeJsString(`a'b"c`), 'a\\&#39;b&quot;c');
assert.equal(
  StudyTrackSanitize.sanitizeCssClasses(`text-red-500 dark:text-red-400" onclick="bad`),
  'text-red-500'
);

StudyTrackStorage.setJson('json-ok', { hello: 'world' });
assert.equal(JSON.stringify(StudyTrackStorage.getJson('json-ok')), JSON.stringify({ hello: 'world' }));
StudyTrackStorage.setItem('json-bad', '{');
assert.equal(JSON.stringify(StudyTrackStorage.getJson('json-bad', { fallback: true })), JSON.stringify({ fallback: true }));
assert.equal(StudyTrackStorage.getBoolean('missing-bool', true), true);
StudyTrackStorage.setBoolean('bool-value', false);
assert.equal(StudyTrackStorage.getBoolean('bool-value', true), false);
StudyTrackStorage.setNumber('number-value', 12);
assert.equal(StudyTrackStorage.getNumber('number-value', 0), 12);
StudyTrackStorage.setItem('float-value', '69.5');
assert.equal(StudyTrackStorage.getFloat('float-value', 0), 69.5);
assert.equal(StudyTrackStorage.getNumber('float-value', 0), 69);
assert.equal(StudyTrackStorage.getFloat('missing-float', 70), 70);
StudyTrackStorage.setItem('to-remove', 'secret');
assert.equal(StudyTrackStorage.removeItem('to-remove'), true);
assert.equal(StudyTrackStorage.getItem('to-remove'), null, 'removeItem deletes the key');
assert.equal(StudyTrackStorage.removeItem('never-set'), true, 'removing a missing key is fine');
StudyTrackStorage.clearAll();
assert.equal(StudyTrackStorage.getItem('number-value'), null);

const curriculum = {
  periods: [
    {
      subjects: [
        { id: 'MAT-101', prerequisites: [] },
        { id: 'LET-101', prerequisites: [] }
      ]
    },
    {
      subjects: [
        { id: 'MAT-102', prerequisites: ['MAT-101'] },
        { id: 'SCI-201', prerequisites: [['MAT-101', 'LET-101']] },
        { id: 'CAP-400', prerequisites: ['ALL'] }
      ]
    }
  ]
};

assert.equal(StudyTrackCurriculum.validateCurriculum(curriculum).valid, false);

const validCurriculum = {
  metadata: { career_name: 'Demo', institution: 'Demo U' },
  periods: [
    {
      subjects: [
        { id: 'MAT-101', name: 'Matematica I', code: 'MAT-101', credits: 4, prerequisites: [] },
        { id: 'LET-101', name: 'Letras I', code: 'LET-101', credits: 3, prerequisites: [] }
      ]
    },
    {
      subjects: [
        { id: 'MAT-102', name: 'Matematica II', code: 'MAT-102', credits: 4, prerequisites: ['MAT-101'] },
        { id: 'SCI-201', name: 'Ciencias', code: 'SCI-201', credits: 3, prerequisites: [['MAT-101', 'LET-101']] },
        { id: 'CAP-400', name: 'Final', code: 'CAP-400', credits: 2, prerequisites: ['ALL'] }
      ]
    }
  ]
};

assert.equal(StudyTrackCurriculum.validateCurriculum(validCurriculum).valid, true);
assert.equal(StudyTrackCurriculum.validateCurriculum({}).valid, false);

const reportPayload = StudyTrackReportEntry.buildCurriculumReportPayload({
  curriculum: { metadata: { career_name: 'Industrial Engineering', institution: 'Demo U', version: '2026.1.0' } },
  subject: { id: 'MAT-101', name: 'Calculus I', code: 'MAT-101' },
  period: { period_number: 1 },
  issueType: 'credits'
});
assert.equal(reportPayload.careerId, 'Industrial Engineering');
assert.equal(reportPayload.careerVersion, '2026.1.0');
assert.equal(reportPayload.subject.subjectId, 'MAT-101');
assert.equal(reportPayload.issueType, 'credits');
assert.equal(reportPayload.status, 'new');
const reportDraft = StudyTrackReportEntry.createReportDraft({ curriculum: { metadata: {} }, subject: { name: 'Unknown' }, period: {} });
assert.equal(reportDraft.target, 'StudyTrack-ControlCenter.CreateCurriculumReportInput');
assert.equal(reportDraft.payload.issueType, 'other');

const catalogIndex = JSON.parse(fs.readFileSync('library/index.json', 'utf8'));
assert.ok(catalogIndex.length > 0, 'Local catalog index must include careers');
for (const entry of catalogIndex) {
  const catalogPath = `library/${entry.path}`;
  assert.ok(fs.existsSync(catalogPath), `Catalog entry ${entry.id} must reference an existing curriculum file`);
  const catalogCurriculum = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const result = StudyTrackCurriculum.validateCatalogEntry(entry, catalogCurriculum);
  assert.equal(result.valid, true, `${entry.id} should validate: ${result.errors.join('; ')}`);
}

const catalogValidationFixture = {
  schema_version: '2.0',
  metadata: {
    career_name: 'Catalog Validation',
    institution: 'Demo U',
    source: {
      name: 'Official curriculum',
      url: 'https://example.edu/curriculum.pdf',
      retrieved_at: '2026-06-01'
    }
  },
  periods: [
    {
      period_number: 1,
      subjects: [
        { id: 'BASE-101', name: 'Base', code: 'BASE-101', credits: 0, prerequisites: [] }
      ]
    },
    {
      period_number: 2,
      subjects: [
        { id: 'ADV-201', name: 'Advanced', code: 'ADV-201', credits: 3, prerequisites: ['BASE-101'] }
      ]
    }
  ]
};
assert.equal(StudyTrackCurriculum.validateCurriculum(catalogValidationFixture).valid, true, 'New schema/source metadata should be accepted');
assert.equal(StudyTrackCurriculum.validateCatalogEntry({
  id: 'demo-catalog',
  institution: 'Demo U',
  degree_type: 'Grado',
  career_name: 'Catalog Validation',
  path: 'data/demo/catalog.json',
  last_update: '2026-06-01'
}, catalogValidationFixture).valid, true, 'New catalog metadata should validate');
assert.equal(StudyTrackCurriculum.validateCurriculum({
  metadata: { career_name: 'Legacy', institution: 'Demo U' },
  periods: [
    {
      subjects: [
        { id: 'LEG-101', name: 'Legacy', code: 'LEG-101', credits: 3, prerequisites: [] }
      ]
    }
  ]
}).valid, true, 'Legacy curriculum fields should remain compatible');

const invalidCatalogCurriculum = {
  schema_version: 2,
  metadata: {
    career_name: 'Broken',
    institution: 'Demo U',
    source: { url: 'not-a-url' }
  },
  periods: [
    { period_number: 1, subjects: [] },
    {
      period_number: 2,
      subjects: [
        { id: 'DUP-101', name: 'Duplicate A', code: 'DUP-A', credits: 3, prerequisites: [] },
        { id: 'DUP-101', name: 'Duplicate B', code: 'DUP-B', credits: -1, prerequisites: ['MISSING-999'] }
      ]
    }
  ]
};
const invalidCatalogResult = StudyTrackCurriculum.validateCurriculum(invalidCatalogCurriculum);
assert.equal(invalidCatalogResult.valid, false);
assert.ok(invalidCatalogResult.errors.some((error) => error.includes('schema_version')));
assert.ok(invalidCatalogResult.errors.some((error) => error.includes('metadata.source.name')));
assert.ok(invalidCatalogResult.errors.some((error) => error.includes('metadata.source.url')));
assert.ok(invalidCatalogResult.errors.some((error) => error.includes('subjects vacio')));
assert.ok(invalidCatalogResult.errors.some((error) => error.includes('id duplicado')));
assert.ok(invalidCatalogResult.errors.some((error) => error.includes('credits invalido')));
assert.ok(invalidCatalogResult.errors.some((error) => error.includes('prerequisite desconocido')));

const missingAlternativePrerequisiteResult = StudyTrackCurriculum.validateCurriculum({
  schema_version: '2.0',
  metadata: { career_name: 'Broken Alternative', institution: 'Demo U' },
  periods: [
    {
      period_number: 1,
      subjects: [
        { id: 'BASE', name: 'Base', code: 'BASE', credits: 3, prerequisites: [] },
        { id: 'ADV', name: 'Advanced', code: 'ADV', credits: 3, prerequisites: [['MISSING', 'BASE']] }
      ]
    }
  ]
});
assert.equal(missingAlternativePrerequisiteResult.valid, false);
assert.ok(missingAlternativePrerequisiteResult.errors.some((error) => error.includes('prerequisite desconocido: MISSING')));

const normalizedProgress = StudyTrackProgress.normalizeUserProgress({
  'MAT-101': {
    status: 'approved',
    grade: '95',
    attempts: '2',
    completionDate: '2026-05',
    section: '01',
    classroom: 'A-1',
    teacher: 'Docente'
  },
  'LET-101': {
    status: 'invalid',
    grade: 'bad',
    attempts: [{}, {}, {}],
    completionDate: 202605,
    section: 1,
    classroom: null,
    teacher: false
  },
  'NOPE-999': {
    status: 'approved',
    grade: 100
  }
}, validCurriculum);
assert.equal(Object.hasOwn(normalizedProgress, 'NOPE-999'), false);
assert.equal(normalizedProgress['MAT-101'].status, 'approved');
assert.equal(normalizedProgress['MAT-101'].grade, 95);
assert.equal(normalizedProgress['MAT-101'].attempts.length, 2);
assert.equal(normalizedProgress['MAT-101'].completionDate, '2026-05');
assert.equal(normalizedProgress['LET-101'].status, 'pending');
assert.equal(normalizedProgress['LET-101'].grade, null);
assert.equal(normalizedProgress['LET-101'].attempts.length, 3);
assert.equal(normalizedProgress['LET-101'].completionDate, null);
assert.equal(normalizedProgress['LET-101'].section, '');
assert.equal(JSON.stringify([...StudyTrackProgress.getCurriculumSubjectIds(validCurriculum)].sort()), JSON.stringify(['LET-101', 'MAT-101', 'MAT-102', 'SCI-201', 'CAP-400'].sort()));

// normalizeSubjectProgress preserves real attempt objects instead of discarding their data.
const attemptDetail = StudyTrackProgress.normalizeSubjectProgress({ status: 'approved', grade: 90, attempts: [{ date: '2026-01' }, { date: '2026-03' }] });
assert.equal(attemptDetail.attempts.length, 2);
assert.equal(attemptDetail.attempts[0].date, '2026-01');

const academicProgress = {
  'MAT-101': { status: 'approved', grade: 95 },
  'LET-101': { status: 'approved', grade: '' },
  'MAT-102': { status: 'enrolled', grade: 85 },
  'SCI-201': { status: 'pending', grade: null },
  'CAP-400': { status: 'pending', grade: null }
};
const academicSummary = StudyTrackAcademics.calculateAcademicSummary(validCurriculum, academicProgress, {
  getGradePoints: (grade) => StudyTrackGrades.getGradePoints(grade, scale),
  getGradeLabel: (grade) => StudyTrackGrades.getGradeLabel(grade, scale)
});
assert.equal(academicSummary.total, 5);
assert.equal(academicSummary.completed, 2);
assert.equal(academicSummary.earned, 7);
assert.equal(academicSummary.remaining, 3);
assert.equal(academicSummary.hasGrades, true);
assert.equal(academicSummary.globalAvg.toFixed(1), '90.0');
assert.equal(academicSummary.letter.label, 'A');
assert.equal(JSON.stringify(StudyTrackAcademics.calculateFilterCounts(validCurriculum, academicProgress)), JSON.stringify({ all: 5, enrolled: 1, completed: 2, pending: 2 }));
assert.equal(JSON.stringify(StudyTrackAcademics.calculatePeriodStats(validCurriculum.periods[0], academicProgress)), JSON.stringify({ completed: 2, completionPercentage: 100, avgGrade: 0 }));
assert.equal(StudyTrackAcademics.calculatePeriodAverage(validCurriculum.periods[0], academicProgress), '95.0');
assert.equal(StudyTrackAcademics.calculatePeriodGPA4(validCurriculum.periods[0], academicProgress, (grade) => StudyTrackGrades.getGradePoints(grade, scale)), '4.00');

const progress = {
  'MAT-101': { status: 'approved' },
  'LET-101': { status: 'pending' },
  'MAT-102': { status: 'pending' },
  'SCI-201': { status: 'pending' },
  'CAP-400': { status: 'pending' }
};

assert.equal(StudyTrackPrerequisites.checkPrerequisites(['MAT-101'], progress, curriculum), true);
assert.equal(StudyTrackPrerequisites.checkPrerequisites(['LET-101'], progress, curriculum), false);
assert.equal(StudyTrackPrerequisites.checkPrerequisites([['MAT-101', 'LET-101']], progress, curriculum), true);
assert.equal(StudyTrackPrerequisites.checkPrerequisites(['ALL'], progress, curriculum), false);
assert.equal(StudyTrackPrerequisites.formatPrerequisiteString([['MAT-101', 'LET-101'], 'SCI-201']), '(MAT-101 o LET-101) y SCI-201');

const periodForFiltering = {
  period_number: '<1>',
  name: `<script>Periodo</script>`,
  subjects: [
    { id: 'MAT-101', name: 'Matematica I', code: 'MAT-101' },
    { id: 'LET-101', name: 'Letras I', code: 'LET-101' }
  ]
};
assert.equal(StudyTrackPeriods.getVisibleSubjects(periodForFiltering, progress, 'mat', 'all').length, 1);
assert.equal(StudyTrackPeriods.getVisibleSubjects(periodForFiltering, progress, '', 'completed').length, 1);
assert.equal(StudyTrackPeriods.getVisibleSubjects(periodForFiltering, progress, '', 'pending').length, 1);
assert.equal(StudyTrackPeriods.isPeriodOpen(0, new Set([0]), '', 'all'), false);
assert.equal(StudyTrackPeriods.isPeriodOpen(0, new Set([0]), 'mat', 'all'), true);
assert.equal(StudyTrackPeriods.isPeriodOpen(0, new Set([0]), '', 'completed'), true);
// periods.js no longer builds the period header markup itself — the caller
// pre-renders it (via StudyTrackCards.renderPeriodHeaderCard) and hands it in
// as `headerHtml`; periods.js only owns the collapse shell + subject list.
const periodHtml = StudyTrackPeriods.renderPeriodCardHTML({
  periodIndex: 0,
  periodNumber: periodForFiltering.period_number,
  headerHtml: '<div class="header-stub"><script>Header</script></div>',
  visibleSubjects: [periodForFiltering.subjects[0]],
  open: true,
  escapeHtml: StudyTrackSanitize.escapeHtml,
  renderSubject: (subject, periodNumber) => `<article data-period="${StudyTrackSanitize.escapeHtml(periodNumber)}">${StudyTrackSanitize.escapeHtml(subject.name)}</article>`
});
assert.ok(periodHtml.includes('<div class="header-stub"><script>Header</script></div>'), 'Pre-rendered header markup is embedded as-is (its own escaping is StudyTrackCards\' job)');
assert.ok(periodHtml.includes('data-period="&lt;1&gt;"'), 'renderSubject should receive the raw period number so it can escape it itself');
assert.ok(periodHtml.includes('Matematica I'), 'Visible subjects should be rendered via the injected renderSubject callback');
assert.ok(periodHtml.includes('collapsible-content open'), 'Open period should render the open collapsible state');
assert.ok(periodHtml.includes('data-action="togglePeriod"') && periodHtml.includes('data-args="[0]"'), 'Period header should be wired to togglePeriod with its index');
assert.ok(periodHtml.includes('id="period-header-content-0"'), 'Header content wrapper must carry a stable id so it can be patched in place after a subject change');

const closedPeriodHtml = StudyTrackPeriods.renderPeriodCardHTML({
  periodIndex: 2,
  periodNumber: 3,
  headerHtml: '<div></div>',
  visibleSubjects: [],
  open: false,
  escapeHtml: StudyTrackSanitize.escapeHtml,
  renderSubject: () => ''
});
assert.ok(!closedPeriodHtml.includes('collapsible-content open'), 'Closed period should not carry the open class');
assert.ok(!closedPeriodHtml.includes('rotate(180deg)'), 'Closed period chevron should not be rotated');

// ── StudyTrackCards (Phase 3 period/subject card templates) ────────────────
const helpers = { escapeHtml: StudyTrackSanitize.escapeHtml, actionArgs: StudyTrackSanitize.actionArgs };

const activeHeaderHtml = StudyTrackCards.renderPeriodHeaderCard({
  periodNumber: '<4>',
  periodName: '<script>Trimestre 4</script>',
  completed: false,
  subjectCount: 3,
  totalCredits: 13,
  progressPercent: 42,
  average: null,
  enrolledCount: 2
}, { escapeHtml: StudyTrackSanitize.escapeHtml });
assert.ok(activeHeaderHtml.includes('&lt;script&gt;Trimestre 4&lt;/script&gt;'), 'Period name must be escaped');
assert.ok(activeHeaderHtml.includes('&lt;4&gt;'), 'Period number must be escaped, including in the watermark');
assert.ok(activeHeaderHtml.includes('42%'), 'Active period header should render the rounded ring percentage');
assert.ok(activeHeaderHtml.includes('Cursando ahora'), 'Active period header should carry the in-progress eyebrow copy when a subject is enrolled');
assert.ok(activeHeaderHtml.includes('stk-period-index'), 'Active period header should render the left-side period number');
assert.ok(!activeHeaderHtml.includes('<script>Trimestre 4</script>'), 'Period name must not leak unescaped');

// An active period with nothing enrolled yet must NOT claim "Cursando ahora".
const idleHeaderHtml = StudyTrackCards.renderPeriodHeaderCard({
  periodNumber: 5,
  periodName: 'Trimestre 5',
  completed: false,
  subjectCount: 4,
  totalCredits: 14,
  progressPercent: 0,
  average: null,
  enrolledCount: 0
}, { escapeHtml: StudyTrackSanitize.escapeHtml });
assert.ok(!idleHeaderHtml.includes('Cursando ahora'), 'Period with no enrolled subject should not show the in-progress eyebrow');
assert.ok(idleHeaderHtml.includes('Por cursar'), 'Period with no enrolled subject should show the upcoming eyebrow');
assert.ok(idleHeaderHtml.includes('stk-period-index'), 'Idle active period header should still render the left-side period number');

const completedHeaderHtml = StudyTrackCards.renderPeriodHeaderCard({
  periodNumber: 3,
  periodName: 'Trimestre 3',
  completed: true,
  subjectCount: 4,
  totalCredits: 16,
  progressPercent: 100,
  average: 88
}, { escapeHtml: StudyTrackSanitize.escapeHtml });
assert.ok(completedHeaderHtml.includes('Completado'), 'Completed period header should carry the completed eyebrow copy');
assert.ok(completedHeaderHtml.includes('Prom 88'), 'Completed period header should surface the rounded average');
assert.ok(completedHeaderHtml.includes('stk-period-index'), 'Completed period header should render the left-side period number');

const enrolledCardHtml = StudyTrackCards.renderSubjectCard({
  id: 'MAT-103', name: '<script>Análisis</script>', code: 'MAT-103', credits: 5, state: 'enrolled',
  grade: null, scheduleSummary: null, completionLabel: null, prerequisiteLabel: '', missingGrade: false,
  skippedPrerequisite: false, disabled: false, attempts: 0, section: '', classroom: '', teacher: '', completionRaw: ''
}, helpers);
assert.ok(enrolledCardHtml.includes('&lt;script&gt;Análisis&lt;/script&gt;'), 'Subject name must be escaped');
assert.ok(enrolledCardHtml.includes('data-action="toggleEnrollment"'), 'Enrolled card should reuse the existing toggleEnrollment action');
assert.ok(enrolledCardHtml.includes('data-action="openScheduleModal"'), 'Enrolled card without a schedule should offer "Agregar horario" via the existing openScheduleModal action');
assert.ok(enrolledCardHtml.includes('data-action="toggleSubjectDetails"'), 'Enrolled card should stay progressively-disclosable');
assert.ok(!enrolledCardHtml.includes('<script>Análisis</script>'), 'Subject name must not leak unescaped');

const scheduledCardHtml = StudyTrackCards.renderSubjectCard({
  id: 'PRO-102', name: 'Programación II', code: 'PRO-102', credits: 4, state: 'enrolled',
  grade: null, scheduleSummary: 'Mar y Jue · 6:00 PM–8:00 PM', completionLabel: null, prerequisiteLabel: '',
  missingGrade: false, skippedPrerequisite: false, disabled: false, attempts: 0, section: '', classroom: '', teacher: '', completionRaw: ''
}, helpers);
assert.ok(scheduledCardHtml.includes('Mar y Jue'), 'Enrolled card with a schedule should show its summary');
assert.ok(!scheduledCardHtml.includes('data-action="openScheduleModal"'), 'Enrolled card with a schedule already set should not repeat "Agregar horario"');

const availableCardHtml = StudyTrackCards.renderSubjectCard({
  id: 'FIS-201', name: 'Física General', code: 'FIS-201', credits: 4, state: 'available',
  grade: null, scheduleSummary: null, completionLabel: null, prerequisiteLabel: '', missingGrade: false,
  skippedPrerequisite: false, disabled: false, attempts: 0, section: '', classroom: '', teacher: '', completionRaw: ''
}, helpers);
assert.ok(availableCardHtml.includes('Inscribir'), 'Available card should offer the Inscribir action');
assert.ok(availableCardHtml.includes('data-action="toggleEnrollment"'), 'Available card should reuse the existing toggleEnrollment action');

const lockedCardHtml = StudyTrackCards.renderSubjectCard({
  id: 'LAF-201', name: 'Práctica de Física', code: 'LAF-201', credits: 2, state: 'locked',
  grade: null, scheduleSummary: null, completionLabel: null, prerequisiteLabel: 'Física General', missingGrade: false,
  skippedPrerequisite: false, disabled: true, attempts: 0, section: '', classroom: '', teacher: '', completionRaw: ''
}, helpers);
assert.ok(lockedCardHtml.includes('requiere Física General'), 'Locked card should surface the prerequisite requirement');
assert.ok(!lockedCardHtml.includes('Inscribir'), 'Locked + disabled card should not offer the Inscribir action');
assert.ok(lockedCardHtml.includes('data-action="showPrerequisitePopover"'), 'Locked card should reuse the existing showPrerequisitePopover action');

const approvedCardHtml = StudyTrackCards.renderSubjectCard({
  id: 'FGI-104', name: 'Programación I', code: 'FGI-104', credits: 3, state: 'approved',
  grade: 92, scheduleSummary: null, completionLabel: 'Concluida mar 2025', prerequisiteLabel: '', missingGrade: false,
  skippedPrerequisite: false, disabled: false, attempts: 0, section: '', classroom: '', teacher: '', completionRaw: '2025-03'
}, helpers);
assert.ok(approvedCardHtml.includes('Concluida mar 2025'), 'Approved row should show the formatted completion label when available');
assert.ok(approvedCardHtml.includes('value="92"'), 'Approved row should surface the recorded grade');
assert.ok(!approvedCardHtml.includes('Falta registrar la nota'), 'Approved row with a grade should not show the missing-grade warning');

const warningCardHtml = StudyTrackCards.renderSubjectCard({
  id: 'FGI-105', name: 'Estructuras de Datos', code: 'FGI-105', credits: 4, state: 'warning',
  grade: null, scheduleSummary: null, completionLabel: null, prerequisiteLabel: '', missingGrade: true,
  skippedPrerequisite: false, disabled: false, attempts: 0, section: '', classroom: '', teacher: '', completionRaw: ''
}, helpers);
assert.ok(warningCardHtml.includes('Falta registrar la nota'), 'Warning row missing a grade should show the warning text');
assert.ok(warningCardHtml.includes('stk-subject-card--warning'), 'Warning row should carry the warning state class');
assert.ok(warningCardHtml.includes('data-change="updateGrade"'), 'Warning row should reuse the existing updateGrade action to capture the missing grade');

const graph = StudyTrackPrerequisites.buildDependencyGraph(curriculum);
assert.deepEqual(Array.from(graph.dependents.get('MAT-101')), ['MAT-102', 'SCI-201']);
assert.equal(graph.unlocks.get('MAT-101'), 2);
assert.deepEqual(Array.from(graph.allPrereqSubjects), ['CAP-400']);
assert.equal(JSON.stringify(StudyTrackProgress.getAffectedSubjectIds('MAT-101', graph)), JSON.stringify(['MAT-101', 'MAT-102', 'SCI-201', 'CAP-400']));

const rawRequirements = [
  { id: 'r1', name: '  Pasantia  ', completed: true },
  { id: 'r2', name: '', completed: true },
  { id: 'r3', name: 'Monografico', completed: false }
];
const normalizedRequirements = StudyTrackRequirements.normalizeRequirements(rawRequirements);
assert.equal(normalizedRequirements.length, 2);
assert.equal(normalizedRequirements[0].name, 'Pasantia');
assert.equal(JSON.stringify(StudyTrackRequirements.getRequirementStats(normalizedRequirements)), JSON.stringify({ total: 2, completed: 1, percentage: 50 }));

const addedRequirement = StudyTrackRequirements.addRequirement(normalizedRequirements, ' Ingles ', () => 'r4');
assert.equal(addedRequirement.changed, true);
assert.equal(addedRequirement.requirement.id, 'r4');
assert.equal(addedRequirement.requirements.length, 3);
assert.equal(normalizedRequirements.length, 2);

const emptyRequirement = StudyTrackRequirements.addRequirement(normalizedRequirements, '   ', () => 'never');
assert.equal(emptyRequirement.changed, false);

const toggledRequirement = StudyTrackRequirements.toggleRequirement(addedRequirement.requirements, 1);
assert.equal(toggledRequirement.changed, true);
assert.equal(toggledRequirement.requirements[1].completed, true);

const invalidToggleRequirement = StudyTrackRequirements.toggleRequirement(addedRequirement.requirements, 50);
assert.equal(invalidToggleRequirement.changed, false);

const deletedRequirement = StudyTrackRequirements.deleteRequirement(toggledRequirement.requirements, 0);
assert.equal(deletedRequirement.changed, true);
assert.equal(deletedRequirement.requirements[0].id, 'r3');

const invalidDeletedRequirement = StudyTrackRequirements.deleteRequirement(toggledRequirement.requirements, -1);
assert.equal(invalidDeletedRequirement.changed, false);

const requirementWidgetHtml = StudyTrackRequirements.renderRequirementsWidgetHTML(
  [{ id: 'x', name: `<img src=x onerror='bad'>`, completed: true }],
  { expanded: true, escapeHtml: StudyTrackSanitize.escapeHtml }
);
assert.ok(requirementWidgetHtml.includes('&lt;img src=x onerror=&#39;bad&#39;&gt;'));
assert.ok(!requirementWidgetHtml.includes(`<img src=x onerror='bad'>`));
assert.ok(requirementWidgetHtml.includes('1/1'));

const collapsedRequirementWidgetHtml = StudyTrackRequirements.renderRequirementsWidgetHTML(
  [{ id: 'x', name: 'Oculto', completed: false }],
  { expanded: false, escapeHtml: StudyTrackSanitize.escapeHtml }
);
assert.ok(!collapsedRequirementWidgetHtml.includes('Oculto</span>'));

const emptyRequirementWidgetHtml = StudyTrackRequirements.renderRequirementsWidgetHTML([], { escapeHtml: StudyTrackSanitize.escapeHtml });
assert.equal(emptyRequirementWidgetHtml, '<div class="text-xs text-slate-400 text-center italic">Sin requisitos</div>');

const settingsRequirementHtml = StudyTrackRequirements.renderSettingsRequirementsHTML(
  [{ id: 'x', name: `<script>bad</script>`, completed: true }],
  { escapeHtml: StudyTrackSanitize.escapeHtml }
);
assert.ok(settingsRequirementHtml.includes('checked'));
assert.ok(settingsRequirementHtml.includes('&lt;script&gt;bad&lt;/script&gt;'));
assert.ok(!settingsRequirementHtml.includes('<script>bad</script>'));

assert.equal(StudyTrackSchedule.formatTime12h('00:30'), '12:30 AM');
assert.equal(StudyTrackSchedule.formatTime12h('13:05'), '1:05 PM');
assert.equal(StudyTrackSchedule.isValidTimeRange('08:00', '10:00'), true);
assert.equal(StudyTrackSchedule.isValidTimeRange('10:00', '10:00'), false);

const enrolledSubjects = [
  { id: 'MAT-101', name: 'Matematica I' },
  { id: 'LET-101', name: 'Letras I' }
];
const scheduleData = {
  'MAT-101': [{ id: 'b1', day: 'lunes', startTime: '08:00', endTime: '10:00', room: 'A1' }],
  'LET-101': [{ id: 'b2', day: 'martes', startTime: '09:00', endTime: '11:00', room: '' }]
};
const blocks = StudyTrackSchedule.collectScheduleBlocks(enrolledSubjects, scheduleData);
assert.equal(blocks.length, 2);
assert.equal(blocks[0].subject.name, 'Matematica I');
assert.equal(blocks[1].color, 'bg-emerald-500');

const byDay = StudyTrackSchedule.groupBlocksByDay([
  { day: 'lunes', startTime: '12:00' },
  { day: 'lunes', startTime: '08:00' },
  { day: 'domingo', startTime: '07:00' }
]);
assert.equal(JSON.stringify(byDay.lunes.map((block) => block.startTime)), JSON.stringify(['08:00', '12:00']));
assert.equal(byDay.domingo.length, 1);

assert.equal(StudyTrackSchedule.rangesOverlap('08:00', '10:00', '09:00', '11:00'), true);
assert.equal(StudyTrackSchedule.rangesOverlap('08:00', '10:00', '10:00', '12:00'), false);
assert.equal(StudyTrackSchedule.rangesOverlap('8:00', '10:00', '9:00', '11:00'), true, 'Overlap must work with non-zero-padded times');
assert.equal(
  StudyTrackSchedule.findScheduleConflict({
    day: 'lunes',
    start: '09:30',
    end: '10:30',
    enrolledSubjects,
    scheduleData
  }).subject,
  'Matematica I'
);
assert.equal(
  StudyTrackSchedule.findScheduleConflict({
    day: 'lunes',
    start: '09:30',
    end: '10:30',
    enrolledSubjects,
    scheduleData,
    excludeSubjectId: 'MAT-101',
    excludeBlockId: 'b1'
  }).conflict,
  false
);

const duplicateBlockIdScheduleData = {
  'MAT-101': [{ id: 'same-id', day: 'lunes', startTime: '08:00', endTime: '10:00' }],
  'LET-101': [{ id: 'same-id', day: 'lunes', startTime: '09:00', endTime: '11:00' }]
};
assert.equal(
  StudyTrackSchedule.findScheduleConflict({
    day: 'lunes',
    start: '08:30',
    end: '09:30',
    enrolledSubjects,
    scheduleData: duplicateBlockIdScheduleData,
    excludeSubjectId: 'MAT-101',
    excludeBlockId: 'same-id'
  }).subject,
  'Letras I'
);

assert.equal(
  StudyTrackSchedule.validateScheduleBlockOperation({
    day: 'lunes',
    start: '10:00',
    end: '10:00',
    enrolledSubjects,
    scheduleData
  }).reason,
  'invalid-range'
);
assert.equal(
  StudyTrackSchedule.validateScheduleBlockOperation({
    day: 'lunes',
    start: '09:00',
    end: '09:30',
    enrolledSubjects,
    scheduleData
  }).reason,
  'conflict'
);
assert.equal(
  StudyTrackSchedule.validateScheduleBlockOperation({
    day: 'jueves',
    start: '09:00',
    end: '09:30',
    enrolledSubjects,
    scheduleData
  }).valid,
  true
);

const addedSchedule = StudyTrackSchedule.upsertScheduleBlock(
  scheduleData,
  'MAT-101',
  { id: 'b3', day: 'viernes', startTime: '14:00', endTime: '16:00', room: 'B2' }
);
assert.equal(addedSchedule.changed, true);
assert.equal(addedSchedule.scheduleData['MAT-101'].length, 2);
assert.equal(scheduleData['MAT-101'].length, 1);

const editedSchedule = StudyTrackSchedule.upsertScheduleBlock(
  addedSchedule.scheduleData,
  'MAT-101',
  { day: 'viernes', startTime: '15:00', endTime: '17:00', room: 'B3' },
  'b3'
);
assert.equal(editedSchedule.changed, true);
assert.equal(editedSchedule.scheduleData['MAT-101'][1].startTime, '15:00');
assert.equal(editedSchedule.scheduleData['MAT-101'][1].room, 'B3');

const missingEdit = StudyTrackSchedule.upsertScheduleBlock(
  scheduleData,
  'MAT-101',
  { day: 'viernes', startTime: '15:00', endTime: '17:00', room: 'B3' },
  'missing'
);
assert.equal(missingEdit.changed, false);

const deletedSchedule = StudyTrackSchedule.deleteScheduleBlock(editedSchedule.scheduleData, 'MAT-101', 'b3');
assert.equal(deletedSchedule.changed, true);
assert.equal(deletedSchedule.scheduleData['MAT-101'].length, 1);

const deletedLastBlock = StudyTrackSchedule.deleteScheduleBlock({ 'MAT-101': [{ id: 'last' }] }, 'MAT-101', 'last');
assert.equal(deletedLastBlock.changed, true);
assert.equal(Object.hasOwn(deletedLastBlock.scheduleData, 'MAT-101'), false);

const deletedMissingBlock = StudyTrackSchedule.deleteScheduleBlock(scheduleData, 'MAT-101', 'missing');
assert.equal(deletedMissingBlock.changed, false);

const unsafeSubject = [{ id: `MAT'101`, code: '<M1>', name: `<img src=x onerror='bad'>` }];
const unsafeScheduleData = {
  "MAT'101": [{ id: `b'1`, day: 'lunes', startTime: '08:00', endTime: '10:00', room: `<script>room</script>` }]
};
const enrolledScheduleHtml = StudyTrackSchedule.renderEnrolledScheduleHTML(unsafeSubject, unsafeScheduleData, {
  escapeHtml: StudyTrackSanitize.escapeHtml,
  escapeJsString: StudyTrackSanitize.escapeJsString
});
assert.ok(enrolledScheduleHtml.includes('&lt;img src=x onerror=&#39;bad&#39;&gt;'));
assert.ok(enrolledScheduleHtml.includes('&lt;M'));
assert.ok(enrolledScheduleHtml.includes('MAT&#39;101'), 'Subject id must be HTML-escaped inside data-args');
assert.ok(enrolledScheduleHtml.includes('b&#39;1'), 'Block id must be HTML-escaped inside data-args');
assert.ok(!enrolledScheduleHtml.includes(`'MAT'101'`), 'Subject id must not appear unescaped');
assert.ok(enrolledScheduleHtml.includes('schedule-subject-row'));
assert.ok(enrolledScheduleHtml.includes('w-full sm:w-auto'));
assert.ok(!enrolledScheduleHtml.includes(`<img src=x onerror='bad'>`));

const unscheduledSubjectHtml = StudyTrackSchedule.renderEnrolledScheduleHTML(
  [{ id: 'NO-SCHEDULE', code: 'NS', name: 'Sin horario' }],
  {},
  { escapeHtml: StudyTrackSanitize.escapeHtml, escapeJsString: StudyTrackSanitize.escapeJsString }
);
assert.ok(unscheduledSubjectHtml.includes('Sin horario asignado'));

const weeklyScheduleHtml = StudyTrackSchedule.renderWeeklyScheduleHTML(
  StudyTrackSchedule.collectScheduleBlocks(unsafeSubject, unsafeScheduleData),
  { escapeHtml: StudyTrackSanitize.escapeHtml, escapeJsString: StudyTrackSanitize.escapeJsString }
);
assert.ok(weeklyScheduleHtml.includes('&lt;img src=x onerror=&#39;bad&#39;&gt;'));
assert.ok(weeklyScheduleHtml.includes('&lt;script&gt;room&lt;/script&gt;'));
assert.ok(!weeklyScheduleHtml.includes('<script>room</script>'));

assert.equal(StudyTrackSchedule.timeToDecimal('08:30'), 8.5);
assert.equal(JSON.stringify(StudyTrackSchedule.getVisualScheduleRange([
  { startTime: '08:00', endTime: '10:00' },
  { startTime: '13:30', endTime: '15:30' }
])), JSON.stringify({ minHour: 7, maxHour: 17 }));

const visualSchedule = StudyTrackSchedule.renderVisualScheduleHTML(
  StudyTrackSchedule.collectScheduleBlocks(unsafeSubject, unsafeScheduleData),
  { escapeHtml: StudyTrackSanitize.escapeHtml, escapeJsString: StudyTrackSanitize.escapeJsString }
);
assert.ok(visualSchedule.height > 0);
assert.ok(visualSchedule.html.includes('&lt;img src=x onerror=&#39;bad&#39;&gt;'));
assert.ok(visualSchedule.html.includes('&lt;script&gt;room&lt;/script&gt;'));
assert.ok(visualSchedule.html.includes('data-action="showBlockDetails"') && visualSchedule.html.includes('MAT&#39;101') && visualSchedule.html.includes('b&#39;1'), 'Visual schedule blocks open details via an escaped delegated action');
assert.ok(!visualSchedule.html.includes('<script>room</script>'));

const insights = StudyTrackInsights.buildHomeInsights({
  curriculum: validCurriculum,
  progress: academicProgress,
  dependencyGraph: StudyTrackPrerequisites.buildDependencyGraph(validCurriculum),
  scheduleData: { 'MAT-102': [{ id: 'h1', day: 'lunes', startTime: '08:00', endTime: '10:00' }] },
  canTakeSubject: (subject) => StudyTrackPrerequisites.checkPrerequisites(subject.prerequisites, academicProgress, validCurriculum)
});
assert.equal(insights.enrolled.length, 1);
assert.equal(insights.missingGrades.length, 1);
assert.equal(insights.available.length, 1);
assert.equal(insights.blocked.length, 1);
assert.equal(insights.scheduleSummary.scheduled, 1);
assert.equal(insights.nextAction.type, 'missing-grade');
assert.equal(insights.recommended[0].id, 'SCI-201');
assert.equal(insights.recommended[0].recommendation.category, 'light-load');
assert.equal(insights.recommended[0].recommendation.reason, 'Buena opción de carga ligera');

const recommendationCurriculum = {
  metadata: { career_name: 'Recomendaciones', institution: 'Demo U' },
  periods: [
    {
      period_number: 1,
      subjects: [
        { id: 'BASE-1', name: 'Base 1', code: 'BASE-1', credits: 4, prerequisites: [] },
        { id: 'BASE-2', name: 'Base 2', code: 'BASE-2', credits: 2, prerequisites: [] }
      ]
    },
    {
      period_number: 2,
      subjects: [
        { id: 'IMPACT', name: 'Impacto', code: 'IMP-201', credits: 4, prerequisites: [] },
        { id: 'LIGHT', name: 'Ligera', code: 'LIG-201', credits: 2, prerequisites: [] },
        { id: 'NEXT-1', name: 'Siguiente 1', code: 'NXT-301', credits: 3, prerequisites: ['IMPACT'] },
        { id: 'NEXT-2', name: 'Siguiente 2', code: 'NXT-302', credits: 3, prerequisites: ['IMPACT'] }
      ]
    }
  ]
};
const recommendationProgress = {
  'BASE-1': { status: 'approved', grade: 90 },
  'BASE-2': { status: 'approved', grade: 90 },
  IMPACT: { status: 'pending' },
  LIGHT: { status: 'pending' },
  'NEXT-1': { status: 'pending' },
  'NEXT-2': { status: 'pending' }
};
const recommendationGraph = StudyTrackPrerequisites.buildDependencyGraph(recommendationCurriculum);
const rankedRecommendations = StudyTrackInsights.rankRecommendedSubjects(
  recommendationCurriculum,
  recommendationProgress,
  recommendationGraph,
  (subject) => StudyTrackPrerequisites.checkPrerequisites(subject.prerequisites, recommendationProgress, recommendationCurriculum)
);
assert.equal(rankedRecommendations[0].id, 'IMPACT');
assert.equal(rankedRecommendations[0].recommendation.category, 'unlock');
assert.equal(rankedRecommendations[0].recommendation.badge, 'Alto impacto');
assert.equal(rankedRecommendations[1].id, 'LIGHT');
assert.equal(rankedRecommendations[1].recommendation.category, 'light-load');

// Milestones engine (compare via primitives: vm-realm arrays aren't deepStrictEqual to main-realm [])
assert.equal(StudyTrackMilestones.evaluateMilestones({ subjectsApproved: 0, progress: 0, periodsTaken: 0 }).length, 0, 'No milestones with empty progress');
{
  const ids = StudyTrackMilestones.evaluateMilestones({ subjectsApproved: 3, progress: 30, periodsTaken: 1, average: 88 }).map(d => d.id);
  assert.ok(ids.includes('first-subject') && ids.includes('first-period') && ids.includes('progress-25'), 'Early milestones achieved');
  assert.ok(!ids.includes('subjects-5') && !ids.includes('progress-50') && !ids.includes('excellence'), 'Higher milestones not yet achieved');
}
{
  const ids = StudyTrackMilestones.evaluateMilestones({ subjectsApproved: 12, progress: 100, periodsTaken: 4, average: 95 }).map(d => d.id);
  assert.ok(['first-subject', 'first-period', 'subjects-5', 'progress-25', 'subjects-10', 'progress-50', 'excellence', 'progress-75', 'progress-100'].every(x => ids.includes(x)), 'All milestones achieved at full completion');
}
assert.equal(StudyTrackMilestones.normalizeStats({ average: 'x' }).average, null, 'Non-numeric average normalizes to null (no excellence)');
{
  const achieved = StudyTrackMilestones.evaluateMilestones({ subjectsApproved: 6, progress: 26 });
  const rec = StudyTrackMilestones.reconcileMilestones(achieved, { 'first-subject': '2026-01-01', 'progress-25': '2026-01-02' });
  assert.equal(rec.newlyAchieved.slice().sort().join('|'), 'subjects-5', 'Only the genuinely new milestone is flagged');
}

// --- Reglas de negocio confirmadas (2026-10-18) ---
// Cada bloque protege una regla de negocio. Si un cambio la rompe, no ajustes el test:
// confirma primero con el dueño del producto si la regla cambió.

// Regla de negocio: la aprobación masiva respeta la nota mínima, igual que applyGradeToSubjectProgress.
{
  const cur = { periods: [{ period_number: 1, subjects: [{ id: 'A' }] }] };
  const low = StudyTrackProgress.applyBulkApprovalForPeriods(cur, {}, { 1: 50 });
  assert.equal(low.A.status, 'pending');
  assert.equal(low.A.grade, 50);
  assert.equal(StudyTrackProgress.applyBulkApprovalForPeriods(cur, {}, { 1: 85 }, 90).A.status, 'pending');
  assert.equal(StudyTrackProgress.applyBulkApprovalForPeriods(cur, {}, { 1: 90 }, 90).A.status, 'approved');
  assert.equal(StudyTrackProgress.applyBulkApprovalForPeriods(cur, {}, { 1: 70 }).A.status, 'approved');
  assert.equal(StudyTrackProgress.applyBulkApprovalForPeriods(cur, { A: { status: 'enrolled' } }, { 1: 50 }).A.status, 'enrolled');
}

// Regla de negocio: "ALL" junto a otros prerrequisitos exige ambos (p. ej. un seminario optativo que "ALL" no cubre).
{
  const cur = { periods: [{ subjects: [{ id: 'A' }, { id: 'SEM', is_optional: true }, { id: 'TES', prerequisites: ['ALL', 'SEM'] }] }] };
  assert.equal(StudyTrackPrerequisites.checkPrerequisites(['ALL', 'SEM'], { A: { status: 'approved' } }, cur), false);
  assert.equal(StudyTrackPrerequisites.checkPrerequisites(['ALL', 'SEM'], { A: { status: 'approved' }, SEM: { status: 'approved' } }, cur), true);
  assert.equal(StudyTrackPrerequisites.checkPrerequisites(['ALL', 'SEM'], { SEM: { status: 'approved' } }, cur), false);
  assert.equal(StudyTrackPrerequisites.checkPrerequisites(['ALL'], {}, null), false); // no curriculum: stays blocked
  // ...and the label must not hide the extra requirement
  assert.equal(StudyTrackPrerequisites.formatPrerequisiteString(['ALL', 'SEM']), 'Todas y SEM');
  assert.equal(StudyTrackPrerequisites.formatPrerequisiteString(['ALL']), 'Todas');
}

// Regla de negocio: la búsqueda ignora las tildes en ambos sentidos.
{
  const subject = { id: 'A', name: 'Cálculo I', code: 'MAT-101' };
  assert.equal(StudyTrackPeriods.subjectMatchesFilter(subject, {}, 'calculo', 'all'), true);
  assert.equal(StudyTrackPeriods.subjectMatchesFilter({ id: 'B', name: 'Calculo II' }, {}, 'cálculo', 'all'), true);
  assert.equal(StudyTrackPeriods.subjectMatchesFilter(subject, {}, 'fisica', 'all'), false);
}

// Regla de negocio: una nota hecha solo de espacios significa "sin nota", igual que parseGradeInput.
assert.equal(StudyTrackGrades.getGradeLabel('   ', scale), null);
assert.equal(StudyTrackGrades.getGradeLabel(' 85 ', scale).label, 'B');

// Values built inside the vm context have that realm's prototypes; compare them as plain data.
const plainData = (value) => JSON.parse(JSON.stringify(value));
const sameData = (actual, expected, message) => assert.deepEqual(plainData(actual), expected, message);

// ===== Eventos de la universidad (openspec/changes/eventos-universidad) =====
{
  const U = StudyTrackUniEvents;
  const ICS = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Moodle Pty Ltd//NONSGML Moodle Version 2024//EN',
    'BEGIN:VEVENT', 'UID:101@eva.uapa.edu.do', 'SUMMARY:Vencimiento de Proyecto final (Valor de 40 puntos)',
    'DTSTART:20261016T035900Z', 'DTEND:20261016T035900Z', 'CATEGORIES:202633-ISW410-V20-1187-0', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:102@eva.uapa.edu.do', 'SUMMARY:Vencimiento de Tarea # 1\\, parte A\; con nota',
    'DTSTART:20261021T035900Z', 'CATEGORIES:202633-ISW201-V20-1210-0', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:103@eva.uapa.edu.do', 'SUMMARY:Vencimiento de Un título muy largo que Moodle par',
    ' te en dos líneas', 'DTSTART:20261101T120000Z', 'CATEGORIES:202633-XYZ999-V20-1-0', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:104@eva.uapa.edu.do', 'SUMMARY:Feriado', 'DTSTART;VALUE=DATE:20261106', 'END:VEVENT',
    'END:VCALENDAR', '',
  ].join('\r\n');

  // Regla de negocio: se lee un evento por cada VEVENT, con su fecha en UTC; las líneas partidas por Moodle se unen y los caracteres escapados se leen bien.
  const parsed = U.parseIcs(ICS);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.events.length, 4);
  sameData(parsed.events[0], { uid: '101@eva.uapa.edu.do', summary: 'Vencimiento de Proyecto final (Valor de 40 puntos)', start: '2026-10-16T03:59:00.000Z', allDay: false, categories: ['202633-ISW410-V20-1187-0'] });
  assert.equal(parsed.events[1].summary, 'Vencimiento de Tarea # 1, parte A; con nota');
  assert.equal(parsed.events[2].summary, 'Vencimiento de Un título muy largo que Moodle parte en dos líneas');
  sameData([parsed.events[3].start, parsed.events[3].allDay, parsed.events[3].categories], ['2026-11-06', true, []]);
  assert.equal(U.parseIcs(ICS.replace(/\r\n/g, '\n')).events.length, 4, 'LF line endings work too');

  // Regla de negocio: una respuesta que no es un calendario (por ejemplo la página de login) no se acepta.
  sameData(U.parseIcs('<!DOCTYPE html><html><body>Acceder</body></html>'), { ok: false, error: 'not-calendar' });
  sameData(U.parseIcs(''), { ok: false, error: 'not-calendar' });
  assert.equal(U.parseIcs('﻿' + ICS).ok, true, 'a leading BOM is fine');

  // Regla de negocio: el código del curso sale de CATEGORIES ("202633-ISW201-V20-1210-0" → "ISW201").
  assert.equal(U.courseCodeFromCategory('202633-ISW201-V20-1210-0'), 'ISW201');
  assert.equal(U.courseCodeFromCategory('202633-mer415-V22-3371-0'), 'MER415');
  assert.equal(U.courseCodeFromCategory('Sin código'), null);
  assert.equal(U.courseCodeFromCategory(''), null);

  const curriculum = { periods: [
    { period_number: 3, subjects: [{ id: 'ISW-201', code: 'ISW-201', name: 'Ingeniería de Software I' }] },
    { period_number: 9, subjects: [{ id: 'ISW-410', code: 'ISW-410', name: 'Seminario de Proyecto I' }] },
  ] };

  // Regla de negocio: cada evento se asocia a la materia cuyo código coincide con el del curso, sin importar guiones ni mayúsculas; si no hay materia, el evento se muestra igual sin materia.
  // Regla de negocio: el título quita el prefijo "Vencimiento de ".
  const events = U.toUniEvents(parsed.events, curriculum);
  sameData(events.map((e) => [e.uid, e.subjectId]), [
    ['101@eva.uapa.edu.do', 'ISW-410'], ['102@eva.uapa.edu.do', 'ISW-201'], ['103@eva.uapa.edu.do', null], ['104@eva.uapa.edu.do', null],
  ]);
  sameData(events[0], { uid: '101@eva.uapa.edu.do', title: 'Proyecto final (Valor de 40 puntos)', dueAt: '2026-10-16T03:59:00.000Z', allDay: false, courseCode: 'ISW410', subjectId: 'ISW-410' });
  assert.equal(events[3].title, 'Feriado');
  assert.equal(U.toUniEvents(parsed.events, null)[0].subjectId, null, 'without a curriculum nothing is linked');

  // Regla de negocio: si el calendario trae el mismo evento dos veces, se queda uno; la lista sale ordenada por fecha.
  const dup = U.toUniEvents([parsed.events[1], parsed.events[0], parsed.events[1]], curriculum);
  sameData(dup.map((e) => e.uid), ['101@eva.uapa.edu.do', '102@eva.uapa.edu.do']);

  // Regla de negocio: una entrega vencida se muestra como vencida durante 7 días y después se oculta.
  const due = { uid: 'x', title: 'X', dueAt: '2026-10-16T03:59:00.000Z', allDay: false, courseCode: null, subjectId: null };
  assert.equal(U.isOverdue(due, '2026-10-16T03:58:59.000Z'), false);
  assert.equal(U.isOverdue(due, '2026-10-16T03:59:00.000Z'), false);          // justo a la hora todavía no está vencida
  assert.equal(U.isOverdue(due, '2026-10-16T03:59:00.001Z'), true);
  assert.equal(U.isVisible(due, '2026-10-23T03:59:00.000Z'), true);           // exactamente 7 días después: todavía se ve
  assert.equal(U.isVisible(due, '2026-10-23T03:59:00.001Z'), false);          // un instante más: se oculta
  assert.equal(U.isVisible(due, '2026-10-01T00:00:00.000Z'), true);

  // Regla de negocio: las próximas entregas son las visibles, ordenadas por fecha (las vencidas recientes primero).
  const now = '2026-10-19T15:00:00.000Z';
  sameData(U.upcoming(events, now).map((e) => e.uid), ['101@eva.uapa.edu.do', '102@eva.uapa.edu.do', '103@eva.uapa.edu.do', '104@eva.uapa.edu.do']);
  sameData(U.upcoming(events, '2026-10-24T00:00:00.000Z').map((e) => e.uid), ['102@eva.uapa.edu.do', '103@eva.uapa.edu.do', '104@eva.uapa.edu.do']);

  // Regla de negocio: la próxima entrega de una materia es la más cercana que todavía no venció; si no hay, ninguna.
  assert.equal(U.nextForSubject(events, 'ISW-201', now).uid, '102@eva.uapa.edu.do');
  assert.equal(U.nextForSubject(events, 'ISW-410', now), null);               // la suya ya venció
  assert.equal(U.nextForSubject(events, 'NO-EXISTE', now), null);

  // Regla de negocio: el día del calendario se calcula en la hora local: 03:59 UTC del 16 es el 15 a las 11:59 p. m. en RD.
  assert.equal(U.dayKey('2026-10-16T03:59:00.000Z', 'America/Santo_Domingo'), '2026-10-15');
  assert.equal(U.dayKey('2026-10-16T04:00:00.000Z', 'America/Santo_Domingo'), '2026-10-16');
  assert.equal(U.dayKey('2026-11-06', 'America/Santo_Domingo'), '2026-11-06');  // un evento de todo el día no cambia de día

  // Regla de negocio: la vista de calendario agrupa los eventos por día local, solo los del mes pedido (mes 1 = enero).
  const october = U.eventsByDay(events, 2026, 10, 'America/Santo_Domingo');
  sameData(Object.keys(october).sort(), ['2026-10-15', '2026-10-20']);
  sameData(october['2026-10-15'].map((e) => e.uid), ['101@eva.uapa.edu.do']);
  sameData(Object.keys(U.eventsByDay(events, 2026, 11, 'America/Santo_Domingo')).sort(), ['2026-11-01', '2026-11-06']);
  sameData(U.eventsByDay([], 2026, 10, 'America/Santo_Domingo'), {});
}

// ===== Descarga del calendario =====
{
  const U = StudyTrackUniEvents;
  const URL_OK = 'https://eva.uapa.edu.do/calendar/export_execute.php?userid=1&authtoken=abc&preset_what=all&preset_time=recentupcoming';
  const PROXY = 'https://ics-proxy.example.workers.dev';
  const CAL = 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n';
  const fakeFetch = (plan) => { const calls = []; const f = async (u) => { calls.push(u); const step = plan.shift(); if (step instanceof Error) throw step; return { ok: step.status === 200, status: step.status, text: async () => step.body }; }; f.calls = calls; return f; };

  // Regla de negocio: solo se acepta un enlace https de exportación de calendario de Moodle.
  for (const bad of ['', 'http://eva.uapa.edu.do/calendar/export_execute.php?x=1', 'https://eva.uapa.edu.do/login/index.php', 'no es un enlace']) {
    sameData(await U.loadCalendarText(bad, { fetchImpl: fakeFetch([]), proxyUrl: PROXY }), { ok: false, error: 'invalid-url' });
  }

  // Regla de negocio: primero se intenta directo; si funciona, no se usa el intermediario.
  let f = fakeFetch([{ status: 200, body: CAL }]);
  sameData(await U.loadCalendarText(URL_OK, { fetchImpl: f, proxyUrl: PROXY }), { ok: true, text: CAL, via: 'direct' });
  sameData(f.calls, [URL_OK]);

  // Regla de negocio: si el navegador bloquea la descarga directa (error de red/CORS), se usa el intermediario con el enlace codificado.
  f = fakeFetch([new TypeError('Failed to fetch'), { status: 200, body: CAL }]);
  sameData(await U.loadCalendarText(URL_OK, { fetchImpl: f, proxyUrl: PROXY }), { ok: true, text: CAL, via: 'proxy' });
  sameData(f.calls, [URL_OK, `${PROXY}?url=${encodeURIComponent(URL_OK)}`]);

  // Regla de negocio: sin intermediario configurado, un bloqueo se reporta como error de red.
  f = fakeFetch([new TypeError('Failed to fetch')]);
  sameData(await U.loadCalendarText(URL_OK, { fetchImpl: f }), { ok: false, error: 'network' });
  f = fakeFetch([new TypeError('Failed to fetch'), new TypeError('Failed to fetch')]);
  sameData(await U.loadCalendarText(URL_OK, { fetchImpl: f, proxyUrl: PROXY }), { ok: false, error: 'network' });

  // Regla de negocio: si la universidad responde con error, se informa el código y no se reintenta por el intermediario.
  f = fakeFetch([{ status: 403, body: 'Forbidden' }]);
  sameData(await U.loadCalendarText(URL_OK, { fetchImpl: f, proxyUrl: PROXY }), { ok: false, error: 'http-403' });
  assert.equal(f.calls.length, 1);

  // Regla de negocio: si lo descargado no es un calendario (enlace vencido → página de login), se avisa.
  f = fakeFetch([{ status: 200, body: '<html>Acceder</html>' }]);
  sameData(await U.loadCalendarText(URL_OK, { fetchImpl: f, proxyUrl: PROXY }), { ok: false, error: 'not-calendar' });
}

// Regla de negocio: una nota con coma decimal vale lo mismo que con punto ("85,5" = 85.5).
assert.equal(StudyTrackGrades.parseGradeNumber('85,5'), 85.5);
assert.equal(StudyTrackGrades.parseGradeNumber('85.5'), 85.5);
assert.equal(StudyTrackGrades.parseGradeNumber(' 85,5 '), 85.5);
assert.equal(StudyTrackGrades.parseGradeNumber('0,5'), 0.5);
assert.equal(StudyTrackGrades.parseGradeNumber('100'), 100);
assert.equal(StudyTrackGrades.parseGradeNumber('0'), 0);
assert.equal(StudyTrackGrades.parseGradeNumber(85.5), 85.5);   // a number already stored passes through
assert.equal(StudyTrackGrades.parseGradeNumber(0), 0);

// Regla de negocio: si la nota empieza con un número y sigue texto, se toma el número ("70abc" → 70).
assert.equal(StudyTrackGrades.parseGradeNumber('70abc'), 70);
assert.equal(StudyTrackGrades.parseGradeNumber('85,5 puntos'), 85.5);

// Regla de negocio: vacío, solo espacios, o texto sin número al inicio significa "sin nota".
assert.equal(StudyTrackGrades.parseGradeNumber(''), null);
assert.equal(StudyTrackGrades.parseGradeNumber('   '), null);
assert.equal(StudyTrackGrades.parseGradeNumber('abc'), null);
assert.equal(StudyTrackGrades.parseGradeNumber(null), null);
assert.equal(StudyTrackGrades.parseGradeNumber(undefined), null);

// Regla de negocio: la coma se acepta en todas partes donde se lee una nota.
assert.equal(StudyTrackProgress.parseGradeInput('85,5'), 85.5);
assert.equal(StudyTrackProgress.parseGradeInput('70abc'), 70);
assert.equal(StudyTrackAcademics.getNumericGrade({ grade: '85,5' }), 85.5);
assert.equal(StudyTrackAcademics.getNumericGrade({ grade: 'abc' }), null);
assert.equal(StudyTrackGrades.getGradeLabel('85,5', scale).label, 'B');
assert.equal(StudyTrackGrades.getGradeLabel('89,9', scale).label, 'B');
assert.equal(StudyTrackGrades.getGradeLabel('90,0', scale).label, 'A');   // límite de A escrito con coma
assert.equal(StudyTrackGrades.getGradeLabel('70abc', scale).label, 'C');
assert.equal(StudyTrackGrades.getGradeLabel('abc', scale), null);
assert.equal(StudyTrackProgress.applyGradeToSubjectProgress({}, '70,0').status, 'approved');   // límite de aprobación con coma
assert.equal(StudyTrackProgress.applyGradeToSubjectProgress({}, '69,9').status, 'pending');
assert.equal(StudyTrackProgress.applyGradeToSubjectProgress({}, '69,9').grade, 69.9);

// ===== Eventos de la universidad: cómo se muestran (openspec/changes/eventos-universidad, PR 2) =====
{
  const V = StudyTrackUniEventsView;
  const TZ = 'America/Santo_Domingo';
  const due = { uid: 'a', title: 'Proyecto final', dueAt: '2026-10-16T03:59:00.000Z', allDay: false, courseCode: 'ISW410', subjectId: 'ISW-410' };
  const at = (now) => plainData(V.describeDue(due, now, TZ));

  // Regla de negocio: "Hoy", "Mañana" y "En N días" se cuentan por días del calendario en la hora del teléfono, no por bloques de 24 horas.
  sameData(at('2026-10-15T14:00:00.000Z'), { relative: 'Hoy', absolute: 'jue 15 oct · 11:59 PM', tone: 'soon' });
  sameData(at('2026-10-15T03:00:00.000Z'), { relative: 'Mañana', absolute: 'jue 15 oct · 11:59 PM', tone: 'soon' }, '11:00 PM del día anterior');
  sameData(at('2026-10-13T03:59:00.000Z'), { relative: 'En 3 días', absolute: 'jue 15 oct · 11:59 PM', tone: 'later' });
  // Regla de negocio: una entrega vence justo después de su hora; en la hora exacta todavía no está vencida.
  assert.equal(at('2026-10-16T03:59:00.000Z').relative, 'Hoy', 'exactly at the due time');
  sameData(at('2026-10-16T03:59:00.001Z'), { relative: 'Venció hoy', absolute: 'jue 15 oct · 11:59 PM', tone: 'overdue' });
  assert.equal(at('2026-10-16T04:00:00.000Z').relative, 'Venció ayer', 'midnight, the next day');
  assert.equal(at('2026-10-19T16:00:00.000Z').relative, 'Venció hace 4 días');

  // Regla de negocio: un evento de día completo no muestra hora y no vence hasta que termina ese día.
  const holiday = { uid: 'h', title: 'Feriado', dueAt: '2026-11-06', allDay: true, courseCode: null, subjectId: null };
  sameData(V.describeDue(holiday, '2026-11-05T14:00:00.000Z', TZ), { relative: 'Mañana', absolute: 'vie 6 nov', tone: 'soon' });
  sameData(V.describeDue(holiday, '2026-11-07T03:59:00.000Z', TZ), { relative: 'Hoy', absolute: 'vie 6 nov', tone: 'soon' }, '11:59 PM that day');
  assert.equal(V.describeDue(holiday, '2026-11-07T04:00:00.000Z', TZ).relative, 'Venció ayer');

  // Regla de negocio: el calendario mensual empieza en lunes, como el horario semanal; los huecos antes del día 1 y después del último quedan vacíos.
  const oct = plainData(V.buildMonthGrid(2026, 10, '2026-10-19'));
  assert.equal(oct.length, 5);
  sameData(oct[0].map((c) => c.day), [null, null, null, 1, 2, 3, 4]);
  sameData(oct[4].map((c) => c.day), [26, 27, 28, 29, 30, 31, null]);
  sameData(oct[0][3], { key: '2026-10-01', day: 1, isToday: false });
  sameData(oct[3][0], { key: '2026-10-19', day: 19, isToday: true });
  sameData(oct[0][0], { key: null, day: null, isToday: false });
  const feb = plainData(V.buildMonthGrid(2027, 2, '2026-10-19'));
  assert.equal(feb.length, 4, 'a 28-day month starting on Monday fills exactly 4 weeks');
  sameData([feb[0][0].day, feb[3][6].day], [1, 28]);

  sameData(V.shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  sameData(V.shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
  sameData(V.shiftMonth(2026, 10, 0), { year: 2026, month: 10 });

  // Regla de negocio: si el enlace pide un rango "custom" sin fechas, la app lo cambia a "recentupcoming" para traer las entregas próximas.
  const base = 'https://eva.uapa.edu.do/calendar/export_execute.php?userid=1&authtoken=abc&preset_what=all';
  assert.equal(V.normalizeCalendarUrl(`${base}&preset_time=custom`), `${base}&preset_time=recentupcoming`);
  assert.equal(V.normalizeCalendarUrl(`  ${base}&preset_time=weeknow  `), `${base}&preset_time=weeknow`, 'other ranges are kept; spaces trimmed');
  assert.equal(V.normalizeCalendarUrl(base), base, 'no preset_time: untouched');
  assert.equal(V.normalizeCalendarUrl(''), '');
  assert.equal(V.normalizeCalendarUrl(null), '');

  // Regla de negocio: cada error de descarga tiene un mensaje claro en español; un 401/403 significa que hay que generar un enlace nuevo.
  assert.match(V.errorMessage('invalid-url'), /export_execute\.php/);
  assert.match(V.errorMessage('http-403'), /enlace nuevo/);
  assert.match(V.errorMessage('http-401'), /enlace nuevo/);
  assert.match(V.errorMessage('not-calendar'), /enlace nuevo/);
  assert.match(V.errorMessage('network'), /conexión/);
  assert.match(V.errorMessage('http-500'), /\(500\)/);
  assert.match(V.errorMessage('algo-raro'), /No se pudo actualizar/);

  // Regla de negocio: el estado muestra cuándo fue la última actualización y cuántas entregas trajo.
  assert.equal(V.statusLine(null, '2026-10-19T16:45:00.000Z', TZ), 'Aún no se ha actualizado');
  assert.equal(V.statusLine({ fetchedAt: '2026-10-19T16:40:00.000Z', count: 8 }, '2026-10-19T16:45:00.000Z', TZ), 'Actualizado hoy · 12:40 PM · 8 entregas');
  assert.equal(V.statusLine({ fetchedAt: '2026-10-12T16:40:00.000Z', count: 1 }, '2026-10-19T16:45:00.000Z', TZ), 'Actualizado lun 12 oct · 12:40 PM · 1 entrega');
  assert.equal(V.statusLine({ fetchedAt: '2026-10-19T04:05:00.000Z', count: 0 }, '2026-10-19T16:45:00.000Z', TZ), 'Actualizado hoy · 12:05 AM · 0 entregas');
}

// ===== Eventos de la universidad: plantillas de la pantalla =====
{
  const UI = StudyTrackUniEventsUI;
  const esc = StudyTrackSanitize.escapeHtml;
  const item = (n, tone, extra = {}) => ({
    event: { uid: `u${n}`, title: `Tarea ${n}`, courseCode: 'ISW201', ...extra },
    due: { relative: tone === 'overdue' ? 'Venció ayer' : 'Mañana', absolute: 'jue 15 oct · 11:59 PM', tone },
    subjectName: 'Ingeniería de Software I',
    dayKey: '2026-10-15',
  });

  const list = UI.renderUpcomingList([1, 2, 3, 4, 5, 6].map((n) => item(n, 'soon')), { escapeHtml: esc });
  assert.equal((list.match(/stk-due-row/g) || []).length - (list.match(/stk-due-row--action/g) || []).length, 5, 'the home list shows at most 5');
  assert.ok(list.includes('data-action="openUniCalendarDay"') && list.includes('2026-10-15'), 'a row opens the calendar on its day');
  assert.ok(!list.includes('Tarea 6'));
  const risky = UI.renderUpcomingList([item(1, 'overdue', { title: '<img src=x onerror=alert(1)>' })], { escapeHtml: esc });
  assert.ok(!risky.includes('<img') && risky.includes('&lt;img'), 'titles from the university are escaped');
  assert.ok(risky.includes('stk-due-chip--overdue') && risky.includes('Venció ayer'));
  const noSubject = UI.renderUpcomingList([{ ...item(1, 'later'), subjectName: null }], { escapeHtml: esc });
  assert.ok(noSubject.includes('ISW201 ·'), 'without a matching subject the course code is shown');
  assert.match(UI.renderUpcomingList([], { escapeHtml: esc }), /Sin entregas/);

  const grid = StudyTrackUniEventsView.buildMonthGrid(2026, 10, '2026-10-19');
  const cal = UI.renderMonthCalendar(grid, { '2026-10-15': ['soon', 'soon', 'later', 'overdue'] }, '2026-10-15', { escapeHtml: esc });
  assert.equal((cal.match(/stk-cal-dot--/g) || []).length, 3, 'at most 3 dots per day');
  assert.equal((cal.match(/stk-cal-cell--blank/g) || []).length, 4, '3 blanks before Oct 1 and 1 after Oct 31');
  assert.equal((cal.match(/aria-pressed="true"/g) || []).length, 1);
  assert.ok(cal.includes('aria-label="15, 4 entregas"'));
  assert.equal((cal.match(/stk-cal-cell--today/g) || []).length, 1);
  assert.equal(UI.monthLabel(2026, 10), 'octubre 2026');
  assert.match(UI.renderDayList([], 'jueves 15 de octubre', { escapeHtml: esc }), /Sin entregas este día/);

  // Regla de negocio: la tarjeta de una materia en curso muestra su próxima entrega (si la hay).
  const cardBase = { id: 'ISW-201', name: 'Ingeniería de Software I', code: 'ISW-201', credits: 4, state: 'enrolled', grade: null, scheduleSummary: null, completionLabel: null, prerequisiteLabel: '', missingGrade: false, skippedPrerequisite: false, disabled: false, attempts: 0, section: '', classroom: '', teacher: '', completionRaw: '' };
  const withNext = StudyTrackCards.renderSubjectCard({ ...cardBase, nextDelivery: { title: 'Tarea <1>', relative: 'Mañana', tone: 'soon' } }, { escapeHtml: esc });
  assert.ok(withNext.includes('Tarea &lt;1&gt;') && withNext.includes('stk-due-chip--soon') && withNext.includes('Mañana'));
  assert.ok(!StudyTrackCards.renderSubjectCard({ ...cardBase, nextDelivery: null }, { escapeHtml: esc }).includes('stk-subject-due'));
  assert.ok(!StudyTrackCards.renderSubjectCard(cardBase, { escapeHtml: esc }).includes('stk-subject-due'), 'no field, no line');
}

// ===== Eventos de la universidad: entregas pasadas =====
{
  const U = StudyTrackUniEvents;
  const link = 'https://eva.uapa.edu.do/calendar/export_execute.php?userid=1&authtoken=abc&preset_what=all';

  // Regla de negocio: "Actualizar" descarga dos rangos del mismo enlace: las próximas (recentupcoming) y las pasadas (custom).
  sameData(U.calendarRangeUrls(`${link}&preset_time=custom`), { upcoming: `${link}&preset_time=recentupcoming`, past: `${link}&preset_time=custom` });
  sameData(U.calendarRangeUrls(`${link}&preset_time=weeknow`), { upcoming: `${link}&preset_time=recentupcoming`, past: `${link}&preset_time=custom` });
  sameData(U.calendarRangeUrls(link), { upcoming: `${link}&preset_time=recentupcoming`, past: `${link}&preset_time=custom` }, 'no preset_time: it is added');
  sameData(U.calendarRangeUrls(`${link}&preset_time=custom#x`), { upcoming: `${link}&preset_time=recentupcoming#x`, past: `${link}&preset_time=custom#x` });

  const ev = (uid, start, summary = `Vencimiento de ${uid}`) => ({ uid, summary, start, allDay: false, categories: [] });
  const now = '2026-10-19T16:00:00.000Z';

  // Regla de negocio: al actualizar se conserva el historial: una entrega que ya pasó y ya no viene en la descarga se queda.
  // Regla de negocio: una entrega futura que ya no viene en la descarga se quita (Moodle la borró o la movió).
  // Regla de negocio: si una entrega viene en la descarga, gana la versión nueva (título o fecha cambiados).
  const stored = [ev('old', '2026-09-01T03:59:00.000Z'), ev('gone-future', '2026-11-01T03:59:00.000Z'), ev('edited', '2026-10-25T03:59:00.000Z', 'Vencimiento de Viejo')];
  const fresh = [ev('edited', '2026-10-26T03:59:00.000Z', 'Vencimiento de Nuevo'), ev('new', '2026-10-21T03:59:00.000Z'), ev('new', '2026-10-21T03:59:00.000Z', 'duplicado')];
  const merged = plainData(U.mergeStoredEvents(stored, fresh, now));
  sameData(merged.map((e) => e.uid), ['old', 'new', 'edited'], 'sorted by date, no duplicates');
  assert.equal(merged[1].summary, 'Vencimiento de new', 'the first copy in the download wins over a later duplicate');
  sameData([merged[2].summary, merged[2].start], ['Vencimiento de Nuevo', '2026-10-26T03:59:00.000Z']);
  // Justo en el límite: una entrega guardada con fecha exactamente ahora todavía no es pasada, así que se quita si ya no viene.
  sameData(plainData(U.mergeStoredEvents([ev('edge', now)], [], now)).map((e) => e.uid), []);
  sameData(plainData(U.mergeStoredEvents([ev('edge', '2026-10-19T15:59:59.999Z')], [], now)).map((e) => e.uid), ['edge']);
  sameData(plainData(U.mergeStoredEvents(null, [ev('a', now)], now)).map((e) => e.uid), ['a'], 'nothing stored yet');
  sameData(plainData(U.mergeStoredEvents([ev('a', '2026-01-01T00:00:00.000Z')], null, now)).map((e) => e.uid), ['a']);
}

{
  const V = StudyTrackVersion;
  const log = [
    { version: '1.2.0', date: '2026-11-01', title: 'C', items: ['c'] },
    { version: '1.1.0', date: '2026-10-20', title: 'B', items: ['b'] },
    { version: '1.0.0', date: '2026-10-01', title: 'A', items: ['a'] }
  ];
  const vs = (list) => plainData(list).map((r) => r.version);

  // Regla de negocio: las versiones se comparan número por número, no como texto (1.10.0 es mayor que 1.9.0).
  assert.equal(V.compareVersions('1.10.0', '1.9.0'), 1);
  assert.equal(V.compareVersions('1.9.0', '1.10.0'), -1);
  assert.equal(V.compareVersions('1.0.0', '1.0.0'), 0, 'justo en el límite: iguales');
  assert.equal(V.compareVersions('1.0', '1.0.0'), 0, 'partes faltantes cuentan como 0');
  assert.equal(V.compareVersions(null, '0.0.0'), 0, 'versión vacía equivale a 0.0.0');
  assert.equal(V.compareVersions('basura', '0.0.1'), -1, 'versión inválida equivale a 0.0.0');

  // Regla de negocio: tras actualizar se muestran solo las novedades más nuevas que la última versión vista, hasta la versión actual, de la más nueva a la más vieja.
  sameData(vs(V.getUnseenReleases(log, '1.0.0', '1.2.0')), ['1.2.0', '1.1.0']);
  sameData(vs(V.getUnseenReleases(log, '1.1.0', '1.2.0')), ['1.2.0'], 'la versión ya vista no se repite (límite)');
  sameData(vs(V.getUnseenReleases(log, '1.2.0', '1.2.0')), [], 'sin cambios no hay modal');
  sameData(vs(V.getUnseenReleases(log, '1.0.0', '1.1.0')), ['1.1.0'], 'una versión futura del historial no se muestra (límite: actual incluida)');
  sameData(vs(V.getUnseenReleases(log, '0.0.0', '1.2.0', 2)), ['1.2.0', '1.1.0'], 'tope de entradas');

  // Regla de negocio: una instalación nueva (sin versión vista) no muestra novedades; solo se marca la versión actual como vista.
  sameData(vs(V.getUnseenReleases(log, null, '1.2.0')), []);
  sameData(vs(V.getUnseenReleases(log, '', '1.2.0')), []);
  sameData(vs(V.getUnseenReleases(null, '1.0.0', '1.2.0')), [], 'historial vacío o nulo');

  // Regla de negocio: el historial de la app es coherente: la versión más nueva es la versión actual y las entradas tienen lista de cambios.
  assert.equal(V.CHANGELOG[0].version, V.APP_VERSION);
  assert.ok(V.CHANGELOG.every((r) => /^\d+\.\d+\.\d+$/.test(r.version) && r.items.length > 0));
  assert.ok(V.CHANGELOG.every((r, i) => i === 0 || V.compareVersions(V.CHANGELOG[i - 1].version, r.version) === 1), 'orden descendente sin repetidos');
}

console.log('Logic checks passed');
