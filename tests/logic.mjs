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
  setItem: (key, value) => store.set(key, String(value))
};

for (const file of ['src/storage.js', 'src/sanitize.js', 'src/curriculum.js', 'src/grades.js', 'src/academics.js', 'src/progress.js', 'src/prerequisites.js', 'src/periods.js', 'src/cards.js', 'src/requirements.js', 'src/schedule.js', 'src/insights.js', 'src/milestones.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const { StudyTrackAcademics, StudyTrackCurriculum, StudyTrackGrades, StudyTrackInsights, StudyTrackPrerequisites, StudyTrackProgress, StudyTrackSanitize, StudyTrackStorage, StudyTrackSchedule, StudyTrackRequirements, StudyTrackPeriods, StudyTrackMilestones, StudyTrackCards } = context;

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

console.log('Logic checks passed');
