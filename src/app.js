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
            scheduleSplashDismiss(); // the splash overlay dismisses itself on a short timer, independent of init work below
            milestonesReady = false; // silence celebrations during (re)init — incl. cloud-pull re-runs
            loadSettings(); // refresh cloud-synced settings (so a sync pull applies without reload)
            if (APP_CONFIG.darkMode) { document.documentElement.classList.add('dark'); document.getElementById('theme-icon').className = 'fas fa-sun text-sm'; }

            // Check persistence first
            const storedCurriculum = StudyTrackStorage.getJson(APP_CONFIG.storageKeys.curriculum, null);

            // Migration: a curriculum already on disk means this is an existing user (or
            // onboarding got far enough to load one) — never force them through the
            // onboarding flow, even if they predate the "onboarded" flag. This also
            // covers the "Ya tengo cuenta" login: a cloud pull re-runs initApp, and if it
            // restored a curriculum we land straight in the app instead of re-showing steps.
            if (storedCurriculum && !StudyTrackStorage.getBoolean(StudyTrackStorage.KEYS.onboarded, false)) {
                StudyTrackStorage.setBoolean(StudyTrackStorage.KEYS.onboarded, true);
            }

            if (storedCurriculum) {
                try {
                    currentCurriculum = storedCurriculum;
                    loadUserProgress();
                    dependencyGraph = buildDependencyGraph(currentCurriculum);
                    renderUI();
                    calculateStatistics();
                    renderRequirementsWidget();
                    hideWelcomeScreen(); // no-op if it was already hidden; dismisses it if a mid-onboarding login just restored data
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
            // A cloud pull re-runs initApp; keep the on-screen profile fresh if it's active.
            if (currentView === 'profile') renderProfileView();
            milestonesReady = true; // baseline is stamped; from here new achievements celebrate
            maybeShowSharedCard(); // if opened from a shared QR/link, show the received card
        }

        // ============================================================
        // SPLASH SCREEN
        // ============================================================

        function isReducedMotion() {
            return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        }

        // Shows briefly on every load (existing users included) so the app never pops in
        // unstyled; kept short and shortened further under reduced-motion so it never
        // reads as a delay. Independent of the rest of init — it just covers whatever
        // is being decided underneath for a moment.
        function scheduleSplashDismiss() {
            const delay = isReducedMotion() ? 150 : 1300;
            setTimeout(() => {
                const splash = document.getElementById('splash-screen');
                if (splash) splash.classList.add('hidden');
            }, delay);
        }

        // ============================================================
        // LOGIC FOR WELCOME SCREEN & SELECTORS
        // ============================================================

        function showWelcomeScreen() {
            resetOnboardingState();
            renderOnboardingStep();
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
            const loader = document.getElementById(`${prefix}-library-loading`);

            if (!uniSelect || !careerSelect) return;

            // Loading affordance: the remote library index hasn't resolved yet.
            const hasData = libraryData.length > 0;
            if (loader) loader.classList.toggle('hidden', hasData);
            uniSelect.classList.toggle('opacity-50', !hasData);
            uniSelect.classList.toggle('pointer-events-none', !hasData);

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
                    clearOnboardingVerifySummary();
                }

                // Reset button
                if (btn) { btn.classList.add('opacity-50', 'pointer-events-none'); }
            };

            // 3. Handle Career Change
            careerSelect.onchange = () => {
                if (btn) { btn.classList.remove('opacity-50', 'pointer-events-none'); }
                if (prefix === 'welcome') updateOnboardingVerifySummary();
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

            // Onboarding's verify step "confirms" the plan mid-flow: it loads the
            // curriculum (so grades/tour/awards can use real data) but keeps the
            // onboarding modal open and advances to the next step instead of entering
            // the app — that only happens at the final "Ir a mi ruta" (completeOnboarding).
            if (origin === 'welcome' && currentCurriculum) advanceOnboardingAfterVerify();
            if (origin === 'settings') closeSettings();
        }

        // ============================================================
        // ONBOARDING FLOW (MiRuta multi-step welcome)
        // ============================================================

        const ONBOARDING_DOTS = {
            status: { label: 'Tu situación', count: 1, pct: 25 },
            verify: { label: 'Tu carrera', count: 2, pct: 50 },
            grades: { label: 'Tu historial', count: 3, pct: 75 },
            tour: { label: 'Conoce la app', count: 4, pct: 95 }
        };
        const ONBOARDING_TOUR_SLIDES = [
            { icon: 'fas fa-map', title: 'Ruta: tu mapa', desc: 'La pantalla de inicio muestra tu carrera como un camino con paradas por período. Siempre sabrás dónde estás y cuánto falta para la meta.' },
            { icon: 'fas fa-book', title: 'Materias: inscribe', desc: 'Explora los períodos como paradas y toca "Inscribir" en cualquier materia disponible. Mira cómo funciona:' },
            { icon: 'fas fa-calendar', title: 'Horario: tu semana', desc: 'Asigna bloques de día y hora a tus materias inscritas y míralos aparecer en tu semana. Puedes verla como lista o como tabla.' },
            { icon: 'fas fa-flag-checkered', title: 'Concluir o retirar', desc: 'Al terminar una materia: ponle su nota si la aprobaste, o retírala si no alcanzaste la calificación — vuelve a disponibles sin castigo.' },
            { icon: 'fas fa-user', title: 'Perfil: tu avance', desc: 'Tu carné universitario, tu porcentaje recorrido y tus hitos desbloqueados: todo tu progreso vive aquí.' }
        ];

        let onboardingStep = 'welcome';
        let onboardingHasHistory = null;
        let onboardingTrimDone = {};
        let onboardingTrimGrade = {};
        let onboardingTourIndex = 0;

        function resetOnboardingState() {
            onboardingStep = 'welcome';
            onboardingHasHistory = null;
            onboardingTrimDone = {};
            onboardingTrimGrade = {};
            onboardingTourIndex = 0;
        }

        function goOnboardingStep(step) {
            onboardingStep = step;
            renderOnboardingStep();
        }
        function goOnboardingStatus() { goOnboardingStep('status'); }
        function goOnboardingVerify() { goOnboardingStep('verify'); }
        function chooseOnboardingStarted() { onboardingHasHistory = true; goOnboardingStep('verify'); }
        function chooseOnboardingNew() { onboardingHasHistory = false; goOnboardingStep('verify'); }

        function advanceOnboardingAfterVerify() {
            goOnboardingStep(onboardingHasHistory ? 'grades' : 'tour');
        }

        function renderOnboardingStep() {
            document.querySelectorAll('.ob-step').forEach((section) => {
                section.classList.toggle('hidden', section.id !== `ob-step-${onboardingStep}`);
            });

            const dotsWrap = document.getElementById('ob-progress');
            const dotInfo = ONBOARDING_DOTS[onboardingStep];
            if (dotsWrap) {
                dotsWrap.classList.toggle('hidden', !dotInfo);
                if (dotInfo) {
                    document.getElementById('ob-progress-label').textContent = dotInfo.label;
                    document.getElementById('ob-progress-count').textContent = `Paso ${dotInfo.count} de 4`;
                    document.getElementById('ob-progress-bar').style.width = `${dotInfo.pct}%`;
                }
            }

            if (onboardingStep === 'grades') renderOnboardingGradesStep();
            if (onboardingStep === 'tour') renderOnboardingTourStep();
            if (onboardingStep === 'awards') renderOnboardingAwardsStep();
        }

        function clearOnboardingVerifySummary() {
            const summary = document.getElementById('ob-verify-summary');
            if (summary) summary.classList.add('hidden');
        }
        function updateOnboardingVerifySummary() {
            const summary = document.getElementById('ob-verify-summary');
            if (!summary) return;
            const uni = document.getElementById('welcome-uni-select').value;
            const careerId = document.getElementById('welcome-career-select').value;
            const item = libraryData.find((i) => i.id === careerId);
            if (!uni || !item) { summary.classList.add('hidden'); return; }
            summary.classList.remove('hidden');
            summary.querySelector('[data-ob-summary-text]').textContent =
                `${item.career_name} · ${item.degree_type || 'Grado'} · ${uni}`;
        }

        // ---- Grades step: bulk-mark whole periods as approved ----
        function toggleOnboardingPeriod(periodNumber) {
            onboardingTrimDone[periodNumber] = !onboardingTrimDone[periodNumber];
            if (!onboardingTrimDone[periodNumber]) delete onboardingTrimGrade[periodNumber];
            renderOnboardingGradesStep();
        }
        function pickOnboardingGrade(periodNumber, grade) {
            onboardingTrimGrade[periodNumber] = grade;
            renderOnboardingGradesStep();
        }
        function renderOnboardingGradesStep() {
            const list = document.getElementById('ob-grades-list');
            if (!list || !currentCurriculum) return;
            const periodType = currentCurriculum.metadata?.period_type || 'Período';
            list.innerHTML = currentCurriculum.periods.map((period) => {
                const n = period.period_number;
                const done = !!onboardingTrimDone[n];
                const grade = onboardingTrimGrade[n];
                const label = escapeHtml(period.name || `${periodType} ${n}`);
                const sub = done
                    ? 'Completado · elige tu nota promedio'
                    : `Toca para marcar como completado · ${period.subjects.length} materias`;
                const icon = done ? 'fas fa-check' : 'far fa-circle';
                const chips = [95, 90, 85, 80].map((v) => {
                    const active = grade === v;
                    return `<button type="button" data-action="pickOnboardingGrade" data-args="${actionArgs(n, v)}" class="stk-press" style="cursor:pointer;padding:6px 13px;border-radius:99px;font-size:12px;font-weight:800;font-family:var(--stk-font-numeric);background:${active ? 'var(--stk-tint)' : 'transparent'};color:${active ? '#fff' : 'var(--stk-text-2)'};border:1px solid ${active ? 'var(--stk-tint)' : 'var(--stk-hairline)'}">${v}</button>`;
                }).join('');
                return `<div class="stk-surface-card" style="padding:14px 16px;margin-bottom:10px;${done ? 'border:1.5px solid var(--stk-accent-approved);' : ''}">
                    <div data-action="toggleOnboardingPeriod" data-args="${actionArgs(n)}" class="stk-press" style="cursor:pointer;display:flex;align-items:center;gap:12px">
                        <span style="width:34px;height:34px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:13px;border:2.5px solid ${done ? 'var(--stk-accent-approved)' : 'var(--stk-text-3)'};background:${done ? 'var(--stk-accent-approved)' : 'transparent'};color:${done ? '#fff' : 'var(--stk-text-2)'}"><i class="${icon}"></i></span>
                        <span style="flex:1;min-width:0">
                            <span style="display:block;font-size:14.5px;font-weight:800;color:var(--stk-text-1)">${label}</span>
                            <span style="display:block;font-size:11.5px;color:var(--stk-text-2);margin-top:1px">${sub}</span>
                        </span>
                    </div>
                    ${done ? `<div style="display:flex;gap:8px;margin-top:12px;padding-left:46px;flex-wrap:wrap">${chips}</div>` : ''}
                </div>`;
            }).join('');
        }
        function continueOnboardingGrades() {
            const periodGrades = {};
            Object.keys(onboardingTrimDone).forEach((key) => {
                const n = Number(key);
                if (onboardingTrimDone[key] && onboardingTrimGrade[key] != null) periodGrades[n] = onboardingTrimGrade[key];
            });
            userProgress = StudyTrackProgress.applyBulkApprovalForPeriods(currentCurriculum, userProgress, periodGrades);
            saveUserProgress();
            dependencyGraph = buildDependencyGraph(currentCurriculum);
            calculateStatistics();
            goOnboardingStep('tour');
        }

        // ---- Tour step ----
        function renderOnboardingTourStep() {
            const slide = ONBOARDING_TOUR_SLIDES[onboardingTourIndex];
            const iconWrap = document.getElementById('ob-tour-icon');
            if (iconWrap) iconWrap.innerHTML = `<i class="${slide.icon}"></i>`;
            document.getElementById('ob-tour-title').textContent = slide.title;
            document.getElementById('ob-tour-desc').textContent = slide.desc;
            document.getElementById('ob-tour-next-btn').textContent = onboardingTourIndex === 4 ? 'Finalizar' : 'Siguiente';
            const prevBtn = document.getElementById('ob-tour-prev-btn');
            if (prevBtn) prevBtn.style.visibility = onboardingTourIndex === 0 ? 'hidden' : 'visible';

            const dotsWrap = document.getElementById('ob-tour-dots');
            if (dotsWrap) {
                dotsWrap.innerHTML = [0, 1, 2, 3, 4].map((i) =>
                    `<div style="width:8px;height:8px;border-radius:50%;background:${i === onboardingTourIndex ? 'var(--stk-tint)' : 'var(--stk-hairline)'};transition:background .2s ease"></div>`
                ).join('');
            }

            const demoWrap = document.getElementById('ob-tour-demos');
            if (demoWrap) demoWrap.innerHTML = renderOnboardingTourDemo(onboardingTourIndex);
        }
        function onboardingTourNext() {
            if (onboardingTourIndex < 4) { onboardingTourIndex++; renderOnboardingTourStep(); }
            else goOnboardingStep('awards');
        }
        function onboardingTourPrev() {
            if (onboardingTourIndex > 0) { onboardingTourIndex--; renderOnboardingTourStep(); }
        }
        function renderOnboardingTourDemo(index) {
            const reduced = isReducedMotion();
            if (index === 1) return renderTourDemoEnroll(reduced);
            if (index === 2) return renderTourDemoSchedule(reduced);
            if (index === 3) return renderTourDemoConclude(reduced);
            return '';
        }
        function renderTourDemoEnroll(reduced) {
            const badge = reduced
                ? `<span style="display:flex;align-items:center;justify-content:center;height:100%;border-radius:99px;background:var(--stk-tint);color:#fff;font-size:10.5px;font-weight:800"><i class="fas fa-check" style="margin-right:5px;font-size:9px"></i>Inscrita</span>`
                : `<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:99px;background:var(--stk-soft-available);color:var(--stk-ink-available);font-size:10.5px;font-weight:800;animation:demoA 4.5s ease infinite">Inscribir</span>
                   <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:99px;background:var(--stk-tint);color:#fff;font-size:10.5px;font-weight:800;animation:demoB 4.5s ease infinite"><i class="fas fa-check" style="margin-right:5px;font-size:9px"></i>Inscrita</span>
                   <span style="position:absolute;top:-4px;right:14px;width:34px;height:34px;border-radius:50%;background:var(--stk-tint);opacity:0;animation:demoTap 4.5s ease infinite"></span>`;
            return `<div class="stk-surface-card" style="padding:14px 16px">
                    <div style="display:flex;align-items:center;gap:12px">
                        <span style="width:36px;height:36px;border-radius:50%;background:var(--stk-soft-available);color:var(--stk-ink-available);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px"><i class="fas fa-atom"></i></span>
                        <span style="flex:1;min-width:0">
                            <span style="display:block;font-size:13px;font-weight:700;color:var(--stk-text-1)">Física General</span>
                            <span style="display:block;font-size:10.5px;color:var(--stk-text-2)">FGF-201 · 4 créditos</span>
                        </span>
                        <span style="position:relative;width:86px;height:28px;flex-shrink:0">${badge}</span>
                    </div>
                </div>
                <div style="text-align:center;font-size:11px;color:var(--stk-text-2);margin-top:8px"><i class="fas fa-circle-play" style="margin-right:5px;color:var(--stk-tint)"></i>Toca "Inscribir" y la materia entra a tu período</div>`;
        }
        function renderTourDemoSchedule(reduced) {
            const badge = reduced
                ? `<span style="display:flex;align-items:center;justify-content:center;height:100%;border-radius:99px;background:var(--stk-accent-approved);color:#fff;font-size:10px;font-weight:800">Mar · 6–8 PM</span>`
                : `<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:99px;background:var(--stk-tint);color:#fff;font-size:10px;font-weight:800;animation:demoA 4.5s ease infinite"><i class="fas fa-plus" style="margin-right:4px;font-size:8px"></i>Agregar horario</span>
                   <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:99px;background:var(--stk-accent-approved);color:#fff;font-size:10px;font-weight:800;animation:demoB 4.5s ease infinite">Mar · 6–8 PM</span>
                   <span style="position:absolute;top:-4px;right:26px;width:34px;height:34px;border-radius:50%;background:var(--stk-tint);opacity:0;animation:demoTap 4.5s ease infinite"></span>`;
            const tueCell = reduced
                ? `<div style="background:var(--stk-tint);border-radius:6px;height:22px"></div>`
                : `<div style="position:relative;background:var(--stk-surface-2);border-radius:6px;height:22px;overflow:hidden"><span style="position:absolute;inset:0;background:var(--stk-tint);border-radius:6px;animation:demoB 4.5s ease infinite"></span></div>`;
            return `<div class="stk-surface-card" style="padding:14px 16px;display:flex;flex-direction:column;gap:12px">
                    <div style="display:flex;align-items:center;gap:12px">
                        <span style="width:36px;height:36px;border-radius:50%;background:var(--stk-tint-soft);color:var(--stk-tint);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px"><i class="fas fa-code"></i></span>
                        <span style="flex:1;min-width:0">
                            <span style="display:block;font-size:13px;font-weight:700;color:var(--stk-text-1)">Programación II</span>
                            <span style="display:block;font-size:10.5px;color:var(--stk-text-2)">FGI-105</span>
                        </span>
                        <span style="position:relative;width:104px;height:28px;flex-shrink:0">${badge}</span>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px">
                        <div style="text-align:center;font-size:9px;font-weight:800;color:var(--stk-text-2)">L</div>
                        <div style="text-align:center;font-size:9px;font-weight:800;color:var(--stk-text-2)">M</div>
                        <div style="text-align:center;font-size:9px;font-weight:800;color:var(--stk-text-2)">X</div>
                        <div style="text-align:center;font-size:9px;font-weight:800;color:var(--stk-text-2)">J</div>
                        <div style="text-align:center;font-size:9px;font-weight:800;color:var(--stk-text-2)">V</div>
                        <div style="background:var(--stk-surface-2);border-radius:6px;height:22px"></div>
                        ${tueCell}
                        <div style="background:var(--stk-surface-2);border-radius:6px;height:22px"></div>
                        <div style="background:var(--stk-surface-2);border-radius:6px;height:22px"></div>
                        <div style="background:var(--stk-surface-2);border-radius:6px;height:22px"></div>
                    </div>
                </div>
                <div style="text-align:center;font-size:11px;color:var(--stk-text-2);margin-top:8px"><i class="fas fa-circle-play" style="margin-right:5px;color:var(--stk-tint)"></i>El bloque aparece en tu semana al instante</div>`;
        }
        function renderTourDemoConclude(reduced) {
            if (reduced) {
                return `<div class="stk-surface-card" style="padding:14px 16px">
                        <div style="display:flex;align-items:center;gap:10px">
                            <span style="width:36px;height:36px;border-radius:50%;background:var(--stk-soft-approved);color:var(--stk-ink-approved);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px"><i class="fas fa-check"></i></span>
                            <span style="flex:1;min-width:0">
                                <span style="display:block;font-size:13px;font-weight:700;color:var(--stk-text-1)">Análisis Mat. II</span>
                                <span style="display:block;font-size:10px;color:var(--stk-ink-approved);font-weight:700">Aprobada</span>
                            </span>
                            <span style="padding:6px 12px;border-radius:99px;background:var(--stk-soft-approved);color:var(--stk-ink-approved);font-size:11px;font-weight:800;font-family:var(--stk-font-numeric)">Nota 92</span>
                        </div>
                    </div>
                    <div style="text-align:center;font-size:11px;color:var(--stk-text-2);margin-top:8px"><i class="fas fa-circle-play" style="margin-right:5px;color:var(--stk-tint)"></i>Concluye con nota si aprobaste, o retírala si no</div>`;
            }
            return `<div class="stk-surface-card" style="padding:14px 16px">
                    <div style="position:relative;height:44px">
                        <div style="position:absolute;inset:0;display:flex;align-items:center;gap:10px;animation:demoP1 7s ease infinite">
                            <span style="width:36px;height:36px;border-radius:50%;background:var(--stk-tint-soft);color:var(--stk-tint);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px"><i class="fas fa-square-root-variable"></i></span>
                            <span style="flex:1;min-width:0">
                                <span style="display:block;font-size:13px;font-weight:700;color:var(--stk-text-1)">Análisis Mat. II</span>
                                <span style="display:block;font-size:10px;color:var(--stk-text-2)">En curso</span>
                            </span>
                            <span style="padding:6px 11px;border-radius:99px;background:var(--stk-accent-approved);color:#fff;font-size:10px;font-weight:800">Concluir</span>
                            <span style="padding:6px 11px;border-radius:99px;border:1.5px solid var(--stk-accent-goal);color:var(--stk-accent-goal);font-size:10px;font-weight:800">Retirar</span>
                        </div>
                        <div style="position:absolute;inset:0;display:flex;align-items:center;gap:10px;opacity:0;animation:demoP2 7s ease infinite">
                            <span style="width:36px;height:36px;border-radius:50%;background:var(--stk-soft-approved);color:var(--stk-ink-approved);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px"><i class="fas fa-check"></i></span>
                            <span style="flex:1;min-width:0">
                                <span style="display:block;font-size:13px;font-weight:700;color:var(--stk-text-1)">Análisis Mat. II</span>
                                <span style="display:block;font-size:10px;color:var(--stk-ink-approved);font-weight:700">Aprobada</span>
                            </span>
                            <span style="padding:6px 12px;border-radius:99px;background:var(--stk-soft-approved);color:var(--stk-ink-approved);font-size:11px;font-weight:800;font-family:var(--stk-font-numeric)">Nota 92</span>
                        </div>
                        <div style="position:absolute;inset:0;display:flex;align-items:center;gap:10px;opacity:0;animation:demoP3 7s ease infinite">
                            <span style="width:36px;height:36px;border-radius:50%;background:var(--stk-surface-2);color:var(--stk-text-2);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px"><i class="fas fa-rotate-left"></i></span>
                            <span style="flex:1;min-width:0">
                                <span style="display:block;font-size:13px;font-weight:700;color:var(--stk-text-2);text-decoration:line-through">Análisis Mat. II</span>
                                <span style="display:block;font-size:10px;color:var(--stk-text-2)">Vuelve a materias disponibles</span>
                            </span>
                            <span style="padding:6px 12px;border-radius:99px;background:var(--stk-surface-2);color:var(--stk-text-2);font-size:10px;font-weight:800">Retirada</span>
                        </div>
                        <span style="position:absolute;top:2px;right:74px;width:34px;height:34px;border-radius:50%;background:var(--stk-accent-approved);opacity:0;animation:demoTap 7s ease infinite"></span>
                        <span style="position:absolute;top:2px;right:8px;width:34px;height:34px;border-radius:50%;background:var(--stk-accent-goal);opacity:0;animation:demoTapB 7s ease infinite"></span>
                    </div>
                </div>
                <div style="text-align:center;font-size:11px;color:var(--stk-text-2);margin-top:8px"><i class="fas fa-circle-play" style="margin-right:5px;color:var(--stk-tint)"></i>Concluye con nota si aprobaste, o retírala si no</div>`;
        }

        // ---- Awards step ----
        function renderOnboardingAwardsStep() {
            const list = document.getElementById('ob-awards-list');
            if (!list) return;
            const achieved = (currentCurriculum && window.StudyTrackMilestones)
                ? StudyTrackMilestones.evaluateMilestones(buildMilestoneStats())
                : [];
            const cards = achieved.length
                ? achieved.slice(-3).map((d) => ({ icon: d.icon, title: d.label, desc: 'Logro desbloqueado' }))
                : [
                    { icon: 'fa-graduation-cap', title: 'Aprendiste a usar MiRuta', desc: 'Completaste la guía de pantallas' },
                    {
                        icon: 'fa-star',
                        title: onboardingHasHistory ? 'Primeras notas registradas' : 'Ruta desde cero',
                        desc: onboardingHasHistory ? 'Registraste tus períodos cursados' : 'Configuraste tu carrera desde la primera parada'
                    },
                    { icon: 'fa-route', title: 'Ruta configurada', desc: `Tu camino a ${currentCurriculum?.metadata?.career_name || 'tu carrera'} está listo` }
                ];
            list.innerHTML = cards.map((c) => `<div class="ob-award-card stk-surface-card" style="padding:13px 16px;display:flex;align-items:center;gap:12px">
                    <span style="width:38px;height:38px;border-radius:50%;background:var(--stk-tint-soft);color:var(--stk-tint);display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas ${escapeHtml(c.icon)}" style="font-size:15px"></i></span>
                    <span style="flex:1;min-width:0">
                        <span style="display:block;font-size:13.5px;font-weight:800;color:var(--stk-text-1)">${escapeHtml(c.title)}</span>
                        <span style="display:block;font-size:11px;color:var(--stk-text-2)">${escapeHtml(c.desc)}</span>
                    </span>
                    <i class="fas fa-check-circle" style="color:var(--stk-accent-approved);font-size:16px"></i>
                </div>`).join('');
        }
        function completeOnboarding() {
            StudyTrackStorage.setBoolean(StudyTrackStorage.KEYS.onboarded, true);
            hideWelcomeScreen();
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
        function renderUI() { document.getElementById('header-career').textContent = currentCurriculum.metadata.career_name; document.getElementById('header-institution').textContent = currentCurriculum.metadata.institution; renderPeriods(); }
        // Spanish month abbreviations for the "Concluida {mes} {año}" completed-row
        // subtitle. The app only stores completion dates at month granularity
        // (input type="month"), so we never invent a day-of-month here.
        const MONTH_ABBR_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        function formatCompletionLabel(completionDate) {
            if (!completionDate) return null;
            const [year, month] = String(completionDate).split('-');
            const monthIndex = Number.parseInt(month, 10) - 1;
            if (!year || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) return null;
            return `Concluida ${MONTH_ABBR_ES[monthIndex]} ${year}`;
        }
        // Groups the subject's schedule blocks that share the same time range into
        // one "Mar y Jue · 6–8 PM"-style summary line (the common recurring-class
        // case). Any remaining blocks on a different time are folded into a "+N".
        function formatScheduleSummary(subjectId) {
            const blocks = [...(scheduleData[subjectId] || [])].sort((a, b) => StudyTrackSchedule.DAYS.indexOf(a.day) - StudyTrackSchedule.DAYS.indexOf(b.day));
            if (!blocks.length) return null;
            const first = blocks[0];
            const sameTimeBlocks = blocks.filter((block) => block.startTime === first.startTime && block.endTime === first.endTime);
            const dayLabels = sameTimeBlocks.map((block) => StudyTrackSchedule.DAY_NAMES[block.day]);
            const daysText = dayLabels.length > 1
                ? `${dayLabels.slice(0, -1).join(', ')} y ${dayLabels[dayLabels.length - 1]}`
                : dayLabels[0];
            const timeText = `${formatTime12h(first.startTime)}–${formatTime12h(first.endTime)}`;
            const extraCount = blocks.length - sameTimeBlocks.length;
            return `${daysText} · ${timeText}${extraCount > 0 ? ` +${extraCount}` : ''}`;
        }
        // Turns curriculum + progress state into the plain-data shape src/cards.js
        // expects (see StudyTrackCards' SubjectCardData jsdoc). No DOM reads here.
        function buildSubjectCardData(s) {
            const st = userProgress[s.id] || { status: 'pending', grade: null, attempts: [], completionDate: null, section: '', classroom: '', teacher: '' };
            const un = checkPrerequisites(s.prerequisites);
            const reqTxt = formatPrerequisiteString(s.prerequisites);
            const isApprovedWithoutGrade = st.status === 'approved' && (st.grade === null || st.grade === undefined || st.grade === '');
            const isSkippedPrereq = Boolean(st.status === 'approved' && !un && s.prerequisites?.length);
            const isDisabled = !un && st.status !== 'approved' && !APP_CONFIG.allowSkipPrerequisites;

            const state = st.status === 'approved'
                ? ((isApprovedWithoutGrade || isSkippedPrereq) ? 'warning' : 'approved')
                : st.status === 'enrolled' ? 'enrolled'
                    : un ? 'available' : 'locked';

            return {
                id: s.id,
                name: s.name,
                code: s.code,
                credits: s.credits,
                state,
                grade: st.grade,
                scheduleSummary: state === 'enrolled' ? formatScheduleSummary(s.id) : null,
                completionLabel: (state === 'approved' || state === 'warning') ? formatCompletionLabel(st.completionDate) : null,
                prerequisiteLabel: reqTxt,
                missingGrade: isApprovedWithoutGrade,
                skippedPrerequisite: isSkippedPrereq,
                disabled: isDisabled,
                attempts: st.attempts?.length || 0,
                section: st.section || '',
                classroom: st.classroom || '',
                teacher: st.teacher || '',
                completionRaw: st.completionDate || ''
            };
        }
        function renderSubjectCardString(s) {
            return StudyTrackCards.renderSubjectCard(buildSubjectCardData(s), { escapeHtml, actionArgs });
        }
        // Builds the plain-data shape StudyTrackCards.renderPeriodHeaderCard expects.
        function buildPeriodHeaderData(p) {
            const periodProgress = StudyTrackInsights.getPeriodProgress(currentCurriculum, userProgress, p.period_number);
            const completed = periodProgress.total > 0 && periodProgress.completed === periodProgress.total;
            const average = calculatePeriodAverage(p);
            const enrolledCount = p.subjects.filter((subject) => userProgress[subject.id]?.status === 'enrolled').length;
            return {
                periodNumber: p.period_number,
                periodName: p.name,
                completed,
                subjectCount: p.subjects.length,
                totalCredits: p.subjects.reduce((sum, subject) => sum + (Number(subject.credits) || 0), 0),
                progressPercent: Math.round(periodProgress.completionRatio * 100),
                average: average ? Math.round(Number.parseFloat(average)) : null,
                enrolledCount
            };
        }
        function renderPeriodHeaderHTML(p) {
            return StudyTrackCards.renderPeriodHeaderCard(buildPeriodHeaderData(p), { escapeHtml });
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
            recomputeMilestones();
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

        // Gentle "remember your why" + latest achievement on the Home greeting card.
        function renderHomeMotivation() {
            const el = document.getElementById('home-motivation');
            if (!el) return;
            const goal = getStudentGoal();
            const latest = getLatestMilestone();
            el.innerHTML = '';
            if (!goal && !latest) { el.classList.add('hidden'); return; }
            el.classList.remove('hidden');
            if (goal) {
                const row = document.createElement('div');
                row.className = 'flex items-start gap-2';
                const ic = document.createElement('i'); ic.className = 'fas fa-bullseye text-xs mt-0.5'; ic.style.color = 'var(--stk-tint)';
                const tx = document.createElement('span'); tx.className = 'text-xs font-semibold'; tx.style.color = 'var(--stk-text-1)'; tx.textContent = goal;
                row.append(ic, tx); el.appendChild(row);
            }
            if (latest) {
                const row = document.createElement('div');
                row.className = 'flex items-center gap-2';
                const ic = document.createElement('i'); ic.className = 'fas ' + latest.icon + ' text-xs'; ic.style.color = 'var(--stk-ink-approved)';
                const tx = document.createElement('span'); tx.className = 'text-[11px] font-semibold'; tx.style.color = 'var(--stk-text-1)'; tx.textContent = 'Último logro: ' + latest.label;
                row.append(ic, tx); el.appendChild(row);
            }
        }
        // ── Home route map (MiRuta "Ruta" screen) ──────────────────────────
        // Turns the loaded curriculum + progress into an abstract "stops" model:
        // one grouped stop for finished periods, one stop for the current period,
        // up to two upcoming stops, and a final goal stop. Works for any period
        // count and for brand-new users (current = first period, no completed stop).
        function formatPeriodShortLabel(periodNumber) {
            return `P${periodNumber}`;
        }

        function buildCompletedGroupLabel(periodStates) {
            if (!periodStates.length) return '';
            if (periodStates.length <= 4) {
                return periodStates.map((state) => formatPeriodShortLabel(state.period.period_number)).join(' · ');
            }
            const first = periodStates[0].period.period_number;
            const last = periodStates[periodStates.length - 1].period.period_number;
            return `P${first}–P${last}`;
        }

        function buildRouteModel(curriculum, progress) {
            const periods = curriculum?.periods || [];
            const periodStates = periods.map((period) => {
                const stats = StudyTrackInsights.getPeriodProgress(curriculum, progress, period.period_number);
                return { period, completed: stats.total > 0 && stats.completed === stats.total };
            });

            const firstIncompleteIndex = periodStates.findIndex((state) => !state.completed);
            const allCompleted = periodStates.length > 0 && firstIncompleteIndex === -1;
            const currentIndex = allCompleted ? periodStates.length : firstIncompleteIndex;

            const completedStates = periodStates.slice(0, currentIndex);
            const currentState = allCompleted ? null : periodStates[currentIndex];
            const futureStates = allCompleted ? [] : periodStates.slice(currentIndex + 1, currentIndex + 3);

            const stops = [];
            if (completedStates.length) {
                stops.push({ type: 'completed', label: buildCompletedGroupLabel(completedStates) });
            }
            if (currentState) {
                stops.push({ type: 'current', label: `Estás aquí · ${formatPeriodShortLabel(currentState.period.period_number)}`, period: currentState.period });
            }
            futureStates.forEach((state) => {
                stops.push({ type: 'future', label: formatPeriodShortLabel(state.period.period_number), period: state.period });
            });
            stops.push({
                type: 'goal',
                label: `Meta · ${curriculum?.metadata?.career_name || 'tu carrera'}`,
                reached: allCompleted
            });

            const foundCurrentStopIndex = stops.findIndex((stop) => stop.type === 'current');
            const currentStopIndex = Math.max(0, foundCurrentStopIndex);
            const traveledIndex = allCompleted ? stops.length - 1 : currentStopIndex;
            const remainingPeriods = allCompleted ? 0 : periodStates.length - currentIndex;

            return { stops, currentStopIndex, traveledIndex, currentState, allCompleted, remainingPeriods };
        }

        // Lays out N stops as a vertical zig-zag inside a fixed-width viewBox; the
        // container's aspect-ratio matches the viewBox so percentage positions and
        // the SVG stay in sync at any screen size.
        function computeRouteLayout(stopCount) {
            const width = 353;
            const stepY = 150;
            const topPad = 55;
            const bottomPad = 65;
            const xLeft = 70;
            const xRight = 283;
            const height = topPad + stepY * Math.max(0, stopCount - 1) + bottomPad;
            const points = [];
            for (let i = 0; i < stopCount; i++) {
                points.push({ x: i % 2 === 0 ? xLeft : xRight, y: topPad + stepY * i });
            }
            return { width, height, points };
        }

        function buildSmoothPathD(points) {
            if (!points.length) return '';
            let d = `M ${points[0].x} ${points[0].y}`;
            for (let i = 1; i < points.length; i++) {
                const prev = points[i - 1];
                const next = points[i];
                const midY = (prev.y + next.y) / 2;
                d += ` C ${prev.x} ${midY}, ${next.x} ${midY}, ${next.x} ${next.y}`;
            }
            return d;
        }

        function routeNodeInk(stopType) {
            if (stopType === 'completed') return 'var(--stk-ink-approved)';
            if (stopType === 'current') return 'var(--stk-tint)';
            if (stopType === 'goal') return 'var(--stk-ink-goal)';
            return 'var(--stk-text-2)';
        }

        function buildRouteNode(stop) {
            const node = document.createElement('div');
            if (stop.type === 'completed') {
                node.className = 'stk-route-node stk-route-node--completed';
                const icon = document.createElement('i');
                icon.className = 'fas fa-check';
                node.appendChild(icon);
            } else if (stop.type === 'current') {
                node.className = 'stk-route-node stk-route-node--current';
                const icon = document.createElement('i');
                icon.className = 'fas fa-location-arrow';
                node.appendChild(icon);
                const pulse = document.createElement('span');
                pulse.className = 'stk-route-pulse';
                node.appendChild(pulse);
            } else if (stop.type === 'future') {
                node.className = 'stk-route-node stk-route-node--future';
                node.textContent = stop.label;
            } else {
                node.className = 'stk-route-node stk-route-node--goal';
                const icon = document.createElement('i');
                icon.className = 'fas fa-map-pin';
                node.appendChild(icon);
            }
            return node;
        }

        function renderHomeRouteMap(routeModel) {
            const mapEl = document.getElementById('home-route-map');
            const svgEl = document.getElementById('home-route-svg');
            const stopsEl = document.getElementById('home-route-stops');
            if (!mapEl || !svgEl || !stopsEl) return;

            const { stops, traveledIndex } = routeModel;
            const { width, height, points } = computeRouteLayout(stops.length);
            mapEl.style.aspectRatio = `${width} / ${height}`;
            svgEl.setAttribute('viewBox', `0 0 ${width} ${height}`);
            svgEl.replaceChildren();

            const svgNs = 'http://www.w3.org/2000/svg';
            const fullPathD = buildSmoothPathD(points);
            const traveledPoints = points.slice(0, traveledIndex + 1);
            const traveledPathD = traveledPoints.length > 1 ? buildSmoothPathD(traveledPoints) : '';

            const bgPath = document.createElementNS(svgNs, 'path');
            bgPath.setAttribute('d', fullPathD);
            bgPath.setAttribute('fill', 'none');
            bgPath.setAttribute('stroke', 'var(--stk-surface-2)');
            bgPath.setAttribute('stroke-width', '30');
            bgPath.setAttribute('stroke-linecap', 'round');
            svgEl.appendChild(bgPath);

            if (traveledPathD) {
                const fgPath = document.createElementNS(svgNs, 'path');
                fgPath.setAttribute('d', traveledPathD);
                fgPath.setAttribute('fill', 'none');
                fgPath.setAttribute('stroke', 'var(--stk-tint)');
                fgPath.setAttribute('stroke-width', '30');
                fgPath.setAttribute('stroke-linecap', 'round');
                svgEl.appendChild(fgPath);
            }

            const dashPath = document.createElementNS(svgNs, 'path');
            dashPath.setAttribute('d', fullPathD);
            dashPath.setAttribute('fill', 'none');
            dashPath.setAttribute('stroke', '#ffffff');
            dashPath.setAttribute('stroke-width', '2.5');
            dashPath.setAttribute('stroke-dasharray', '1 13');
            dashPath.setAttribute('stroke-linecap', 'round');
            dashPath.setAttribute('opacity', '0.8');
            svgEl.appendChild(dashPath);

            stopsEl.replaceChildren();
            stops.forEach((stop, index) => {
                const point = points[index];
                const stopEl = document.createElement('div');
                stopEl.className = 'stk-route-stop';
                stopEl.style.left = `${(point.x / width) * 100}%`;
                stopEl.style.top = `${(point.y / height) * 100}%`;
                stopEl.appendChild(buildRouteNode(stop));
                if (stop.type !== 'future') {
                    const labelEl = document.createElement('span');
                    labelEl.className = 'stk-route-label';
                    labelEl.style.color = routeNodeInk(stop.type);
                    labelEl.textContent = stop.label;
                    stopEl.appendChild(labelEl);
                }
                stopsEl.appendChild(stopEl);
            });

            positionRouteCards(routeModel, { width, height, points });
        }

        // Floating cards are anchored to real stop coordinates (not fixed corners)
        // so they never sit on top of a node regardless of how many stops the
        // route has: EN CURSO tracks the current stop, FALTA sits in the gap
        // right before the goal pin (nodes are 150 viewBox units apart, cards
        // are ~76 units tall, so the midpoint is always clear).
        function positionRouteCards(routeModel, layout) {
            const encursoCard = document.getElementById('home-encurso-card');
            const faltaCard = document.getElementById('home-falta-card');
            if (!encursoCard || !faltaCard) return;
            const { width, height, points } = layout;

            function placeCard(card, xUnits, yUnits) {
                const leftPct = (xUnits / width) * 100;
                const topPct = Math.max(2, Math.min(92, (yUnits / height) * 100));
                if (leftPct < 50) {
                    card.style.left = '4%';
                    card.style.right = 'auto';
                } else {
                    card.style.right = '4%';
                    card.style.left = 'auto';
                }
                card.style.top = `${topPct}%`;
                card.style.bottom = 'auto';
            }

            const anchorIndex = routeModel.allCompleted ? 0 : routeModel.currentStopIndex;
            const anchorPoint = points[anchorIndex] || points[0];
            placeCard(encursoCard, width - anchorPoint.x, Math.max(0, anchorPoint.y - 55));

            const goalIndex = points.length - 1;
            const goalPoint = points[goalIndex];
            const beforeGoalPoint = points[Math.max(0, goalIndex - 1)];
            const faltaY = (beforeGoalPoint.y + goalPoint.y) / 2;
            placeCard(faltaCard, width - goalPoint.x, faltaY);
        }

        function renderHomeEncursoList(enrolledSubjects) {
            const maxShown = 3;
            const shown = enrolledSubjects.slice(0, maxShown);
            const overflow = enrolledSubjects.length - shown.length;
            let html = shown.map((subject) => `<div class="text-[12px] font-bold leading-snug truncate" style="color:var(--stk-text-1)">${escapeHtml(subject.name || 'Materia')}</div>`).join('');
            if (overflow > 0) html += `<div class="text-[11px] font-bold mt-0.5" style="color:var(--stk-text-2)">+${overflow} más</div>`;
            return html;
        }

        function renderHomeView(summary = null) {
            renderHomeMotivation();
            if (!currentCurriculum || !document.getElementById('home-view')) return;
            const academic = summary || StudyTrackAcademics.calculateAcademicSummary(currentCurriculum, userProgress, { getGradePoints, getGradeLabel });
            const insights = StudyTrackInsights.buildHomeInsights({
                curriculum: currentCurriculum,
                progress: userProgress,
                dependencyGraph,
                scheduleData,
                canTakeSubject: (subject) => checkPrerequisites(subject.prerequisites)
            });
            const routeModel = buildRouteModel(currentCurriculum, userProgress);

            const roundedProgress = Math.round(academic.progress);
            const studentName = getStudentName();
            document.getElementById('home-greeting').textContent = studentName ? `Tu ruta, ${studentName}` : 'Tu ruta';
            const nextStopText = routeModel.allCompleted
                ? '¡Completaste tu plan!'
                : `próxima parada: ${routeModel.currentState?.period?.name || formatPeriodShortLabel(routeModel.currentState?.period?.period_number)}`;
            document.getElementById('home-context').textContent = `${roundedProgress}% recorrido · ${nextStopText}`;

            document.getElementById('home-stat-approved').textContent = academic.completed;
            document.getElementById('home-stat-index').textContent = academic.hasGrades ? academic.globalAvg.toFixed(1) : 'N/A';
            document.getElementById('home-stat-credits').textContent = academic.earned;

            renderHomeRouteMap(routeModel);

            const encursoListEl = document.getElementById('home-encurso-list');
            const encursoEmptyEl = document.getElementById('home-encurso-empty');
            if (insights.enrolled.length) {
                encursoListEl.innerHTML = renderHomeEncursoList(insights.enrolled);
                encursoListEl.classList.remove('hidden');
                encursoEmptyEl.classList.add('hidden');
            } else {
                encursoListEl.innerHTML = '';
                encursoListEl.classList.add('hidden');
                encursoEmptyEl.classList.remove('hidden');
            }
            const currentPeriodNumber = routeModel.currentState?.period?.period_number;
            const termProgress = currentPeriodNumber !== undefined
                ? StudyTrackInsights.getPeriodProgress(currentCurriculum, userProgress, currentPeriodNumber).completionRatio * 100
                : (routeModel.allCompleted ? 100 : 0);
            document.getElementById('home-encurso-progress-bar').style.width = `${Math.round(termProgress)}%`;

            document.getElementById('home-falta-count').textContent = academic.remaining;
            document.getElementById('home-falta-detail').textContent = `materias · ${formatCountLabel(routeModel.remainingPeriods, 'período', 'períodos')}`;

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
        function reRenderSubjectCardDOM(s) { const el = document.getElementById(`subject-card-${s.id}`); if (el) el.outerHTML = renderSubjectCardString(s); }

        // Patches a single period header in place (called after a subject inside it
        // changes) instead of re-rendering the whole periods list.
        function updatePeriodHeaderDOM(i) {
            const el = document.getElementById(`period-header-content-${i}`);
            if (!el) return;
            el.innerHTML = renderPeriodHeaderHTML(currentCurriculum.periods[i]);
        }
        function togglePeriod(i) {
            const willOpen = APP_CONFIG.collapsedPeriods.has(i);
            if (willOpen) APP_CONFIG.collapsedPeriods.delete(i); else APP_CONFIG.collapsedPeriods.add(i);
            StudyTrackStorage.setJson(StudyTrackStorage.KEYS.collapsedPeriods, [...APP_CONFIG.collapsedPeriods]);
            const textFilter = document.getElementById('search-input').value;
            const headerContent = document.getElementById(`period-header-content-${i}`);
            const content = headerContent ? headerContent.parentElement.nextElementSibling : null;
            // Toggle the live DOM so the collapse transition and the focus-in
            // entrance can actually play; active filters force periods open, so
            // in that case fall back to the full re-render (previous behavior).
            if (!textFilter && currentFilter === 'all' && content && content.classList.contains('collapsible-content')) {
                content.classList.toggle('open', willOpen);
                const chev = headerContent.parentElement.querySelector('.stk-chev');
                if (chev) chev.style.transform = willOpen ? 'rotate(180deg)' : '';
                if (willOpen) staggerCardsIn(content.querySelectorAll('.stk-subject-card'));
            } else {
                renderPeriods(textFilter);
            }
            updateToggleAllButton();
        }

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
                div.className = 'space-y-2 sm:space-y-3 animate-fade-in';
                div.innerHTML = StudyTrackPeriods.renderPeriodCardHTML({
                    periodIndex: idx,
                    periodNumber: p.period_number,
                    headerHtml: renderPeriodHeaderHTML(p),
                    visibleSubjects: subs,
                    open: StudyTrackPeriods.isPeriodOpen(idx, APP_CONFIG.collapsedPeriods, filter, currentFilter),
                    escapeHtml,
                    actionArgs,
                    renderSubject: renderSubjectCardString
                });
                c.appendChild(div);
            });
        }
        function staggerCardsIn(cards) {
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            if (!cards.length) return;
            cards.forEach(card => card.classList.remove('stk-anim-in'));
            void document.body.offsetWidth; // single reflow to allow re-trigger
            cards.forEach((card, i) => {
                card.style.animationDelay = Math.min(i, 12) * 45 + 'ms';
                card.classList.add('stk-anim-in');
                card.addEventListener('animationend', () => {
                    card.classList.remove('stk-anim-in');
                    card.style.animationDelay = '';
                }, { once: true });
            });
        }
        function animateSubjectEntrance() {
            staggerCardsIn(document.querySelectorAll('#subjects-view .stk-period-card, #subjects-view .stk-subject-card'));
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

        function getCurrentViewNavId() { return currentView === 'schedule' ? 'nav-schedule' : currentView === 'subjects' ? 'nav-subjects' : currentView === 'profile' ? 'nav-progress' : 'nav-home'; }
        function setActiveMobileNav(activeId) {
            document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.toggle('active', btn.id === activeId));
            const sideId = activeId.replace('nav-', 'side-');
            document.querySelectorAll('.side-tab').forEach(btn => btn.classList.toggle('active', btn.id === sideId));
        }
        function openSettings() { renderGradeScaleSettings(); renderSettingsRequirements(); updateSkipPrereqsToggle(); document.getElementById('enrollment-limit-input').value = APP_CONFIG.maxEnrolledSubjects; document.getElementById('passing-grade-input').value = APP_CONFIG.passingGrade; const nameInput = document.getElementById('student-name-input'); if (nameInput) nameInput.value = getStudentName(); document.getElementById('settings-modal').classList.remove('hidden'); }
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
        function showToast(msg, type = 'info') { const t = document.createElement('div'); const s = { success: 'background:var(--stk-surface);color:var(--stk-ink-approved);border-left:4px solid var(--stk-accent-approved);box-shadow:var(--stk-shadow-hover)', error: 'background:var(--stk-surface);color:var(--stk-ink-goal);border-left:4px solid var(--stk-accent-goal);box-shadow:var(--stk-shadow-hover)', info: 'background:var(--stk-navy);color:#fff;box-shadow:var(--stk-shadow-hover)' }; t.className = 'px-4 py-3 rounded-lg fixed top-20 right-4 z-[120] animate-slide-up font-medium text-sm'; t.style.cssText = s[type] || s.info; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3000); }
        function calculatePeriodAverage(p) { return StudyTrackAcademics.calculatePeriodAverage(p, userProgress); }

        function calculatePeriodGPA4(p) { return StudyTrackAcademics.calculatePeriodGPA4(p, userProgress, getGradePoints); }

        function toggleCustomJson() { document.getElementById('custom-json-area').classList.toggle('hidden'); }
        function loadCustomJSON() { try { const d = JSON.parse(document.getElementById('custom-json-input').value); const validation = StudyTrackCurriculum.validateCurriculum(d); if (!validation.valid) throw new Error(validation.errors[0]); if (confirm('¿Cargar?')) { currentCurriculum = d; userProgress = {}; saveCurriculum(); saveUserProgress(); dependencyGraph = buildDependencyGraph(currentCurriculum); renderUI(); calculateStatistics(); renderRequirementsWidget(); closeSettings(); showToast('Cargado', 'success'); } } catch (e) { showToast('Error en JSON: ' + (e.message || 'formato invalido'), 'error'); } }
        function exportProgress() { const b = new Blob([JSON.stringify({ curriculum: currentCurriculum, progress: userProgress }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'backup.json'; a.click(); }

        // ── NFC Student Card (Carné por NFC) ───────────────────────────────
        // Adapter layer between the browser (NDEFReader, Date, DOM) and the pure
        // StudyTrackNfc model. The pure module owns the card shape; these handlers
        // own everything impure: feature detection, runtime timestamps, NFC I/O,
        // and DOM rendering. They are top-level declarations so the CSP-safe
        // delegated dispatcher can resolve them via window[name].
        function nfcSupported() { return typeof window !== 'undefined' && 'NDEFReader' in window; }

        function getStudentName() { return StudyTrackStorage.getItem(StudyTrackStorage.KEYS.studentName) || ''; }

        function setStudentName(value) { StudyTrackStorage.setItem(StudyTrackStorage.KEYS.studentName, String(value || '')); notifySyncChange(); }

        function getStudentPhoto() { return StudyTrackStorage.getItem(StudyTrackStorage.KEYS.studentPhoto) || ''; }
        // Returns the storage success boolean so callers can detect a quota rejection
        // (a photo is the only profile field big enough to ever hit the localStorage limit).
        function setStudentPhoto(value) { const ok = StudyTrackStorage.setItem(StudyTrackStorage.KEYS.studentPhoto, String(value || '')); if (ok) notifySyncChange(); return ok; }
        function getStudentId() { return StudyTrackStorage.getItem(StudyTrackStorage.KEYS.studentId) || ''; }
        function setStudentId(value) { StudyTrackStorage.setItem(StudyTrackStorage.KEYS.studentId, String(value || '')); notifySyncChange(); }
        function getStudentGoal() { return StudyTrackStorage.getItem(StudyTrackStorage.KEYS.studentGoal) || ''; }
        function setStudentGoal(value) { StudyTrackStorage.setItem(StudyTrackStorage.KEYS.studentGoal, String(value || '')); notifySyncChange(); }
        function getStudentStatus() { return StudyTrackStorage.getItem(StudyTrackStorage.KEYS.studentStatus) || ''; }
        function setStudentStatus(value) { StudyTrackStorage.setItem(StudyTrackStorage.KEYS.studentStatus, String(value || '')); notifySyncChange(); }

        // Name change also refreshes the avatar initials / heading without a full re-render.
        function updateProfileName(value) { setStudentName(value); refreshProfileIdentity(); }

        function profileInitials(name) {
            const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
            if (!parts.length) return '';
            return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
        }
        function renderProfileAvatar() {
            const el = document.getElementById('profile-avatar');
            const photo = getStudentPhoto();
            if (el) {
                el.innerHTML = '';
                if (photo) {
                    const img = document.createElement('img');
                    img.src = photo; img.alt = 'Foto de perfil';
                    img.className = 'w-full h-full object-cover';
                    el.appendChild(img);
                } else {
                    const initials = profileInitials(getStudentName());
                    if (initials) {
                        const s = document.createElement('span');
                        s.className = 'text-2xl font-black'; s.style.color = 'var(--stk-tint)';
                        s.textContent = initials;
                        el.appendChild(s);
                    } else {
                        const i = document.createElement('i');
                        i.className = 'fas fa-user text-2xl'; i.style.color = 'var(--stk-text-3)';
                        el.appendChild(i);
                    }
                }
                const rm = document.getElementById('profile-photo-remove');
                if (rm) rm.classList.toggle('hidden', !photo);
            }
            renderCarneBandsAvatar(photo);
        }
        // The carné's white-band variant carries its own small avatar tile (decorative,
        // photo-only — no initials fallback, unlike the main profile avatar). Kept in
        // sync from renderProfileAvatar() so every photo add/remove path updates it too.
        function renderCarneBandsAvatar(photo) {
            const el = document.getElementById('carne-bands-avatar');
            if (!el) return;
            el.innerHTML = '';
            if (photo) {
                const img = document.createElement('img');
                img.src = photo; img.alt = 'Foto de perfil';
                el.appendChild(img);
            } else {
                const i = document.createElement('i');
                i.className = 'fas fa-user-graduate';
                el.appendChild(i);
            }
        }
        function refreshProfileIdentity() { renderProfileAvatar(); }

        function pickProfilePhoto() { const i = document.getElementById('profile-photo-input'); if (i) i.click(); }
        function removeProfilePhoto() { setStudentPhoto(''); renderProfileAvatar(); }
        // Cover-crop the decoded source to a 256px square JPEG data URL, persist it,
        // and report failures honestly (quota, unusable image).
        function finishProfilePhoto(source) {
            const w = source.width, h = source.height;
            if (!w || !h) { showToast('Imagen no válida', 'error'); return; }
            const SIZE = 256;
            const canvas = document.createElement('canvas');
            canvas.width = SIZE; canvas.height = SIZE;
            const side = Math.min(w, h);
            canvas.getContext('2d').drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIZE, SIZE);
            if (typeof source.close === 'function') source.close();
            let dataUrl;
            try { dataUrl = canvas.toDataURL('image/jpeg', 0.72); }
            catch { showToast('No se pudo procesar la imagen', 'error'); return; }
            if (!setStudentPhoto(dataUrl)) { showToast('No hay espacio para guardar la foto', 'error'); return; }
            renderProfileAvatar();
            showToast('Foto actualizada', 'success');
        }
        // Fallback decode for browsers without createImageBitmap (no EXIF normalization).
        function loadPhotoViaImage(file) {
            const reader = new FileReader();
            reader.onerror = () => showToast('No se pudo leer la imagen', 'error');
            reader.onload = () => {
                const img = new Image();
                img.onerror = () => showToast('Imagen no válida', 'error');
                img.onload = () => finishProfilePhoto(img);
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        }
        // Compress to a small square JPEG so it fits localStorage and the Firestore 1 MiB
        // document (only one photo is ever kept, replacing the prior).
        function onProfilePhotoSelected(input) {
            const file = input.files && input.files[0];
            input.value = '';
            if (!file) return;
            if (!/^image\//.test(file.type) || file.type === 'image/svg+xml') { showToast('Selecciona una imagen (JPG o PNG)', 'error'); return; }
            if (file.size > 15 * 1024 * 1024) { showToast('La imagen es demasiado grande (máx. 15 MB)', 'error'); return; }
            // createImageBitmap with imageOrientation:'from-image' bakes EXIF rotation so
            // phone portrait photos are not saved sideways; fall back to <img> if missing.
            if (typeof createImageBitmap === 'function') {
                createImageBitmap(file, { imageOrientation: 'from-image' })
                    .then(finishProfilePhoto)
                    .catch(() => loadPhotoViaImage(file));
            } else {
                loadPhotoViaImage(file);
            }
        }

        function showProfile() { switchView('profile'); }

        let milestonesReady = false;
        function buildMilestoneStats() {
            const card = collectStudentCard();
            return { subjectsApproved: card.subjectsApproved, subjectsTotal: card.subjectsTotal, creditsEarned: card.creditsEarned, progress: card.progress, periodsTaken: card.periodsTaken, average: card.average };
        }
        // Re-evaluate achievements after any stats change; stamp newly-earned ones with
        // a date. Celebrate only once the app is ready (so the initial baseline that a
        // returning student already meets is recorded silently, not as a toast flood).
        function recomputeMilestones() {
            if (!currentCurriculum || !window.StudyTrackMilestones) return;
            const achieved = StudyTrackMilestones.evaluateMilestones(buildMilestoneStats());
            const stored = StudyTrackStorage.getJson(StudyTrackStorage.KEYS.milestones, {}) || {};
            const { newlyAchieved } = StudyTrackMilestones.reconcileMilestones(achieved, stored);
            if (newlyAchieved.length) {
                const now = new Date().toISOString();
                newlyAchieved.forEach(id => { stored[id] = now; });
                StudyTrackStorage.setJson(StudyTrackStorage.KEYS.milestones, stored);
                notifySyncChange();
                if (milestonesReady) {
                    const def = StudyTrackMilestones.DEFS.find(d => d.id === newlyAchieved[newlyAchieved.length - 1]);
                    if (def) showToast(`🎉 ¡Logro desbloqueado! ${def.label}`, 'success');
                }
            }
            if (currentView === 'profile') renderMilestones();
        }
        function getLatestMilestone() {
            if (!window.StudyTrackMilestones) return null;
            const stored = StudyTrackStorage.getJson(StudyTrackStorage.KEYS.milestones, {}) || {};
            let latest = null, latestDate = '';
            // DEFS is ordered low->high; >= makes the most-advanced milestone win on equal timestamps.
            StudyTrackMilestones.DEFS.forEach(d => { const date = stored[d.id]; if (date && date >= latestDate) { latestDate = date; latest = d; } });
            return latest;
        }
        function formatMilestoneDate(iso) {
            try { return new Date(iso).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' }); }
            catch { return ''; }
        }
        function renderMilestones() {
            const container = document.getElementById('profile-milestones');
            if (!container || !window.StudyTrackMilestones) return;
            const stored = StudyTrackStorage.getJson(StudyTrackStorage.KEYS.milestones, {}) || {};
            container.innerHTML = '';
            StudyTrackMilestones.DEFS.forEach(def => {
                const done = !!stored[def.id];
                const row = document.createElement('div');
                row.className = 'flex items-center gap-3';
                const orb = document.createElement('div');
                orb.className = 'w-9 h-9 rounded-full flex items-center justify-center shrink-0';
                orb.style.background = done ? 'var(--stk-soft-approved)' : 'var(--stk-surface-2)';
                orb.style.color = done ? 'var(--stk-ink-approved)' : 'var(--stk-text-3)';
                const ic = document.createElement('i');
                ic.className = 'fas ' + def.icon + ' text-sm';
                orb.appendChild(ic);
                const txt = document.createElement('div');
                txt.className = 'flex-1 min-w-0';
                const lbl = document.createElement('div');
                lbl.className = 'text-sm font-bold truncate';
                lbl.style.color = done ? 'var(--stk-text-1)' : 'var(--stk-text-2)';
                lbl.textContent = def.label;
                txt.appendChild(lbl);
                if (done) {
                    const dt = document.createElement('div');
                    dt.className = 'text-[11px]';
                    dt.style.color = 'var(--stk-text-2)';
                    dt.textContent = formatMilestoneDate(stored[def.id]);
                    txt.appendChild(dt);
                }
                row.append(orb, txt);
                if (done) { const chk = document.createElement('i'); chk.className = 'fas fa-circle-check'; chk.style.color = 'var(--stk-ink-approved)'; row.appendChild(chk); }
                container.appendChild(row);
            });
        }
        // ── Carné universitario (student ID card) ──────────────────────────
        // Two visual variants (navy / bands) share the same underlying data;
        // the chosen variant is a persisted UI preference, like scheduleViewType.
        let carneVariant = StudyTrackStorage.getItem(StudyTrackStorage.KEYS.carneVariant) || 'navy';
        // Shows/hides the two variant elements to match `carneVariant`. When `animate`
        // is true, replays the flip keyframe on the variant becoming visible (skipped
        // under prefers-reduced-motion via the CSS media query on .stk-carne-flip-anim).
        function applyCarneVariant(animate) {
            const navyEl = document.getElementById('profile-carne-navy');
            const bandsEl = document.getElementById('profile-carne-bands');
            if (!navyEl || !bandsEl) return;
            navyEl.classList.toggle('hidden', carneVariant !== 'navy');
            bandsEl.classList.toggle('hidden', carneVariant !== 'bands');
            if (animate) {
                const active = carneVariant === 'navy' ? navyEl : bandsEl;
                active.classList.remove('stk-carne-flip-anim');
                void active.offsetWidth; // restart the animation
                active.classList.add('stk-carne-flip-anim');
            }
        }
        function flipCarneVariant() {
            carneVariant = carneVariant === 'navy' ? 'bands' : 'navy';
            StudyTrackStorage.setItem(StudyTrackStorage.KEYS.carneVariant, carneVariant);
            notifySyncChange();
            applyCarneVariant(true);
        }
        function renderProfileView() {
            renderProfileAvatar();
            renderMilestones();
            const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
            const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
            const name = getStudentName();
            setVal('profile-name', name);
            setVal('profile-id', getStudentId());
            setVal('profile-status', getStudentStatus());
            setVal('profile-goal', getStudentGoal());
            setTxt('profile-greeting', name ? `¡Hola, ${name}! 👋` : '¡Hola! 👋');

            const studentId = getStudentId() || '—';
            const status = getStudentStatus() || 'Activo';
            setTxt('carne-navy-status', status);
            setTxt('carne-navy-id', studentId);
            setTxt('carne-bands-name', name || 'Sin nombre');
            setTxt('carne-bands-status', status);
            setTxt('carne-bands-id', studentId);
            applyCarneVariant(false);

            if (!currentCurriculum) {
                setTxt('profile-career', 'Sin carrera seleccionada');
                setTxt('profile-institution', '');
                setTxt('carne-bands-career', 'Sin carrera seleccionada');
                return;
            }
            const card = collectStudentCard();
            setTxt('profile-career', card.career || 'Sin carrera');
            setTxt('profile-institution', card.institution || '');
            setTxt('carne-bands-career', card.career || 'Sin carrera');
            const pct = Math.round(card.progress || 0);
            const ring = document.getElementById('profile-ring');
            if (ring) ring.style.background = `conic-gradient(var(--stk-accent-approved) ${pct * 3.6}deg, var(--stk-surface-2) ${pct * 3.6}deg)`;
            setTxt('profile-progress-value', pct + '%');
            const bar = document.getElementById('profile-progress-bar');
            if (bar) bar.style.width = pct + '%';
            setTxt('profile-approved', `${card.subjectsApproved}/${card.subjectsTotal}`);
            setTxt('profile-credits', card.creditsEarned);
            setTxt('profile-index', Number.isFinite(card.average) ? card.average.toFixed(1) : 'N/A');
            setTxt('profile-periods', card.periodsTaken);
        }

        function countPeriodsTaken() {
            if (!currentCurriculum) return 0;
            return (currentCurriculum.periods || []).filter(p => (p.subjects || []).some(s => userProgress[s.id]?.status === 'approved')).length;
        }

        function collectStudentCard() {
            const summary = StudyTrackAcademics.calculateAcademicSummary(currentCurriculum, userProgress, { getGradePoints, getGradeLabel });
            const metadata = currentCurriculum?.metadata || {};
            const input = {
                name: getStudentName(),
                institution: metadata.institution,
                career: metadata.career_name,
                degree: metadata.degree,
                periodsTaken: countPeriodsTaken(),
                subjectsApproved: summary.completed,
                subjectsTotal: summary.total,
                creditsEarned: summary.earned,
                creditsTotal: metadata.total_credits ?? null,
                progress: summary.progress,
                average: summary.globalAvg,
                gpa: summary.globalGPA,
                // new Date() is fine here: this is the browser runtime, not the
                // pure module. The model itself never calls Date.
                generatedAt: new Date().toISOString()
            };
            return StudyTrackNfc.buildStudentCard(input);
        }

        // Lightweight dismissible status overlay used while we wait for the tag.
        // Returns a function that removes the overlay so callers can close it on
        // success, error, or cancel.
        function showNfcStatusModal({ icon, title, message }) {
            const modalId = 'nfc-status-modal';
            const existing = document.getElementById(modalId);
            if (existing) existing.remove();

            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4';
            modal.id = modalId;

            const panel = document.createElement('div');
            panel.className = 'stk-surface-card w-full max-w-md p-6 animate-scale-up text-center';

            const spinner = document.createElement('div');
            spinner.className = 'w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center animate-pulse';
            spinner.style.cssText = 'background:var(--stk-tint-soft);color:var(--stk-tint)';
            const iconEl = document.createElement('i');
            iconEl.className = `${icon} text-2xl`;
            spinner.appendChild(iconEl);

            const titleEl = document.createElement('h3');
            titleEl.className = 'text-lg font-extrabold mb-2';
            titleEl.style.color = 'var(--stk-text-1)';
            titleEl.textContent = title;

            const messageEl = document.createElement('p');
            messageEl.className = 'text-sm mb-5 leading-normal';
            messageEl.style.color = 'var(--stk-text-2)';
            messageEl.textContent = message;

            const close = () => modal.remove();

            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'stk-settings-row w-full py-2.5 font-bold text-xs';
            cancel.textContent = 'Cancelar';
            cancel.onclick = close;

            panel.append(spinner, titleEl, messageEl, cancel);
            modal.appendChild(panel);
            document.body.appendChild(modal);
            return close;
        }

        function shareStudentCardViaNfc() {
            if (!currentCurriculum) { showToast('Carga un pensum primero', 'error'); return; }
            if (!nfcSupported()) { showToast('NFC no disponible (requiere Chrome en Android)', 'error'); return; }
            const card = collectStudentCard();
            const text = StudyTrackNfc.serializeCard(card);
            if (!StudyTrackNfc.fitsTag(text)) { showToast('El carné no entra en la etiqueta', 'error'); return; }

            const closeModal = showNfcStatusModal({
                icon: 'fas fa-id-card',
                title: 'Escribiendo carné',
                message: 'Acerca tu teléfono a la etiqueta NFC y mantenlo quieto.'
            });

            const reader = new NDEFReader();
            reader.write({ records: [{ recordType: 'mime', mediaType: StudyTrackNfc.MIME_TYPE, data: new TextEncoder().encode(text) }] })
                .then(() => { closeModal(); showToast('Carné escrito en la etiqueta', 'success'); })
                .catch(err => { closeModal(); showToast('No se pudo escribir: ' + err.message, 'error'); });
        }

        function readStudentCardViaNfc() {
            if (!nfcSupported()) { showToast('NFC no disponible (requiere Chrome en Android)', 'error'); return; }

            const closeModal = showNfcStatusModal({
                icon: 'fas fa-wifi',
                title: 'Leyendo carné',
                message: 'Acerca el teléfono a la etiqueta NFC para leer el carné.'
            });

            const reader = new NDEFReader();
            reader.scan().then(() => {
                reader.onreadingerror = () => { closeModal(); showToast('Error al leer la etiqueta', 'error'); };
                reader.onreading = (event) => {
                    for (const record of event.message.records) {
                        if (record.recordType === 'mime' && record.mediaType === StudyTrackNfc.MIME_TYPE) {
                            const text = new TextDecoder().decode(record.data);
                            const parsed = StudyTrackNfc.parseCard(text);
                            closeModal();
                            if (parsed) { showStudentCardModal(parsed); }
                            else { showToast('Etiqueta no válida', 'error'); }
                            return;
                        }
                    }
                    closeModal();
                    showToast('La etiqueta no contiene un carné StudyTrack', 'error');
                };
            }).catch(err => { closeModal(); showToast('No se pudo iniciar el lector: ' + err.message, 'error'); });
        }

        function showStudentCardModal(card) {
            const modalId = 'nfc-card-modal';
            const existing = document.getElementById(modalId);
            if (existing) existing.remove();

            // textContent everywhere: card fields come from an EXTERNAL tag and
            // must never be interpolated as HTML. '—' marks unknown values.
            const dash = '—';
            const text = (value) => (value === null || value === undefined || value === '') ? dash : String(value);
            const num = (value) => (value === null || value === undefined) ? dash : String(value);

            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4';
            modal.id = modalId;

            const panel = document.createElement('div');
            panel.className = 'stk-surface-card w-full max-w-md p-6 animate-scale-up';

            const header = document.createElement('div');
            header.className = 'flex items-center gap-3 mb-4';
            header.style.color = 'var(--stk-tint)';
            const headerIcon = document.createElement('i');
            headerIcon.className = 'fas fa-id-card text-2xl';
            const headerTitle = document.createElement('h3');
            headerTitle.className = 'text-lg font-extrabold';
            headerTitle.style.color = 'var(--stk-text-1)';
            headerTitle.textContent = 'Carné de estudiante';
            header.append(headerIcon, headerTitle);

            const list = document.createElement('div');
            list.className = 'space-y-2 mb-6';

            const addRow = (label, value) => {
                const row = document.createElement('div');
                row.className = 'flex items-baseline justify-between gap-3 text-sm pb-2';
                row.style.borderBottom = '1px solid var(--stk-hairline)';
                const labelEl = document.createElement('span');
                labelEl.className = 'font-medium shrink-0';
                labelEl.style.color = 'var(--stk-text-3)';
                labelEl.textContent = label;
                const valueEl = document.createElement('span');
                valueEl.className = 'font-bold text-right';
                valueEl.style.color = 'var(--stk-text-1)';
                valueEl.textContent = value;
                row.append(labelEl, valueEl);
                list.appendChild(row);
            };

            const credits = (card.creditsTotal === null || card.creditsTotal === undefined)
                ? text(card.creditsEarned)
                : `${num(card.creditsEarned)} / ${num(card.creditsTotal)}`;

            addRow('Nombre', text(card.name));
            addRow('Institución', text(card.institution));
            addRow('Carrera', text(card.career));
            addRow('Título', text(card.degree));
            addRow('Períodos cursados', num(card.periodsTaken));
            addRow('Materias aprobadas', `${num(card.subjectsApproved)} / ${num(card.subjectsTotal)}`);
            addRow('Créditos', credits);
            addRow('Avance %', card.progress === null || card.progress === undefined ? dash : `${card.progress}%`);
            addRow('Promedio', num(card.average));
            addRow('Índice', num(card.gpa));

            const footer = document.createElement('button');
            footer.type = 'button';
            footer.className = 'stk-btn-primary w-full py-2.5 text-sm';
            footer.textContent = 'Cerrar';
            footer.onclick = () => modal.remove();

            panel.append(header, list, footer);
            modal.appendChild(panel);
            document.body.appendChild(modal);
        }

        // ── QR sharing (deep-link) ─────────────────────────────────────────
        // The QR encodes a URL with the card embedded. The receiver scans it with
        // their phone's normal camera, which opens the app and shows the card —
        // works on Android AND iPhone, with no in-app scanner and no camera permission.
        // ── QR sharing & scanning ──────────────────────────────────────────
        // One entry point: the user can MOSTRAR su carné (generate a QR) or LEER
        // otro (decode a photo of a QR). Reading uses a PHOTO (file input), not a
        // live camera — so it needs no camera permission and works on iPhone too.
        function openQrShareModal() {
            const modalId = 'qr-choose-modal';
            const existing = document.getElementById(modalId);
            if (existing) existing.remove();

            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4';
            modal.id = modalId;
            const close = () => modal.remove();

            const panel = document.createElement('div');
            panel.className = 'stk-surface-card w-full max-w-xs p-6 animate-scale-up';

            const title = document.createElement('h3');
            title.className = 'text-lg font-extrabold mb-1 text-center';
            title.style.color = 'var(--stk-text-1)';
            title.textContent = 'Carné por QR';
            const hint = document.createElement('p');
            hint.className = 'text-sm mb-5 text-center leading-normal';
            hint.style.color = 'var(--stk-text-2)';
            hint.textContent = '¿Querés mostrar tu carné o leer el de alguien?';

            const makeChoice = (icon, label, sub, onClick) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'stk-settings-row w-full text-left p-4 rounded-xl transition-all flex items-center gap-3 mb-3';
                const ic = document.createElement('i');
                ic.className = 'fas ' + icon + ' text-xl shrink-0 w-6 text-center';
                ic.style.color = 'var(--stk-tint)';
                const box = document.createElement('div');
                const t = document.createElement('div'); t.className = 'text-sm font-bold'; t.style.color = 'var(--stk-text-1)'; t.textContent = label;
                const s = document.createElement('div'); s.className = 'text-[11px]'; s.style.color = 'var(--stk-text-3)'; s.textContent = sub;
                box.append(t, s);
                btn.append(ic, box);
                btn.onclick = () => { close(); onClick(); };
                return btn;
            };

            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'stk-settings-row w-full py-2.5 font-bold text-xs';
            cancel.textContent = 'Cancelar';
            cancel.onclick = close;

            panel.append(
                title, hint,
                makeChoice('fa-qrcode', 'Mostrar mi carné', 'Genera un QR para que lo escaneen', generateMyQr),
                makeChoice('fa-camera', 'Leer un carné', 'Tomá una foto de un QR', scanQrFromPhoto),
                cancel
            );
            modal.appendChild(panel);
            document.body.appendChild(modal);
        }
        function generateMyQr() {
            if (!currentCurriculum) { showToast('Carga un pensum primero', 'error'); return; }
            if (typeof window.qrcode !== 'function') { showToast('Generador de QR no disponible', 'error'); return; }
            const card = collectStudentCard();
            const url = StudyTrackShare.buildShareUrl(location.origin + location.pathname, card);
            let canvas;
            try { canvas = renderQrCanvas(url); }
            catch { showToast('El carné es demasiado grande para un QR', 'error'); return; }
            showQrModal(canvas);
        }
        function scanQrFromPhoto() {
            if (typeof window.jsQR !== 'function') { showToast('Lector de QR no disponible', 'error'); return; }
            const input = document.getElementById('qr-scan-input');
            if (input) input.click();
        }
        // Decode a QR from the chosen photo. Mirrors the profile photo picker's
        // decode path (createImageBitmap, with a FileReader+Image fallback) so it
        // stays CSP-safe (no blob: URLs) and EXIF-tolerant.
        function onQrPhotoSelected(input) {
            const file = input.files && input.files[0];
            input.value = '';
            if (!file) return;
            if (typeof window.jsQR !== 'function') { showToast('Lector de QR no disponible', 'error'); return; }
            const decode = (source) => {
                const w0 = source.width, h0 = source.height;
                if (!w0 || !h0) { showToast('Imagen no válida', 'error'); return; }
                const scale = Math.min(1, 1000 / Math.max(w0, h0));
                const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(source, 0, 0, w, h);
                if (typeof source.close === 'function') source.close();
                const imageData = canvas.getContext('2d').getImageData(0, 0, w, h);
                const found = window.jsQR(imageData.data, w, h);
                if (!found) { showToast('No se encontró un QR en la foto', 'error'); return; }
                const card = parseScannedCard(found.data);
                if (card) showStudentCardModal(card);
                else showToast('El QR no es un carné de StudyTrack', 'error');
            };
            if (typeof createImageBitmap === 'function') {
                createImageBitmap(file).then(decode).catch(() => loadImageForQr(file, decode));
            } else {
                loadImageForQr(file, decode);
            }
        }
        function loadImageForQr(file, decode) {
            const reader = new FileReader();
            reader.onerror = () => showToast('No se pudo leer la imagen', 'error');
            reader.onload = () => {
                const img = new Image();
                img.onerror = () => showToast('Imagen no válida', 'error');
                img.onload = () => decode(img);
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        }
        // The QR normally encodes our deep-link URL; pull the ?card= payload out of
        // it (falling back to treating the whole string as a query if it isn't a URL).
        function parseScannedCard(textData) {
            let card = null;
            try { card = StudyTrackShare.parseShareParam(new URL(textData).search); } catch (e) { /* not a full URL */ }
            if (!card) card = StudyTrackShare.parseShareParam(textData);
            return card;
        }
        // Draw the QR module matrix onto a canvas. Always white-on-black on a white
        // background (so it scans even in dark mode). Throws if data exceeds capacity.
        function renderQrCanvas(textData) {
            const qr = window.qrcode(0, 'M');
            qr.addData(textData);
            qr.make();
            const count = qr.getModuleCount();
            const cell = 6, margin = 4;
            const size = (count + margin * 2) * cell;
            const canvas = document.createElement('canvas');
            canvas.width = size; canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
            ctx.fillStyle = '#000000';
            for (let r = 0; r < count; r++) {
                for (let c = 0; c < count; c++) {
                    if (qr.isDark(r, c)) ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
                }
            }
            canvas.style.width = '240px'; canvas.style.height = '240px';
            canvas.style.imageRendering = 'pixelated';
            return canvas;
        }
        function showQrModal(canvas) {
            const modalId = 'qr-share-modal';
            const existing = document.getElementById(modalId);
            if (existing) existing.remove();

            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4';
            modal.id = modalId;

            const panel = document.createElement('div');
            panel.className = 'stk-surface-card w-full max-w-xs p-6 animate-scale-up text-center';

            const title = document.createElement('h3');
            title.className = 'text-lg font-extrabold mb-1';
            title.style.color = 'var(--stk-text-1)';
            title.textContent = 'Compartir carné';
            const hint = document.createElement('p');
            hint.className = 'text-sm mb-4 leading-normal';
            hint.style.color = 'var(--stk-text-2)';
            hint.textContent = 'Escaneá este código con la cámara de otro teléfono.';

            // Fixed white frame (theme-independent, not a token): the QR canvas is
            // drawn white-on-black with its own quiet zone baked in, so the halo
            // around it must stay white in dark mode too or the scanner loses contrast.
            const frame = document.createElement('div');
            frame.className = 'bg-white p-3 rounded-xl inline-block mb-4';
            frame.appendChild(canvas);

            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'stk-settings-row w-full py-2.5 font-bold text-xs';
            close.textContent = 'Cerrar';
            close.onclick = () => modal.remove();

            panel.append(title, hint, frame, close);
            modal.appendChild(panel);
            document.body.appendChild(modal);
        }
        // On load, if the URL carries a shared card (?card=...), show it and then
        // strip the param so a refresh doesn't re-trigger and the address stays clean.
        function maybeShowSharedCard() {
            if (!location.search || typeof StudyTrackShare === 'undefined') return;
            const card = StudyTrackShare.parseShareParam(location.search);
            if (!card) return;
            try { history.replaceState(null, '', location.origin + location.pathname); } catch (e) { /* history may be unavailable */ }
            showStudentCardModal(card);
        }
        function resetProgress() { if (confirm('¿Reiniciar?')) { userProgress = {}; saveUserProgress(); initApp(); showToast('Reiniciado', 'success'); } }
        function deleteAllData() { if (confirm('¿Borrar todo?')) { StudyTrackStorage.clearAll(); location.reload(); } }
        // Force the PWA to fetch the latest version: unregister the service worker
        // and clear the Cache Storage shell, then reload. Deliberately does NOT touch
        // localStorage, so the user's curriculum, grades and profile are preserved.
        async function forceAppRefresh() {
            if (!confirm('Recargar la app con la última versión. Tus datos (carrera, notas, perfil) se conservan. ¿Continuar?')) return;
            showToast('Actualizando…', 'info');
            try {
                if ('serviceWorker' in navigator) {
                    const regs = await navigator.serviceWorker.getRegistrations();
                    await Promise.all(regs.map((r) => r.unregister()));
                }
                if (window.caches && caches.keys) {
                    const keys = await caches.keys();
                    await Promise.all(keys.map((k) => caches.delete(k)));
                }
            } catch (e) { /* best-effort: a reload still helps even if clearing partially fails */ }
            location.reload();
        }
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
            const profileView = document.getElementById('profile-view');
            homeView.classList.toggle('hidden', view !== 'home');
            subjectsView.classList.toggle('hidden', view !== 'subjects');
            scheduleView.classList.toggle('hidden', view !== 'schedule');
            if (profileView) profileView.classList.toggle('hidden', view !== 'profile');
            setActiveMobileNav(view === 'schedule' ? 'nav-schedule' : view === 'subjects' ? 'nav-subjects' : view === 'profile' ? 'nav-progress' : 'nav-home');
            if (view === 'home') renderHomeView();
            if (view === 'schedule') renderScheduleView();
            if (view === 'subjects') animateSubjectEntrance();
            if (view === 'profile') renderProfileView();
            const shown = view === 'home' ? homeView : view === 'schedule' ? scheduleView : view === 'profile' ? profileView : null;
            if (shown) { shown.classList.remove('stk-view-in'); void shown.offsetWidth; shown.classList.add('stk-view-in'); }
        }

        function getEnrolledSubjects() { const enrolled = []; if (currentCurriculum) { currentCurriculum.periods.forEach(p => p.subjects.forEach(s => { if (userProgress[s.id]?.status === 'enrolled') enrolled.push({ ...s, period: p.period_number }); })); } return enrolled; }

        function toggleScheduleView(type) { scheduleViewType = type; StudyTrackStorage.setItem(StudyTrackStorage.KEYS.scheduleViewType, type); notifySyncChange(); updateScheduleViewButtons(); const listContainer = document.getElementById('weekly-schedule-list'); const gridContainer = document.getElementById('weekly-schedule-table'); if (type === 'list') { listContainer.classList.remove('hidden'); gridContainer.classList.add('hidden'); } else { listContainer.classList.add('hidden'); gridContainer.classList.remove('hidden'); } renderScheduleView(); }

        function updateScheduleViewButtons() { const btnList = document.getElementById('view-btn-list'); const btnGrid = document.getElementById('view-btn-grid'); if (scheduleViewType === 'list') { btnList.className = 'stk-sched-pill stk-sched-pill--active'; btnGrid.className = 'stk-sched-pill'; } else { btnGrid.className = 'stk-sched-pill stk-sched-pill--active'; btnList.className = 'stk-sched-pill'; } }

        function updateScheduleSummary(enrolled) {
            const scheduledCount = enrolled.filter(subject => (scheduleData[subject.id] || []).length > 0).length;
            const pendingCount = enrolled.length - scheduledCount;
            document.getElementById('schedule-summary-enrolled').textContent = enrolled.length;
            document.getElementById('schedule-summary-scheduled').textContent = scheduledCount;
            document.getElementById('schedule-summary-pending').textContent = pendingCount;
            document.getElementById('unscheduled-count').textContent = pendingCount;
            document.getElementById('unscheduled-count').classList.toggle('hidden', pendingCount === 0);
            const subtitle = document.getElementById('schedule-week-subtitle');
            if (subtitle) {
                subtitle.textContent = enrolled.length === 0
                    ? 'Aún no tienes materias inscritas.'
                    : `${enrolled.length} ${enrolled.length === 1 ? 'materia inscrita' : 'materias inscritas'} · ${scheduledCount} con horario · ${pendingCount} pendiente${pendingCount === 1 ? '' : 's'}`;
            }
        }

        function renderScheduleView() { const enrolled = getEnrolledSubjects(); const emptyEl = document.getElementById('schedule-empty'); const unscheduledSection = document.getElementById('unscheduled-section'); const unscheduledList = document.getElementById('unscheduled-list'); document.querySelector('#unscheduled-section h3').innerHTML = '<i class="fas fa-edit text-primary-500"></i> Gestionar Horarios'; updateScheduleSummary(enrolled); if (enrolled.length === 0) { emptyEl.classList.remove('hidden'); unscheduledSection.classList.add('hidden'); document.getElementById('weekly-schedule-list').parentElement.classList.add('hidden'); return; } emptyEl.classList.add('hidden'); unscheduledSection.classList.remove('hidden'); document.getElementById('weekly-schedule-list').parentElement.classList.remove('hidden'); unscheduledList.innerHTML = StudyTrackSchedule.renderEnrolledScheduleHTML(enrolled, scheduleData, { escapeHtml, escapeJsString }); updateScheduleViewButtons(); if (scheduleViewType === 'list') { document.getElementById('weekly-schedule-list').classList.remove('hidden'); document.getElementById('weekly-schedule-table').classList.add('hidden'); renderWeeklySchedule(enrolled); } else { document.getElementById('weekly-schedule-list').classList.add('hidden'); document.getElementById('weekly-schedule-table').classList.remove('hidden'); renderTableSchedule(enrolled); } }



        function renderTableSchedule(enrolled) {
            const container = document.getElementById('visual-schedule-grid');
            const noClasses = document.getElementById('schedule-no-classes');
            const legend = document.getElementById('schedule-color-legend');
            const allBlocks = StudyTrackSchedule.collectScheduleBlocks(enrolled, scheduleData);
            if (allBlocks.length === 0) { container.innerHTML = ''; if (legend) legend.innerHTML = ''; noClasses.classList.remove('hidden'); return; }
            noClasses.classList.add('hidden');
            const rendered = StudyTrackSchedule.renderVisualScheduleHTML(allBlocks, { escapeHtml, escapeJsString });
            container.style.height = `${rendered.height}px`;
            container.innerHTML = rendered.html;
            if (legend) legend.innerHTML = StudyTrackSchedule.renderScheduleLegendHTML(enrolled, scheduleData, { escapeHtml });
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
            // The enrolled subject card (Subjects view) shows a schedule summary line
            // once a block exists, so refresh it in place if it's currently rendered.
            const scheduledLoc = findSubjectLocation(subjectId);
            if (scheduledLoc) reRenderSubjectCardDOM(scheduledLoc.subject);
        }

        function deleteScheduleBlock(subjectId, blockId) {
            const result = StudyTrackSchedule.deleteScheduleBlock(scheduleData, subjectId, blockId);
            if (!result.changed) return;

            scheduleData = result.scheduleData;
            saveScheduleData();
            renderScheduleView();
            showToast('Bloque eliminado', 'info');
            const scheduledLoc = findSubjectLocation(subjectId);
            if (scheduledLoc) reRenderSubjectCardDOM(scheduledLoc.subject);
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
