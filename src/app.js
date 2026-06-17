        const GITHUB_REPO_BASE = 'https://raw.githubusercontent.com/ERCamilo/LIBRERIA_DE_CARRERAS/main';
        const GITHUB_INDEX_URL = `${GITHUB_REPO_BASE}/index.json`;
        const REMOTE_LIBRARY_SOURCES = [
            { baseUrl: GITHUB_REPO_BASE, indexUrl: GITHUB_INDEX_URL },
            { baseUrl: 'https://cdn.jsdelivr.net/gh/ERCamilo/LIBRERIA_DE_CARRERAS@main', indexUrl: 'https://cdn.jsdelivr.net/gh/ERCamilo/LIBRERIA_DE_CARRERAS@main/index.json' },
            { baseUrl: './library', indexUrl: './library/index.json' }
        ];

        const APP_CONFIG = {
            storageKeys: {
                curriculum: StudyTrackStorage.KEYS.curriculum,
                progress: StudyTrackStorage.KEYS.progress,
                library_cache: StudyTrackStorage.KEYS.libraryCache
            },
            collapsedPeriods: new Set(StudyTrackStorage.getJson(StudyTrackStorage.KEYS.collapsedPeriods, [])),
            // Cloud-synced settings — defaults here, populated by loadSettings() below.
            darkMode: false,
            allowSkipPrerequisites: true,
            maxEnrolledSubjects: 10,
            passingGrade: 70,
            gradeScale: []
        };

        function readGradeScale() {
            const s = StudyTrackStorage.getJson(StudyTrackStorage.KEYS.gradeScale, null);
            if (s && s.length && s[0].points !== undefined) return s;
            // Default or migration if missing points
            const defaults = [
                { min: 90, label: 'A', color: 'text-emerald-500', points: 4 },
                { min: 80, label: 'B', color: 'text-blue-500', points: 3 },
                { min: 70, label: 'C', color: 'text-yellow-500', points: 2 },
                { min: 60, label: 'D', color: 'text-orange-500', points: 1 },
                { min: 0, label: 'F', color: 'text-red-500', points: 0 }
            ];
            if (!s) return defaults;
            // Add points to existing
            return s.map(i => {
                let p = 0;
                if (i.min >= 90) p = 4; else if (i.min >= 80) p = 3; else if (i.min >= 70) p = 2; else if (i.min >= 60) p = 1;
                return { ...i, points: p };
            });
        }

        // Re-reads cloud-synced settings into APP_CONFIG. Called at startup and again
        // after a cloud sync so pulled-down settings take effect without a page reload.
        function loadSettings() {
            APP_CONFIG.darkMode = StudyTrackStorage.getBoolean(StudyTrackStorage.KEYS.darkMode, false);
            APP_CONFIG.allowSkipPrerequisites = StudyTrackStorage.getItem(StudyTrackStorage.KEYS.allowSkipPrerequisites) !== 'false';
            APP_CONFIG.maxEnrolledSubjects = StudyTrackStorage.getNumber(StudyTrackStorage.KEYS.maxEnrolledSubjects, 10);
            APP_CONFIG.passingGrade = StudyTrackStorage.getFloat(StudyTrackStorage.KEYS.passingGrade, 70);
            APP_CONFIG.gradeScale = readGradeScale();
        }

        loadSettings();

        let libraryData = [];
        let currentCurriculum = null;
        let userProgress = {};
        let dependencyGraph = null;
        let currentFilter = 'all'; // 'all', 'enrolled', 'completed', 'pending'
        const escapeHtml = StudyTrackSanitize.escapeHtml;
        const escapeJsString = StudyTrackSanitize.escapeJsString;
        const sanitizeCssClasses = StudyTrackSanitize.sanitizeCssClasses;
        const actionArgs = StudyTrackSanitize.actionArgs;
        function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

        // ============================================================
        // INITIALIZATION
        // ============================================================

        async function initApp() {
            loadSettings(); // refresh cloud-synced settings (so a sync pull applies without reload)
            if (APP_CONFIG.darkMode) { document.documentElement.classList.add('dark'); document.getElementById('theme-icon').className = 'fas fa-sun text-sm'; }

            // Check persistence first
            const storedCurriculum = StudyTrackStorage.getJson(APP_CONFIG.storageKeys.curriculum, null);

            if (storedCurriculum) {
                try {
                    currentCurriculum = storedCurriculum;
                    loadUserProgress();
                    dependencyGraph = buildDependencyGraph(currentCurriculum);
                    renderUI();
                    calculateStatistics();
                    renderRequirementsWidget();
                } catch (e) {
                    console.error("Error loading saved data", e);
                    showWelcomeScreen(); // Fallback
                }
            } else {
                showWelcomeScreen();
            }

            loadLibraryCache();
            setupSelectors('welcome'); // Prepare welcome selectors
            setupSelectors('settings'); // Prepare settings selectors
            setTimeout(updateLibraryFromCloud, 1000);
            setupEventListeners();
        }

        // ============================================================
        // LOGIC FOR WELCOME SCREEN & SELECTORS
        // ============================================================

        function showWelcomeScreen() {
            document.getElementById('welcome-modal').classList.remove('hidden');
            // Hide header if no data loaded to focus on onboarding
            document.getElementById('app-header').classList.add('opacity-0', 'pointer-events-none');
        }

        function hideWelcomeScreen() {
            document.getElementById('welcome-modal').classList.add('hidden');
            document.getElementById('app-header').classList.remove('opacity-0', 'pointer-events-none');
        }

        function setupSelectors(prefix) {
            const uniSelect = document.getElementById(`${prefix}-uni-select`);
            const careerSelect = document.getElementById(`${prefix}-career-select`);
            const btn = document.getElementById(`${prefix}-start-btn`) || document.getElementById(`${prefix}-load-btn`);

            if (!uniSelect || !careerSelect) return;

            // 1. Populate Universities
            const unis = [...new Set(libraryData.map(item => item.institution))].sort();
            uniSelect.innerHTML = '<option value="" disabled selected>Selecciona institución...</option>' +
                unis.map(uni => `<option value="${escapeHtml(uni)}">${escapeHtml(uni)}</option>`).join('');

            // 2. Handle Uni Change
            uniSelect.onchange = (e) => {
                const selectedUni = e.target.value;
                const careers = libraryData.filter(item => item.institution === selectedUni);

                careerSelect.innerHTML = '<option value="" disabled selected>Selecciona carrera...</option>' +
                    careers.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.career_name)} (${escapeHtml(c.degree_type || 'Grado')})</option>`).join('');

                careerSelect.disabled = false;
                if (prefix === 'welcome') {
                    document.getElementById('welcome-career-container').classList.remove('opacity-50', 'pointer-events-none');
                }

                // Reset button
                if (btn) { btn.classList.add('opacity-50', 'pointer-events-none'); }
            };

            // 3. Handle Career Change
            careerSelect.onchange = () => {
                if (btn) { btn.classList.remove('opacity-50', 'pointer-events-none'); }
            };
        }

        // Triggered by Welcome Button
        function startAppFromWelcome() {
            const careerId = document.getElementById('welcome-career-select').value;
            loadSelectedCareer(careerId, 'welcome');
        }

        // Triggered by Settings Button
        function startAppFromSettings() {
            const careerId = document.getElementById('settings-career-select').value;
            loadSelectedCareer(careerId, 'settings');
        }

        async function loadSelectedCareer(careerId, origin) {
            const selectedItem = libraryData.find(i => i.id === careerId);
            if (!selectedItem) return;

            // Warning if switching careers via settings
            if (origin === 'settings' && !confirm(`¿Cargar ${selectedItem.career_name}? \n⚠️ Se reiniciará tu progreso actual.`)) {
                return;
            }

            await loadCareer(selectedItem.id, selectedItem.source, selectedItem.fullUrl);

            if (origin === 'welcome') hideWelcomeScreen();
            if (origin === 'settings') closeSettings();
        }

        // ============================================================
        // LIBRARY & DATA LOGIC
        // ============================================================

        function loadLibraryCache() {
            const cached = StudyTrackStorage.getJson(APP_CONFIG.storageKeys.library_cache, null);
            if (cached) {
                try {
                    libraryData = cached.filter(item => item.source === 'remote' && item.fullUrl);
                } catch (e) { }
            }
        }

        async function fetchRemoteLibraryIndex() {
            let lastError = null;
            for (const source of REMOTE_LIBRARY_SOURCES) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 1800);
                    const response = await fetch(source.indexUrl, { signal: controller.signal });
                    clearTimeout(timeoutId);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    return { baseUrl: source.baseUrl, items: await response.json() };
                } catch (error) {
                    lastError = error;
                    console.warn(`No se pudo leer biblioteca remota desde ${source.indexUrl}:`, error);
                }
            }
            throw lastError || new Error('No se pudo conectar con la biblioteca remota');
        }

        async function updateLibraryFromCloud() {
            const loader = document.getElementById('library-loading');
            if (loader) loader.classList.remove('hidden');

            try {
                const remoteLibrary = await fetchRemoteLibraryIndex();

                const processedRemote = remoteLibrary.items.map(item => ({
                    ...item,
                    source: 'remote',
                    fullUrl: item.path.startsWith('http') ? item.path : `${remoteLibrary.baseUrl}/${item.path}`
                }));

                StudyTrackStorage.setJson(APP_CONFIG.storageKeys.library_cache, processedRemote);
                libraryData = processedRemote;

                // Refresh selectors dynamically
                setupSelectors('welcome');
                setupSelectors('settings');

            } catch (error) {
                console.warn("No se pudo sincronizar la biblioteca:", error);
            } finally {
                if (loader) loader.classList.add('hidden');
            }
        }

        async function loadCareer(id, source, url) {
            let data = null;
            try {
                if (source === 'remote' && url) {
                    showToast('Descargando carrera...', 'info');
                    const res = await fetch(url);
                    if (!res.ok) throw new Error('Error descarga');
                    data = await res.json();
                }

                if (data) {
                    const validation = StudyTrackCurriculum.validateCurriculum(data);
                    if (!validation.valid) throw new Error(validation.errors[0] || 'Pensum invalido');
                    currentCurriculum = data;
                    userProgress = {};
                    saveCurriculum();
                    saveUserProgress();
                    dependencyGraph = buildDependencyGraph(currentCurriculum);
                    renderUI();
                    calculateStatistics();
                    renderRequirementsWidget();
                    showToast('Carrera cargada exitosamente', 'success');
                } else {
                    throw new Error('Datos vacíos');
                }
            } catch (e) {
                showToast('Error: ' + e.message, 'error');
            }
        }

        // ============================================================
        // CORE HELPER FUNCTIONS (Preserved)
        // ============================================================
        function loadUserProgress() { userProgress = StudyTrackProgress.normalizeUserProgress(StudyTrackStorage.getJson(APP_CONFIG.storageKeys.progress, {}), currentCurriculum); }
        // Single explicit hook for the cloud sync: every persistence path calls this
        // directly instead of the sync module monkey-patching function names.
        function notifySyncChange() { window.StudyTrackFirebaseSync?.notifyChange?.(); }
        function saveCurriculum() { StudyTrackStorage.setJson(APP_CONFIG.storageKeys.curriculum, currentCurriculum); notifySyncChange(); }
        function saveUserProgress() { StudyTrackStorage.setJson(APP_CONFIG.storageKeys.progress, userProgress); notifySyncChange(); }
        let appEventListenersReady = false;
        function setupEventListeners() { if (appEventListenersReady) return; appEventListenersReady = true; document.getElementById('search-input').addEventListener('input', (e) => handleSearch(e.target.value)); }
        function handleSearch(text) { renderPeriods(text); }
        function checkPrerequisites(prereqs) { return StudyTrackPrerequisites.checkPrerequisites(prereqs, userProgress, currentCurriculum); }
        function areAllOtherSubjectsCompleted() { return StudyTrackPrerequisites.areAllOtherSubjectsCompleted(currentCurriculum, userProgress); }
        function formatPrerequisiteString(p) { return StudyTrackPrerequisites.formatPrerequisiteString(p); }
        function buildDependencyGraph(c) { return StudyTrackPrerequisites.buildDependencyGraph(c); }
        function calculatePeriodStats(p) { return StudyTrackAcademics.calculatePeriodStats(p, userProgress); }
        function renderPeriodStatsHTML(s, t) { return StudyTrackPeriods.renderPeriodStatsHTML(s, t); }
        function renderUI() { document.getElementById('header-career').textContent = currentCurriculum.metadata.career_name; document.getElementById('header-institution').textContent = currentCurriculum.metadata.institution; renderPeriods(); }
        function renderSubjectCardString(s, pn) {
            const st = userProgress[s.id] || { status: 'pending', grade: null, attempts: [], completionDate: null, section: '', classroom: '', teacher: '' };
            const un = checkPrerequisites(s.prerequisites);
            const fo = dependencyGraph?.unlocks.get(s.id) || 0;
            const reqTxt = formatPrerequisiteString(s.prerequisites);
            const gradeLabel = getGradeLabel(st.grade);
            const subjectIdJs = escapeJsString(s.id);
            const subjectIdHtml = escapeHtml(s.id);
            const safeSubjectName = escapeHtml(s.name);
            const safeSubjectCode = escapeHtml(s.code);
            const safeCredits = escapeHtml(s.credits);
            const safeReqTxt = escapeHtml(reqTxt);
            const safeGrade = escapeHtml(st.grade ?? '');
            const isApprovedWithoutGrade = st.status === 'approved' && (st.grade === null || st.grade === undefined || st.grade === '');
            const safeSection = escapeHtml(st.section || '');
            const safeClassroom = escapeHtml(st.classroom || '');
            const safeTeacher = escapeHtml(st.teacher || '');
            const safeCompletionDate = escapeHtml(st.completionDate || '');

            const isSkippedPrereq = st.status === 'approved' && !un && s.prerequisites?.length;
            const isDisabled = !un && st.status !== 'approved' && !APP_CONFIG.allowSkipPrerequisites;
            // Dim subjects blocked by prerequisites (unless skipping is allowed)
            const op = (isDisabled && st.status !== 'enrolled') ? 'opacity-60 grayscale-[0.5]' : '';

            // --- Apple-style status mapping (Capa 1) ---
            const statusKey = st.status === 'approved'
                ? ((isApprovedWithoutGrade || isSkippedPrereq) ? 'warning' : 'approved')
                : st.status === 'enrolled' ? 'enrolled'
                    : un ? 'available' : 'locked';
            const orbIcon = {
                approved: 'fa-circle-check', warning: 'fa-triangle-exclamation',
                enrolled: 'fa-book-open', available: 'fa-route', locked: 'fa-lock'
            }[statusKey];
            const shortStatus = {
                approved: 'Aprobada',
                warning: isApprovedWithoutGrade ? 'Aprobada · sin nota' : 'Requisito saltado',
                enrolled: 'Inscrita', available: 'Disponible', locked: 'Bloqueada'
            }[statusKey];
            const prereqChip = (s.prerequisites?.length && (!un || isSkippedPrereq))
                ? `<button class="stk-chip stk-chip--lock" title="${safeReqTxt}" data-action="showPrerequisitePopover" data-args="${actionArgs('$event', s.id)}"><i class="fas fa-${isSkippedPrereq ? 'triangle-exclamation' : 'lock'}" style="font-size:9px"></i>${safeReqTxt}</button>`
                : '';
            const unlockChip = fo > 0
                ? `<span class="stk-chip" title="Desbloquea ${fo} materia(s)"><i class="fas fa-key" style="font-size:9px"></i>${fo}</span>`
                : '';
            const enrollBtn = st.status !== 'approved'
                ? `<button class="stk-enroll ${st.status === 'enrolled' ? 'stk-enroll--on' : 'stk-enroll--off'}" ${isDisabled ? 'disabled style="opacity:.5;cursor:not-allowed"' : ''} data-action="toggleEnrollment" data-args="${actionArgs(s.id)}"><i class="fas fa-${st.status === 'enrolled' ? 'check' : 'plus'}" style="font-size:11px"></i>${st.status === 'enrolled' ? 'En curso' : 'Inscribir'}</button>`
                : '';
            const warnText = isApprovedWithoutGrade
                ? `<div class="stk-warn-text"><i class="fas fa-triangle-exclamation" style="font-size:10px"></i>Falta registrar la nota</div>`
                : '';

            return `
                <div id="subject-card-${subjectIdHtml}" class="subject-card-mobile stk-card stk-card--${statusKey} ${op} group">
                    <div class="stk-head" data-action="toggleSubjectDetails" data-args="${actionArgs(s.id)}">
                        <button class="stk-orb" aria-label="Cambiar estado de ${safeSubjectName}" data-action="toggleSubjectStatus" data-args="${actionArgs(s.id)}">
                            <i class="fas ${orbIcon}"></i>
                        </button>
                        <div class="stk-main">
                            <div class="stk-title">${safeSubjectName}</div>
                            <div class="stk-sub">
                                <span>${safeSubjectCode}</span><span class="stk-sep">·</span><span class="stk-sw">${shortStatus}</span>
                                ${prereqChip}${unlockChip}
                            </div>
                        </div>
                        <div class="stk-credits"><b>${safeCredits}</b><span>CR</span></div>
                        <button class="stk-expand-btn" aria-label="Ver detalles de ${safeSubjectName}" data-action="toggleSubjectDetails" data-args="${actionArgs(s.id)}"><i class="fas fa-chevron-down stk-chev" id="chevron-${subjectIdHtml}"></i></button>
                    </div>
                    <div class="stk-actions">
                        ${enrollBtn}
                        <label class="stk-note ${isApprovedWithoutGrade ? 'stk-note--warn' : ''}" data-action="stop" title="${isApprovedWithoutGrade ? 'Materia completada sin nota registrada' : 'Nota'}">
                            <span class="stk-note-cap">Nota</span>
                            <input type="number" min="0" max="100" step="any" aria-label="Nota de ${safeSubjectName}" placeholder="--" value="${safeGrade}" data-change="updateGrade" data-args="${actionArgs(s.id, '$value')}">
                        </label>
                        <div class="stk-grade ${gradeLabel ? '' : 'stk-grade--empty'}" title="Calificación literal">${gradeLabel ? gradeLabel.label : '–'}</div>
                    </div>
                    ${warnText}
                    <!-- Collapsible Details Section -->
                    <div class="stk-details" id="details-${subjectIdHtml}">
                        <div class="stk-details-inner">
                            <div class="stk-details-grid">
                                <div class="stk-field"><label>Sección</label><input type="text" placeholder="Ej: 01" value="${safeSection}" data-change="updateSubjectExtra" data-args="${actionArgs(s.id, 'section', '$value')}"></div>
                                <div class="stk-field"><label>Aula</label><input type="text" placeholder="Ej: A-101" value="${safeClassroom}" data-change="updateSubjectExtra" data-args="${actionArgs(s.id, 'classroom', '$value')}"></div>
                                <div class="stk-field stk-field--wide"><label>Maestro</label><input type="text" placeholder="Nombre del profesor" value="${safeTeacher}" data-change="updateSubjectExtra" data-args="${actionArgs(s.id, 'teacher', '$value')}"></div>
                                <div class="stk-field"><label>Retiros</label><input type="number" min="0" max="10" placeholder="0" value="${escapeHtml(st.attempts?.length || 0)}" data-change="updateAttempts" data-args="${actionArgs(s.id, '$value')}"></div>
                                <div class="stk-field"><label>Fecha</label><input type="month" value="${safeCompletionDate}" data-change="updateCompletionDate" data-args="${actionArgs(s.id, '$value')}"></div>
                            </div>
                        </div>
                    </div>
                </div>`;
        }
        function refreshAffectedSubjects(subjectId) {
            const periodIndexes = new Set();
            StudyTrackProgress.getAffectedSubjectIds(subjectId, dependencyGraph).forEach(subId => {
                const loc = findSubjectLocation(subId);
                if (!loc) return;

                reRenderSubjectCardDOM(loc.subject, loc.period.period_number);
                periodIndexes.add(loc.periodIndex);
            });
            periodIndexes.forEach(idx => updatePeriodHeaderDOM(idx));
        }

        function toggleSubjectStatus(id) {
            if (!userProgress[id]) userProgress[id] = StudyTrackProgress.createDefaultSubjectProgress();

            const loc = findSubjectLocation(id);
            const isCurrentlyApproved = userProgress[id].status === 'approved';

            if (!isCurrentlyApproved && loc) {
                const prereqsMet = checkPrerequisites(loc.subject.prerequisites);
                if (!prereqsMet && !APP_CONFIG.allowSkipPrerequisites) {
                    showToast(`🔒 Debes completar los prerrequisitos primero o habilitar "Saltar prerrequisitos" en Ajustes.`, 'error');
                    return;
                }
            }

            userProgress[id] = StudyTrackProgress.toggleSubjectApproval(userProgress[id]);
            saveUserProgress();
            refreshAffectedSubjects(id);
            calculateStatistics();
            if (userProgress[id].status === 'approved') popSubjectOrb(id);
        }
        function popSubjectOrb(id) {
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            const orb = document.getElementById(`subject-card-${id}`)?.querySelector('.stk-orb');
            if (!orb) return;
            orb.classList.add('stk-pop');
            orb.addEventListener('animationend', () => orb.classList.remove('stk-pop'), { once: true });
        }
        function updateGrade(id, val) {
            userProgress[id] = StudyTrackProgress.applyGradeToSubjectProgress(userProgress[id], val, APP_CONFIG.passingGrade);
            saveUserProgress();
            // Always refresh dependents: a grade change can flip approval in either
            // direction, so lowering a passing grade must re-lock the subjects it unlocked.
            refreshAffectedSubjects(id);
            calculateStatistics();
        }
        function updateAttempts(id, val) { if (!userProgress[id]) userProgress[id] = { status: 'pending' }; userProgress[id].attempts = Array(parseInt(val) || 0).fill({}); saveUserProgress(); }
        function updateCompletionDate(id, val) { if (!userProgress[id]) userProgress[id] = { status: 'pending' }; userProgress[id].completionDate = val; saveUserProgress(); }
        function toggleSubjectDetails(id) {
            const card = document.getElementById(`subject-card-${id}`);
            if (card) card.classList.toggle('open');
        }
        function updateSubjectExtra(id, field, val) {
            if (!userProgress[id]) userProgress[id] = { status: 'pending', grade: null, attempts: [], completionDate: null, section: '', classroom: '', teacher: '' };
            userProgress[id][field] = val;
            saveUserProgress();
        }
        function calculateStatistics() {
            if (!currentCurriculum) return;
            const summary = StudyTrackAcademics.calculateAcademicSummary(currentCurriculum, userProgress, { getGradePoints, getGradeLabel });
            const { total, completed, earned, remaining, progress, hasGrades, globalAvg, globalGPA } = summary;
            const letterObj = summary.letter;

            document.getElementById('stat-progress').textContent = Math.round(progress) + '%';
            document.getElementById('progress-bar-mini').style.width = progress + '%';
            document.getElementById('stat-gpa').textContent = hasGrades ? globalAvg.toFixed(1) : 'N/A';

            // Update new stats card
            const letterEl = document.getElementById('stat-global-letter');
            const gpaEl = document.getElementById('stat-global-gpa-points');

            if (letterEl) {
                letterEl.textContent = letterObj ? letterObj.label : 'N/A';
                letterEl.className = letterObj ? `text-2xl font-black ${letterObj.color}` : 'text-2xl font-black text-slate-400 dark:text-slate-500';
            }
            if (gpaEl) gpaEl.textContent = hasGrades ? globalGPA.toFixed(2) : 'N/A';

            document.getElementById('stat-completed-count').textContent = completed;
            document.getElementById('stat-total-subjects').textContent = total;
            document.getElementById('stat-remaining-text').textContent = remaining + ' faltantes';
            updateMobileAcademicHub({ progress, earned, globalAvg, globalGPA, letter: letterObj?.label || 'N/A', remaining });
            renderHomeView(summary);
            updateFilterCounts();
        }

        function formatCountLabel(count, singular, plural) {
            return `${count} ${count === 1 ? singular : plural}`;
        }

        function updateMobileAcademicHub(summary) {
            if (!currentCurriculum || !document.getElementById('mobile-academic-hub')) return;

            let available = 0, missingGrades = 0, blocked = 0;
            currentCurriculum.periods.forEach(period => period.subjects.forEach(subject => {
                const st = userProgress[subject.id] || { status: 'pending', grade: null };
                const prereqsMet = checkPrerequisites(subject.prerequisites);
                const isPending = (st.status || 'pending') === 'pending';

                if (isPending && prereqsMet) available++;
                if (isPending && !prereqsMet && subject.prerequisites?.length) blocked++;
                if (st.status === 'approved' && (st.grade === null || st.grade === undefined || st.grade === '')) missingGrades++;
            }));

            const roundedProgress = Math.round(summary.progress);
            const progressDegrees = Math.round(summary.progress * 3.6);
            const ring = document.getElementById('mobile-progress-ring');
            if (ring) ring.style.background = `conic-gradient(var(--stk-accent-approved) ${progressDegrees}deg, var(--stk-surface-2) ${progressDegrees}deg)`;

            document.getElementById('mobile-progress-value').textContent = `${roundedProgress}%`;
            document.getElementById('mobile-progress-message').textContent = roundedProgress >= 70 ? 'Vas muy bien' : roundedProgress >= 35 ? 'Buen avance' : 'Listo para avanzar';
            document.getElementById('mobile-earned-credits').textContent = summary.earned;
            document.getElementById('mobile-index').textContent = summary.globalAvg === null ? 'N/A' : summary.globalAvg.toFixed(1);
            document.getElementById('mobile-letter').textContent = summary.letter;
            document.getElementById('mobile-gpa-points').textContent = summary.globalGPA === null ? 'N/A' : summary.globalGPA.toFixed(2);
            document.getElementById('mobile-remaining-subjects').textContent = summary.remaining;
            document.getElementById('mobile-missing-grades-count').textContent = missingGrades;
            document.getElementById('mobile-missing-grades-text').textContent = formatCountLabel(missingGrades, 'materia aprobada sin nota', 'materias aprobadas sin nota');
            document.getElementById('mobile-available-count').textContent = available;
            document.getElementById('mobile-available-text').textContent = `Puedes inscribir ${formatCountLabel(available, 'materia', 'materias')}`;
            document.getElementById('mobile-blocked-count').textContent = blocked;
            document.getElementById('mobile-blocked-text').textContent = formatCountLabel(blocked, 'bloqueo por requisitos', 'bloqueos por requisitos');
        }

        function getHomeToneClasses(tone) {
            const tones = {
                amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300',
                blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300',
                emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300',
                slate: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
            };
            return tones[tone] || tones.emerald;
        }

        function renderHomeSubjectRow(subject, meta = '') {
            const safeName = escapeHtml(subject.name || 'Materia');
            const safeCode = escapeHtml(subject.code || subject.id || '');
            const safeMeta = escapeHtml(meta || `${subject.credits || 0} créditos`);
            return `<button data-action="switchView" data-args='["subjects"]' class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"><div class="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></div><div class="flex-1 min-w-0"><div class="text-sm font-bold text-slate-900 dark:text-white truncate">${safeName}</div><div class="text-[11px] text-slate-500 dark:text-slate-400 truncate">${safeCode} · ${safeMeta}</div></div><i class="fas fa-chevron-right text-slate-300 dark:text-slate-600 text-xs"></i></button>`;
        }

        function renderHomeRecommendationRow(subject) {
            const recommendation = subject.recommendation || {};
            const safeName = escapeHtml(subject.name || 'Materia');
            const safeCode = escapeHtml(subject.code || subject.id || '');
            const safeReason = escapeHtml(recommendation.reason || `${subject.credits || 0} créditos disponibles`);
            const safeBadge = escapeHtml(recommendation.badge || 'Recomendada');
            const categoryClass = recommendation.category === 'unlock' ? 'bg-emerald-500'
                : recommendation.category === 'close-period' ? 'bg-blue-500'
                    : recommendation.category === 'light-load' ? 'bg-amber-500'
                        : 'bg-slate-500';
            return `<button data-action="handleHomeAction" data-args='["pending"]' class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"><div class="w-2.5 h-2.5 rounded-full ${categoryClass} shrink-0"></div><div class="flex-1 min-w-0"><div class="flex items-center gap-2 min-w-0"><div class="text-sm font-bold text-slate-900 dark:text-white truncate">${safeName}</div><span class="shrink-0 rounded-md bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[9px] font-black uppercase text-slate-500 dark:text-slate-300">${safeBadge}</span></div><div class="text-[11px] text-slate-500 dark:text-slate-400 truncate">${safeCode} · ${safeReason}</div></div><i class="fas fa-chevron-right text-slate-300 dark:text-slate-600 text-xs"></i></button>`;
        }

        function renderHomeEmpty(icon, title, detail) {
            return `<div class="px-4 py-6 text-center text-slate-400 dark:text-slate-500"><i class="${icon} text-2xl mb-2 opacity-60"></i><div class="text-sm font-bold text-slate-500 dark:text-slate-400">${escapeHtml(title)}</div><div class="text-xs mt-1">${escapeHtml(detail)}</div></div>`;
        }

        function renderHomeView(summary = null) {
            if (!currentCurriculum || !document.getElementById('home-view')) return;
            const academic = summary || StudyTrackAcademics.calculateAcademicSummary(currentCurriculum, userProgress, { getGradePoints, getGradeLabel });
            const insights = StudyTrackInsights.buildHomeInsights({
                curriculum: currentCurriculum,
                progress: userProgress,
                dependencyGraph,
                scheduleData,
                canTakeSubject: (subject) => checkPrerequisites(subject.prerequisites)
            });

            const roundedProgress = Math.round(academic.progress);
            const progressDegrees = Math.round(academic.progress * 3.6);
            const ring = document.getElementById('home-progress-ring');
            if (ring) ring.style.background = `conic-gradient(var(--stk-accent-approved) ${progressDegrees}deg, var(--stk-surface-2) ${progressDegrees}deg)`;

            document.getElementById('home-progress-value').textContent = `${roundedProgress}%`;
            document.getElementById('home-greeting').textContent = roundedProgress >= 70 ? 'Vas muy bien' : roundedProgress >= 35 ? 'Buen avance' : 'Listo para avanzar';
            document.getElementById('home-context').textContent = academic.remaining > 0 ? `Te quedan ${formatCountLabel(academic.remaining, 'materia', 'materias')} para completar la ruta.` : 'Tu plan académico está completo.';
            document.getElementById('home-earned-credits').textContent = academic.earned;
            document.getElementById('home-index').textContent = academic.hasGrades ? academic.globalAvg.toFixed(1) : 'N/A';
            document.getElementById('home-remaining').textContent = academic.remaining;
            document.getElementById('home-enrolled-count').textContent = insights.enrolled.length;
            document.getElementById('home-schedule-count').textContent = `${insights.scheduleSummary.scheduled}/${insights.scheduleSummary.enrolled}`;
            document.getElementById('home-available-count').textContent = insights.available.length;

            const action = insights.nextAction;
            const actionButton = document.getElementById('home-next-action');
            actionButton.onclick = () => handleHomeAction(action.target);
            const actionIcon = document.getElementById('home-action-icon');
            actionIcon.className = `w-11 h-11 rounded-xl ${getHomeToneClasses(action.tone)} flex items-center justify-center shrink-0`;
            actionIcon.replaceChildren();
            const actionIconGlyph = document.createElement('i');
            actionIconGlyph.className = action.icon;
            actionIcon.appendChild(actionIconGlyph);
            document.getElementById('home-action-title').textContent = action.title;
            document.getElementById('home-action-detail').textContent = action.detail;

            const recommended = insights.recommended.slice(0, 4);
            document.getElementById('home-recommended-list').innerHTML = recommended.length
                ? recommended.map((subject) => renderHomeRecommendationRow(subject)).join('')
                : renderHomeEmpty('fas fa-check-circle', 'Sin recomendaciones pendientes', 'Cuando haya materias disponibles aparecerán aquí.');

            const enrolled = insights.enrolled.slice(0, 4);
            const missing = insights.missingGrades.slice(0, 2);
            const enrolledHtml = enrolled.map((subject) => {
                const blocks = scheduleData?.[subject.id] || [];
                const meta = blocks.length ? `${blocks.length} bloque${blocks.length === 1 ? '' : 's'} de horario` : 'Falta agregar horario';
                return renderHomeSubjectRow(subject, meta);
            }).join('');
            const missingHtml = missing.map((subject) => renderHomeSubjectRow(subject, 'Falta registrar nota')).join('');
            document.getElementById('home-enrolled-list').innerHTML = enrolledHtml || missingHtml
                ? enrolledHtml + missingHtml
                : renderHomeEmpty('fas fa-calendar-plus', 'Nada en curso todavía', 'Inscribe materias para construir tu semana.');
        }

        function handleHomeAction(target) {
            if (target === 'schedule') {
                switchView('schedule');
                return;
            }
            switchView('subjects');
            if (['all', 'enrolled', 'completed', 'pending'].includes(target)) setFilter(target);
        }
        function findSubjectLocation(id) { if (!currentCurriculum) return null; for (let i = 0; i < currentCurriculum.periods.length; i++) { const s = currentCurriculum.periods[i].subjects.find(s => s.id === id); if (s) return { subject: s, period: currentCurriculum.periods[i], periodIndex: i }; } return null; }
        function reRenderSubjectCardDOM(s, pn) { const el = document.getElementById(`subject-card-${s.id}`); if (el) el.outerHTML = renderSubjectCardString(s, pn); }

        function createPeriodBadge(icon, text, marginClass) {
            const badge = document.createElement('span');
            badge.className = `badge-stat hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 ${marginClass}`;
            const badgeIcon = document.createElement('i');
            badgeIcon.className = `fas fa-${icon} mr-1 text-slate-400`;
            badge.appendChild(badgeIcon);
            badge.appendChild(document.createTextNode(text));
            return badge;
        }

        function updatePeriodHeaderDOM(i) {
            const el = document.getElementById(`period-header-stats-${i}`);
            if (el) {
                const p = currentCurriculum.periods[i];
                const avg = calculatePeriodAverage(p);
                const gpa4 = calculatePeriodGPA4(p);
                let statsHtml = renderPeriodStatsHTML(calculatePeriodStats(p), p.subjects.length);
                if (avg) statsHtml += `<span class="sm:hidden text-[10px] font-bold text-slate-500 ml-2">Prom: ${avg}</span>`;
                if (gpa4) statsHtml += `<span class="sm:hidden text-[10px] font-bold text-slate-500 ml-1">• GPA: ${gpa4}</span>`;
                el.innerHTML = statsHtml;
            }
            // Update desktop Average badge if exists
            const titleContainer = document.querySelector(`#period-header-stats-${i}`).parentElement.querySelector('h3').parentElement;
            if (titleContainer) {
                // Remove existing badges
                titleContainer.querySelectorAll('.badge-stat').forEach(b => b.remove());

                const p = currentCurriculum.periods[i];
                const avg = calculatePeriodAverage(p);
                const gpa4 = calculatePeriodGPA4(p);

                if (avg) titleContainer.appendChild(createPeriodBadge('chart-line', avg, 'ml-2'));
                if (gpa4) titleContainer.appendChild(createPeriodBadge('star', gpa4, 'ml-1'));
            }
            // Update Badge Color
            const badge = document.querySelector(`div[data-action="togglePeriod" data-args="${actionArgs(i)}"] .shadow-lg`);
            if (badge) {
                badge.className = `shrink-0 w-8 h-8 sm:w-10 sm:h-10 ${getPeriodStatusColor(currentCurriculum.periods[i])} text-white rounded-lg sm:rounded-xl flex items-center justify-center font-black text-xs sm:text-sm shadow-lg transition-colors duration-500`;
            }
        }
        function togglePeriod(i) { if (APP_CONFIG.collapsedPeriods.has(i)) APP_CONFIG.collapsedPeriods.delete(i); else APP_CONFIG.collapsedPeriods.add(i); StudyTrackStorage.setJson(StudyTrackStorage.KEYS.collapsedPeriods, [...APP_CONFIG.collapsedPeriods]); renderPeriods(document.getElementById('search-input').value); updateToggleAllButton(); }

        function toggleAllPeriods() {
            const allIndices = currentCurriculum.periods.map((_, i) => i);
            // If all are collapsed (size == length), Expand All. Otherwise, Collapse All.
            if (APP_CONFIG.collapsedPeriods.size === allIndices.length) {
                APP_CONFIG.collapsedPeriods.clear(); // Expand All
            } else {
                allIndices.forEach(i => APP_CONFIG.collapsedPeriods.add(i)); // Collapse All
            }
            StudyTrackStorage.setJson(StudyTrackStorage.KEYS.collapsedPeriods, [...APP_CONFIG.collapsedPeriods]);
            renderPeriods(document.getElementById('search-input').value);
            updateToggleAllButton();
        }

        function updateToggleAllButton() {
            if (!currentCurriculum) return;
            const btnText = document.getElementById('toggle-all-text');
            const btnIcon = document.querySelector('button[data-action="toggleAllPeriods"] i');
            const allCollapsed = APP_CONFIG.collapsedPeriods.size === currentCurriculum.periods.length;

            if (allCollapsed) {
                btnText.textContent = "Expandir Todo";
                btnIcon.className = "fas fa-expand-alt";
            } else {
                btnText.textContent = "Contraer Todo";
                btnIcon.className = "fas fa-compress-alt";
            }
        }
        function renderPeriods(filter) {
            const c = document.getElementById('periods-container');
            c.innerHTML = '';
            if (!currentCurriculum) return;
            currentCurriculum.periods.forEach((p, idx) => {
                const subs = StudyTrackPeriods.getVisibleSubjects(p, userProgress, filter, currentFilter);
                if (!subs.length) return;

                const div = document.createElement('div');
                div.className = 'bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm animate-fade-in transition-all duration-300 hover:shadow-md';
                div.innerHTML = StudyTrackPeriods.renderPeriodCardHTML({
                    period: p,
                    periodIndex: idx,
                    visibleSubjects: subs,
                    open: StudyTrackPeriods.isPeriodOpen(idx, APP_CONFIG.collapsedPeriods, filter, currentFilter),
                    stats: calculatePeriodStats(p),
                    average: calculatePeriodAverage(p),
                    gpa4: calculatePeriodGPA4(p),
                    statusColor: getPeriodStatusColor(p),
                    escapeHtml,
                    renderSubject: renderSubjectCardString
                });
                c.appendChild(div);
            });
        }
        function animateSubjectEntrance() {
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            const cards = document.querySelectorAll('#subjects-view .stk-card');
            if (!cards.length) return;
            cards.forEach(card => card.classList.remove('stk-anim-in'));
            void document.body.offsetWidth; // single reflow to allow re-trigger
            cards.forEach((card, i) => {
                card.style.animationDelay = Math.min(i, 12) * 35 + 'ms';
                card.classList.add('stk-anim-in');
                card.addEventListener('animationend', () => {
                    card.classList.remove('stk-anim-in');
                    card.style.animationDelay = '';
                }, { once: true });
            });
        }
        function setFilter(filter) { currentFilter = filter; document.querySelectorAll('.filter-btn').forEach(btn => { btn.classList.remove('active', 'active-enrolled', 'active-completed', 'active-pending'); }); const activeBtn = document.getElementById(`filter-${filter}`); if (filter === 'enrolled') activeBtn.classList.add('active-enrolled'); else if (filter === 'completed') activeBtn.classList.add('active-completed'); else if (filter === 'pending') activeBtn.classList.add('active-pending'); else activeBtn.classList.add('active'); renderPeriods(document.getElementById('search-input').value); }
        function updateFilterCounts() { if (!currentCurriculum) return; const counts = StudyTrackAcademics.calculateFilterCounts(currentCurriculum, userProgress); document.getElementById('count-all').textContent = counts.all; document.getElementById('count-enrolled').textContent = counts.enrolled; document.getElementById('count-completed').textContent = counts.completed; document.getElementById('count-pending').textContent = counts.pending; }
        function toggleDarkMode() { APP_CONFIG.darkMode = !APP_CONFIG.darkMode; StudyTrackStorage.setBoolean(StudyTrackStorage.KEYS.darkMode, APP_CONFIG.darkMode); document.documentElement.classList.toggle('dark'); document.getElementById('theme-icon').className = APP_CONFIG.darkMode ? 'fas fa-sun text-sm' : 'fas fa-moon text-sm'; notifySyncChange(); }
        function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

        function registerServiceWorker() {
            if (!('serviceWorker' in navigator) || !/^https?:$/.test(window.location.protocol)) return;
            navigator.serviceWorker.register('./sw.js').catch(() => { });
        }
        function getSubjectStatusLabel(subjectId) {
            const status = userProgress[subjectId]?.status || 'pending';
            if (status === 'approved') return 'Aprobada';
            if (status === 'enrolled') return 'Inscrita';
            return 'Pendiente';
        }

        function findSubjectByCodeOrId(codeOrId) {
            if (!currentCurriculum || !codeOrId) return null;
            const wanted = String(codeOrId).trim().toLowerCase();
            for (let periodIndex = 0; periodIndex < currentCurriculum.periods.length; periodIndex++) {
                const period = currentCurriculum.periods[periodIndex];
                const subject = period.subjects.find(candidate =>
                    String(candidate.id || '').toLowerCase() === wanted ||
                    String(candidate.code || '').toLowerCase() === wanted
                );
                if (subject) return { subject, period, periodIndex };
            }
            return null;
        }

        function getPrimaryPrerequisiteTarget(prerequisites) {
            if (!prerequisites?.length) return null;
            const flattened = prerequisites.flat().filter(item => item !== 'ALL');
            return flattened.find(item => !userProgress[item] || userProgress[item]?.status !== 'approved') || flattened[0] || null;
        }

        function closePrerequisitePopover() {
            document.getElementById('prerequisite-popover')?.remove();
        }

        function showPrerequisitePopover(event, subjectId) {
            event?.stopPropagation();
            closePrerequisitePopover();
            const loc = findSubjectLocation(subjectId);
            if (!loc) return;

            const targetCode = getPrimaryPrerequisiteTarget(loc.subject.prerequisites);
            const target = findSubjectByCodeOrId(targetCode);
            const rawRequirement = formatPrerequisiteString(loc.subject.prerequisites);
            const popover = document.createElement('div');
            popover.id = 'prerequisite-popover';
            popover.className = 'fixed z-[130] w-72 p-3 animate-scale-up stk-surface-card';
            popover.style.boxShadow = 'var(--stk-shadow-hover)';

            const anchorRect = event?.currentTarget?.getBoundingClientRect();
            const top = Math.min(window.innerHeight - 170, Math.max(12, (anchorRect?.bottom || 80) + 8));
            const left = Math.min(window.innerWidth - 300, Math.max(12, anchorRect?.left || 12));
            popover.style.top = `${top}px`;
            popover.style.left = `${left}px`;

            const title = document.createElement('div');
            title.className = 'text-xs font-black uppercase text-orange-500 dark:text-orange-400 mb-1';
            title.textContent = 'Prerrequisito';
            const body = document.createElement('div');
            body.className = 'text-sm font-black text-slate-900 dark:text-white';
            body.textContent = target ? `${target.subject.code} · ${target.subject.name}` : rawRequirement;
            const detail = document.createElement('div');
            detail.className = 'text-xs text-slate-500 dark:text-slate-400 mt-1';
            detail.textContent = target ? getSubjectStatusLabel(target.subject.id) : 'Requisito general del plan';

            const actions = document.createElement('div');
            actions.className = 'flex items-center gap-2 mt-3';
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'settings-quick-link flex-1 py-2 text-xs font-bold';
            closeBtn.textContent = 'Cerrar';
            closeBtn.onclick = closePrerequisitePopover;
            actions.appendChild(closeBtn);

            if (target) {
                const goBtn = document.createElement('button');
                goBtn.type = 'button';
                goBtn.className = 'stk-btn-primary flex-1 py-2 text-xs font-bold';
                goBtn.textContent = 'Ir';
                goBtn.onclick = () => navigateToSubject(target.subject.id);
                actions.appendChild(goBtn);
            }

            popover.append(title, body, detail, actions);
            document.body.appendChild(popover);
        }

        function navigateToSubject(subjectId) {
            const loc = findSubjectLocation(subjectId);
            if (!loc) return;
            closePrerequisitePopover();
            switchView('subjects');
            APP_CONFIG.collapsedPeriods.delete(loc.periodIndex);
            StudyTrackStorage.setJson(StudyTrackStorage.KEYS.collapsedPeriods, [...APP_CONFIG.collapsedPeriods]);
            currentFilter = 'all';
            setFilter('all');
            requestAnimationFrame(() => {
                const card = document.getElementById(`subject-card-${subjectId}`);
                if (!card) return;
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.classList.add('ring-4', 'ring-primary-400', 'ring-offset-2', 'ring-offset-white', 'dark:ring-offset-slate-950');
                setTimeout(() => card.classList.remove('ring-4', 'ring-primary-400', 'ring-offset-2', 'ring-offset-white', 'dark:ring-offset-slate-950'), 1800);
            });
        }

        function getGradeLabel(score) {
            return StudyTrackGrades.getGradeLabel(score, APP_CONFIG.gradeScale);
        }

        function getGradePoints(score) {
            return StudyTrackGrades.getGradePoints(score, APP_CONFIG.gradeScale);
        }

        function saveGradeScale() {
            StudyTrackStorage.setJson(StudyTrackStorage.KEYS.gradeScale, APP_CONFIG.gradeScale);
            notifySyncChange();
            renderGradeScaleSettings();
            renderUI(); // Refresh Cards to show new labels
            renderPeriods(document.getElementById('search-input').value); // Re-calculate Period GPA
        }

        function addGradeRange() {
            APP_CONFIG.gradeScale.push({ min: 0, label: '?', color: 'text-slate-500', points: 0 });
            saveGradeScale();
        }

        function removeGradeRange(index) {
            APP_CONFIG.gradeScale.splice(index, 1);
            saveGradeScale();
        }

        function updateGradeRange(index, field, value) {
            APP_CONFIG.gradeScale[index][field] = (field === 'min' || field === 'points') ? parseFloat(value) : value;
            saveGradeScale();
        }

        function renderGradeScaleSettings() {
            const container = document.getElementById('grade-scale-settings-list');
            if (!container) return;
            container.innerHTML = APP_CONFIG.gradeScale.sort((a, b) => b.min - a.min).map((g, i) => {
                const safeMin = escapeHtml(g.min);
                const safeLabel = escapeHtml(g.label);
                const safePoints = escapeHtml(g.points);
                const safeColor = sanitizeCssClasses(g.color);
                return `
                <div class="flex items-center gap-2 mb-2">
                    <input type="number" step="any" value="${safeMin}" data-change="updateGradeRange" data-args="${actionArgs(i, 'min', '$value')}" class="w-14 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-1 text-center font-bold text-xs outline-none focus:ring-1 focus:ring-primary-500" placeholder="Min">
                    <span class="text-xs text-slate-400">→</span>
                    <input type="text" value="${safeLabel}" data-change="updateGradeRange" data-args="${actionArgs(i, 'label', '$value')}" class="w-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-1 text-center font-bold text-xs uppercase outline-none focus:ring-1 focus:ring-primary-500 ${safeColor}" placeholder="Letra">
                    <span class="text-xs text-slate-400">=</span>
                    <input type="number" step="0.1" value="${safePoints}" data-change="updateGradeRange" data-args="${actionArgs(i, 'points', '$value')}" class="w-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-1 text-center font-bold text-xs outline-none focus:ring-1 focus:ring-primary-500" placeholder="Pts">
                    <button data-action="removeGradeRange" data-args="${actionArgs(i)}" class="text-red-500 hover:text-red-700 p-1 ml-auto"><i class="fas fa-trash"></i></button>
                </div>
            `;
            }).join('');
        }

        function getCurrentViewNavId() { return currentView === 'schedule' ? 'nav-schedule' : currentView === 'subjects' ? 'nav-subjects' : 'nav-home'; }
        function setActiveMobileNav(activeId) {
            document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.toggle('active', btn.id === activeId));
            const sideId = activeId.replace('nav-', 'side-');
            document.querySelectorAll('.side-tab').forEach(btn => btn.classList.toggle('active', btn.id === sideId));
        }
        function openSettings() { renderGradeScaleSettings(); renderSettingsRequirements(); updateSkipPrereqsToggle(); document.getElementById('enrollment-limit-input').value = APP_CONFIG.maxEnrolledSubjects; document.getElementById('passing-grade-input').value = APP_CONFIG.passingGrade; document.getElementById('settings-modal').classList.remove('hidden'); }
        function scrollSettingsSection(sectionId) { document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        function toggleSkipPrerequisites() { APP_CONFIG.allowSkipPrerequisites = !APP_CONFIG.allowSkipPrerequisites; StudyTrackStorage.setBoolean(StudyTrackStorage.KEYS.allowSkipPrerequisites, APP_CONFIG.allowSkipPrerequisites); updateSkipPrereqsToggle(); renderPeriods(document.getElementById('search-input').value); notifySyncChange(); }
        function updateSkipPrereqsToggle() { const toggle = document.getElementById('toggle-skip-prereqs'); if (toggle) { if (APP_CONFIG.allowSkipPrerequisites) toggle.classList.add('active'); else toggle.classList.remove('active'); } }
        function getEnrolledCount() { if (!currentCurriculum) return 0; let count = 0; currentCurriculum.periods.forEach(p => p.subjects.forEach(s => { if (userProgress[s.id]?.status === 'enrolled') count++; })); return count; }
        function toggleEnrollment(id) { if (!userProgress[id]) userProgress[id] = { status: 'pending', grade: null, attempts: [], completionDate: null }; const currentStatus = userProgress[id].status; const loc = findSubjectLocation(id); if (currentStatus === 'enrolled') { userProgress[id].status = 'pending'; } else { const prereqsMet = loc ? checkPrerequisites(loc.subject.prerequisites) : true; if (!prereqsMet && !APP_CONFIG.allowSkipPrerequisites) { showToast(`🔒 Debes completar los prerrequisitos primero o habilitar "Saltar prerrequisitos" en Ajustes.`, 'error'); return; } const enrolledCount = getEnrolledCount(); if (enrolledCount >= APP_CONFIG.maxEnrolledSubjects) { showToast(`⚠️ Límite alcanzado (${APP_CONFIG.maxEnrolledSubjects}). Ve a Ajustes para aumentar el límite o marca alguna materia como completada.`, 'error'); return; } userProgress[id].status = 'enrolled'; } saveUserProgress(); if (loc) reRenderSubjectCardDOM(loc.subject, loc.period.period_number); calculateStatistics(); }
        function updateEnrollmentLimit(val) { const newLimit = Math.max(1, Math.min(20, parseInt(val) || 10)); APP_CONFIG.maxEnrolledSubjects = newLimit; StudyTrackStorage.setNumber(StudyTrackStorage.KEYS.maxEnrolledSubjects, newLimit); document.getElementById('enrollment-limit-input').value = newLimit; notifySyncChange(); showToast(`Límite actualizado a ${newLimit} materias`, 'success'); }
        function updatePassingGrade(val) {
            const parsed = parseFloat(val);
            const input = document.getElementById('passing-grade-input');
            if (!Number.isFinite(parsed)) { if (input) input.value = APP_CONFIG.passingGrade; return; }
            const newPassing = Math.max(0, Math.min(100, parsed));
            APP_CONFIG.passingGrade = newPassing;
            StudyTrackStorage.setItem(StudyTrackStorage.KEYS.passingGrade, newPassing);
            // Re-evaluate every graded subject so the stored approval status matches the new threshold.
            Object.keys(userProgress).forEach(id => {
                const entry = userProgress[id];
                // Skip enrolled (in-progress) subjects: changing the threshold should not
                // silently mark a course you are currently taking as approved.
                if (entry && entry.status !== 'enrolled' && entry.grade !== null && entry.grade !== undefined && entry.grade !== '') {
                    userProgress[id] = StudyTrackProgress.applyGradeToSubjectProgress(entry, entry.grade, newPassing);
                }
            });
            saveUserProgress();
            if (input) input.value = newPassing;
            renderPeriods(document.getElementById('search-input').value);
            calculateStatistics();
            showToast(`Nota mínima para aprobar: ${newPassing}`, 'success');
        }
        function closeSettings() { document.getElementById('settings-modal').classList.add('hidden'); setActiveMobileNav(getCurrentViewNavId()); }
        function openMobileMore() { setActiveMobileNav('nav-more'); openSettings(); }
        function showToast(msg, type = 'info') { const t = document.createElement('div'); const c = { success: 'bg-emerald-600', error: 'bg-red-600', info: 'bg-slate-800' }; t.className = `${c[type]} text-white px-4 py-3 rounded-lg shadow-xl fixed top-20 right-4 z-[120] animate-slide-up font-medium text-sm`; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3000); }
        // Helper for Period Status Color
        function getPeriodStatusColor(p) {
            let total = 0, approved = 0, enrolled = 0;
            p.subjects.forEach(s => {
                total++;
                const st = userProgress[s.id];
                if (st?.status === 'approved') approved++;
                else if (st?.status === 'enrolled') enrolled++;
            });

            if (total > 0 && approved === total) return 'bg-emerald-500 shadow-emerald-500/30'; // Completado
            if (approved > 0 || enrolled > 0) return 'bg-blue-600 shadow-blue-500/30'; // En progreso
            return 'bg-slate-400 dark:bg-slate-600 shadow-slate-500/30'; // No iniciado/Default
        }

        function calculatePeriodAverage(p) { return StudyTrackAcademics.calculatePeriodAverage(p, userProgress); }

        function calculatePeriodGPA4(p) { return StudyTrackAcademics.calculatePeriodGPA4(p, userProgress, getGradePoints); }

        function toggleCustomJson() { document.getElementById('custom-json-area').classList.toggle('hidden'); }
        function loadCustomJSON() { try { const d = JSON.parse(document.getElementById('custom-json-input').value); const validation = StudyTrackCurriculum.validateCurriculum(d); if (!validation.valid) throw new Error(validation.errors[0]); if (confirm('¿Cargar?')) { currentCurriculum = d; userProgress = {}; saveCurriculum(); saveUserProgress(); dependencyGraph = buildDependencyGraph(currentCurriculum); renderUI(); calculateStatistics(); renderRequirementsWidget(); closeSettings(); showToast('Cargado', 'success'); } } catch (e) { showToast('Error en JSON: ' + (e.message || 'formato invalido'), 'error'); } }
        function exportProgress() { const b = new Blob([JSON.stringify({ curriculum: currentCurriculum, progress: userProgress }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'backup.json'; a.click(); }
        function resetProgress() { if (confirm('¿Reiniciar?')) { userProgress = {}; saveUserProgress(); initApp(); showToast('Reiniciado', 'success'); } }
        function deleteAllData() { if (confirm('¿Borrar todo?')) { StudyTrackStorage.clearAll(); location.reload(); } }
        function importData(inp) { const f = inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = e => { try { const d = JSON.parse(e.target.result); if (!d.curriculum || !d.progress) throw new Error('Backup incompleto'); const validation = StudyTrackCurriculum.validateCurriculum(d.curriculum); if (!validation.valid) throw new Error(validation.errors[0]); if (confirm('¿Importar?')) { currentCurriculum = d.curriculum; userProgress = StudyTrackProgress.normalizeUserProgress(d.progress, d.curriculum); saveCurriculum(); saveUserProgress(); dependencyGraph = buildDependencyGraph(currentCurriculum); renderUI(); calculateStatistics(); renderRequirementsWidget(); closeSettings(); showToast('Éxito', 'success'); } } catch (e) { showToast('Error: ' + (e.message || 'archivo invalido'), 'error'); } }; r.readAsText(f); }

        let isRequirementsExpanded = true;
        function toggleRequirementsWidget() {
            isRequirementsExpanded = !isRequirementsExpanded;
            renderRequirementsWidget();
        }

        function renderRequirementsWidget() {
            const c = document.getElementById('requirements-list-main');
            if (!currentCurriculum) return;
            c.innerHTML = StudyTrackRequirements.renderRequirementsWidgetHTML(currentCurriculum.requirements, {
                expanded: isRequirementsExpanded,
                escapeHtml
            });
        }

        function renderSettingsRequirements() { const c = document.getElementById('settings-requirements-list'); if (!currentCurriculum) return; c.innerHTML = StudyTrackRequirements.renderSettingsRequirementsHTML(currentCurriculum.requirements, { escapeHtml }); }
        function toggleRequirement(i) { const result = StudyTrackRequirements.toggleRequirement(currentCurriculum.requirements, i); if (!result.changed) return; currentCurriculum.requirements = result.requirements; saveCurriculum(); renderRequirementsWidget(); renderSettingsRequirements(); }
        function deleteRequirement(i) { if (confirm('¿Borrar?')) { const result = StudyTrackRequirements.deleteRequirement(currentCurriculum.requirements, i); if (!result.changed) return; currentCurriculum.requirements = result.requirements; saveCurriculum(); renderRequirementsWidget(); renderSettingsRequirements(); } }
        function toggleAddReqForm() { document.getElementById('new-req-form').classList.toggle('hidden'); document.getElementById('add-req-btn').classList.toggle('hidden'); }
        function confirmAddRequirement() { const input = document.getElementById('new-req-name'); const result = StudyTrackRequirements.addRequirement(currentCurriculum.requirements, input.value, () => `req-${Date.now()}`); if (result.changed) { currentCurriculum.requirements = result.requirements; saveCurriculum(); renderRequirementsWidget(); renderSettingsRequirements(); toggleAddReqForm(); input.value = ''; } }
        let currentView = 'home';
        let scheduleData = StudyTrackStorage.getJson(StudyTrackStorage.KEYS.schedule, {});
        let scheduleViewType = StudyTrackStorage.getItem(StudyTrackStorage.KEYS.scheduleViewType) || 'list';
        let currentEditingBlock = null; // {subjectId, blockId}
        const DAYS = StudyTrackSchedule.DAYS;
        const DAY_NAMES = StudyTrackSchedule.DAY_NAMES;

        function saveScheduleData() { StudyTrackStorage.setJson(StudyTrackStorage.KEYS.schedule, scheduleData); notifySyncChange(); }

        function formatTime12h(time) {
            return StudyTrackSchedule.formatTime12h(time);
        }

        function getSubjectColor(id, idx) { return StudyTrackSchedule.getSubjectColor(id, idx); }

        function setIconButtonContent(button, iconClass, text) {
            button.replaceChildren();
            const icon = document.createElement('i');
            icon.className = `${iconClass} mr-2`;
            button.append(icon, document.createTextNode(text));
        }

        function setScheduleRoomDetails(room) {
            const roomEl = document.getElementById('details-room');
            roomEl.replaceChildren();
            if (!room) {
                const empty = document.createElement('span');
                empty.className = 'italic text-slate-400';
                empty.textContent = 'Sin aula asignada';
                roomEl.appendChild(empty);
                return;
            }
            const icon = document.createElement('i');
            icon.className = 'fas fa-map-marker-alt text-red-500';
            const text = document.createElement('span');
            text.textContent = room;
            roomEl.append(icon, document.createTextNode(' '), text);
        }

        function switchView(view) {
            currentView = view;
            const homeView = document.getElementById('home-view');
            const subjectsView = document.getElementById('subjects-view');
            const scheduleView = document.getElementById('schedule-view');
            homeView.classList.toggle('hidden', view !== 'home');
            subjectsView.classList.toggle('hidden', view !== 'subjects');
            scheduleView.classList.toggle('hidden', view !== 'schedule');
            setActiveMobileNav(view === 'schedule' ? 'nav-schedule' : view === 'subjects' ? 'nav-subjects' : 'nav-home');
            if (view === 'home') renderHomeView();
            if (view === 'schedule') renderScheduleView();
            if (view === 'subjects') animateSubjectEntrance();
            const shown = view === 'home' ? homeView : view === 'schedule' ? scheduleView : null;
            if (shown) { shown.classList.remove('stk-view-in'); void shown.offsetWidth; shown.classList.add('stk-view-in'); }
        }

        function showMobileProgress() {
            switchView('subjects');
            setActiveMobileNav('nav-progress');
            const hub = document.getElementById('mobile-academic-hub');
            if (hub) hub.scrollIntoView({ behavior: 'smooth', block: 'start' });
            else window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function getEnrolledSubjects() { const enrolled = []; if (currentCurriculum) { currentCurriculum.periods.forEach(p => p.subjects.forEach(s => { if (userProgress[s.id]?.status === 'enrolled') enrolled.push({ ...s, period: p.period_number }); })); } return enrolled; }

        function toggleScheduleView(type) { scheduleViewType = type; StudyTrackStorage.setItem(StudyTrackStorage.KEYS.scheduleViewType, type); notifySyncChange(); updateScheduleViewButtons(); const listContainer = document.getElementById('weekly-schedule-list'); const gridContainer = document.getElementById('weekly-schedule-table'); if (type === 'list') { listContainer.classList.remove('hidden'); gridContainer.classList.add('hidden'); } else { listContainer.classList.add('hidden'); gridContainer.classList.remove('hidden'); } renderScheduleView(); }

        function updateScheduleViewButtons() { const btnList = document.getElementById('view-btn-list'); const btnGrid = document.getElementById('view-btn-grid'); if (scheduleViewType === 'list') { btnList.className = 'px-3 py-1 text-xs font-bold rounded-md bg-white dark:bg-slate-600 text-slate-800 dark:text-white shadow-sm transition-all'; btnGrid.className = 'px-3 py-1 text-xs font-bold rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all'; } else { btnGrid.className = 'px-3 py-1 text-xs font-bold rounded-md bg-white dark:bg-slate-600 text-slate-800 dark:text-white shadow-sm transition-all'; btnList.className = 'px-3 py-1 text-xs font-bold rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all'; } }

        function updateScheduleSummary(enrolled) {
            const scheduledCount = enrolled.filter(subject => (scheduleData[subject.id] || []).length > 0).length;
            const pendingCount = enrolled.length - scheduledCount;
            document.getElementById('schedule-summary-enrolled').textContent = enrolled.length;
            document.getElementById('schedule-summary-scheduled').textContent = scheduledCount;
            document.getElementById('schedule-summary-pending').textContent = pendingCount;
            document.getElementById('unscheduled-count').textContent = pendingCount;
            document.getElementById('unscheduled-count').classList.toggle('hidden', pendingCount === 0);
        }

        function renderScheduleView() { const enrolled = getEnrolledSubjects(); const emptyEl = document.getElementById('schedule-empty'); const unscheduledSection = document.getElementById('unscheduled-section'); const unscheduledList = document.getElementById('unscheduled-list'); document.querySelector('#unscheduled-section h3').innerHTML = '<i class="fas fa-edit text-primary-500"></i> Gestionar Horarios'; updateScheduleSummary(enrolled); if (enrolled.length === 0) { emptyEl.classList.remove('hidden'); unscheduledSection.classList.add('hidden'); document.getElementById('weekly-schedule-list').parentElement.classList.add('hidden'); return; } emptyEl.classList.add('hidden'); unscheduledSection.classList.remove('hidden'); document.getElementById('weekly-schedule-list').parentElement.classList.remove('hidden'); unscheduledList.innerHTML = StudyTrackSchedule.renderEnrolledScheduleHTML(enrolled, scheduleData, { escapeHtml, escapeJsString }); updateScheduleViewButtons(); if (scheduleViewType === 'list') { document.getElementById('weekly-schedule-list').classList.remove('hidden'); document.getElementById('weekly-schedule-table').classList.add('hidden'); renderWeeklySchedule(enrolled); } else { document.getElementById('weekly-schedule-list').classList.add('hidden'); document.getElementById('weekly-schedule-table').classList.remove('hidden'); renderTableSchedule(enrolled); } }



        function renderTableSchedule(enrolled) {
            const container = document.getElementById('visual-schedule-grid');
            const noClasses = document.getElementById('schedule-no-classes');
            const allBlocks = StudyTrackSchedule.collectScheduleBlocks(enrolled, scheduleData);
            if (allBlocks.length === 0) { container.innerHTML = ''; noClasses.classList.remove('hidden'); return; }
            noClasses.classList.add('hidden');
            const rendered = StudyTrackSchedule.renderVisualScheduleHTML(allBlocks, { escapeHtml, escapeJsString });
            container.style.height = `${rendered.height}px`;
            container.innerHTML = rendered.html;
        }

        function renderWeeklySchedule(enrolled) {
            const grid = document.getElementById('schedule-grid');
            const noClasses = document.getElementById('schedule-no-classes');
            const allBlocks = StudyTrackSchedule.collectScheduleBlocks(enrolled, scheduleData);
            if (allBlocks.length === 0) { grid.innerHTML = ''; noClasses.classList.remove('hidden'); return; }
            noClasses.classList.add('hidden');
            grid.innerHTML = StudyTrackSchedule.renderWeeklyScheduleHTML(allBlocks, { escapeHtml, escapeJsString });
        }

        function openScheduleModal(subjectId, subjectName, blockToEdit = null) { currentEditingBlock = blockToEdit ? { subjectId, blockToEdit } : null; const saveButton = document.getElementById('schedule-save-btn'); document.getElementById('schedule-subject-id').value = subjectId; document.getElementById('schedule-subject-name').textContent = subjectName; if (blockToEdit) { document.getElementById('schedule-day').value = blockToEdit.day; document.getElementById('schedule-start').value = blockToEdit.startTime; document.getElementById('schedule-end').value = blockToEdit.endTime; document.getElementById('schedule-room').value = blockToEdit.room || ''; document.querySelector('#schedule-modal h2').innerText = 'Editar Horario'; setIconButtonContent(saveButton, 'fas fa-save', 'Guardar Cambios'); } else { document.getElementById('schedule-day').value = 'lunes'; document.getElementById('schedule-start').value = '08:00'; document.getElementById('schedule-end').value = '10:00'; document.getElementById('schedule-room').value = ''; document.querySelector('#schedule-modal h2').innerText = 'Agregar Horario'; setIconButtonContent(saveButton, 'fas fa-plus', 'Agregar al Horario'); } document.getElementById('schedule-conflict-alert').classList.add('hidden'); document.getElementById('schedule-modal').classList.remove('hidden'); }

        function closeScheduleModal() { document.getElementById('schedule-modal').classList.add('hidden'); currentEditingBlock = null; }

        function showBlockDetails(subjectId, blockId) { const blocks = scheduleData[subjectId] || []; const block = blocks.find(b => b.id === blockId); const subject = getEnrolledSubjects().find(s => s.id === subjectId); if (!block || !subject) return; document.getElementById('details-subject').innerText = subject.name; document.getElementById('details-code').innerText = subject.code; document.getElementById('details-day').innerText = DAY_NAMES[block.day]; document.getElementById('details-time').innerText = `${formatTime12h(block.startTime)} - ${formatTime12h(block.endTime)}`; setScheduleRoomDetails(block.room); const btnEdit = document.getElementById('btn-edit-block'); const btnDelete = document.getElementById('btn-delete-block'); btnEdit.onclick = () => { closeDetailsModal(); openScheduleModal(subjectId, subject.name, block); }; btnDelete.onclick = () => { if (confirm('¿Eliminar este horario?')) { deleteScheduleBlock(subjectId, blockId); closeDetailsModal(); } }; const modal = document.getElementById('schedule-details-modal'); modal.classList.remove('hidden'); requestAnimationFrame(() => { modal.classList.remove('opacity-0'); document.getElementById('details-modal-content').classList.remove('scale-95'); }); }

        function closeDetailsModal() { const modal = document.getElementById('schedule-details-modal'); modal.classList.add('opacity-0'); document.getElementById('details-modal-content').classList.add('scale-95'); setTimeout(() => modal.classList.add('hidden'), 200); }

        function checkScheduleConflict(day, start, end, excludeSubjectId = null) {
            const excludeBlockId = currentEditingBlock?.blockToEdit?.id || null;
            return StudyTrackSchedule.findScheduleConflict({
                day,
                start,
                end,
                enrolledSubjects: getEnrolledSubjects(),
                scheduleData,
                excludeSubjectId: excludeSubjectId || currentEditingBlock?.subjectId || null,
                excludeBlockId
            });
        }

        function saveScheduleBlock() {
            const subjectId = document.getElementById('schedule-subject-id').value;
            const day = document.getElementById('schedule-day').value;
            const start = document.getElementById('schedule-start').value;
            const end = document.getElementById('schedule-end').value;
            const room = document.getElementById('schedule-room').value.trim();
            const existingBlockId = currentEditingBlock?.blockToEdit?.id || null;

            const validation = StudyTrackSchedule.validateScheduleBlockOperation({
                day,
                start,
                end,
                enrolledSubjects: getEnrolledSubjects(),
                scheduleData,
                excludeSubjectId: currentEditingBlock?.subjectId || null,
                excludeBlockId: existingBlockId
            });

            if (!validation.valid && validation.reason === 'invalid-range') {
                showToast('La hora de fin debe ser mayor a la hora de inicio', 'error');
                return;
            }

            if (!validation.valid && validation.reason === 'conflict') {
                document.getElementById('schedule-conflict-alert').classList.remove('hidden');
                document.getElementById('conflict-message').textContent = `Conflicto con ${validation.conflict.subject} (${validation.conflict.time})`;
                return;
            }

            const result = StudyTrackSchedule.upsertScheduleBlock(scheduleData, subjectId, {
                id: `block-${Date.now()}`,
                day,
                startTime: start,
                endTime: end,
                room
            }, existingBlockId);

            if (!result.changed) {
                showToast('No se pudo actualizar el horario', 'error');
                return;
            }

            scheduleData = result.scheduleData;
            showToast(existingBlockId ? 'Horario actualizado' : 'Horario agregado', 'success');
            saveScheduleData();
            closeScheduleModal();
            renderScheduleView();
        }

        function deleteScheduleBlock(subjectId, blockId) {
            const result = StudyTrackSchedule.deleteScheduleBlock(scheduleData, subjectId, blockId);
            if (!result.changed) return;

            scheduleData = result.scheduleData;
            saveScheduleData();
            renderScheduleView();
            showToast('Bloque eliminado', 'info');
        }

        // ── CSP-safe event delegation ──────────────────────────────────────
        // Inline on* handlers require script-src 'unsafe-inline'. Instead, elements
        // declare data-action / data-change (+ optional data-args JSON) and a single
        // delegated listener dispatches here. Arg tokens resolved at runtime:
        //   "$value" -> element value, "$this" -> element, "$event" -> the event.
        // data-action-self fires only when the event originated on the element
        // itself (modal backdrops). The action "stop" is a no-op shield: because
        // closest() picks the nearest [data-action], it stops an ancestor action
        // from firing without needing stopPropagation.
        function resolveActionArgs(el, event) {
            const raw = el.getAttribute('data-args');
            if (!raw) return [];
            let parsed;
            try { parsed = JSON.parse(raw); } catch { return []; }
            if (!Array.isArray(parsed)) return [];
            return parsed.map((arg) => arg === '$value' ? el.value : arg === '$this' ? el : arg === '$event' ? event : arg);
        }
        function runAction(name, el, event) {
            if (!name || name === 'stop') return;
            const fn = window[name];
            if (typeof fn === 'function') fn(...resolveActionArgs(el, event));
        }
        document.addEventListener('click', (event) => {
            const el = event.target.closest('[data-action], [data-action-self]');
            if (!el) return;
            if (el.hasAttribute('data-action-self')) {
                if (event.target === el) runAction(el.getAttribute('data-action-self'), el, event);
                return;
            }
            runAction(el.getAttribute('data-action'), el, event);
        });
        document.addEventListener('change', (event) => {
            const el = event.target.closest('[data-change]');
            if (!el || el !== event.target) return;
            runAction(el.getAttribute('data-change'), el, event);
        });

        window.addEventListener('DOMContentLoaded', initApp);
        window.addEventListener('load', registerServiceWorker);
        document.getElementById('settings-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeSettings(); });
        window.addEventListener('scroll', () => { const btn = document.getElementById('scroll-top-btn'); if (window.scrollY > 300) { btn.classList.remove('opacity-0', 'pointer-events-none'); btn.classList.add('opacity-100'); } else { btn.classList.add('opacity-0', 'pointer-events-none'); btn.classList.remove('opacity-100'); } });
