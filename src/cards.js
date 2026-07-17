(function (global) {
  // ── MiRuta card system (Phase 3) ────────────────────────────────────────
  // Pure template functions for the two card families in the Subjects view:
  // the period header (progress ring / watermark number) and the subject
  // card (one of five state variants). Neither function reads the DOM or
  // global state — all data comes in as plain objects, all HTML-escaping
  // helpers are injected by the caller (mirrors src/periods.js / src/schedule.js).

  const STATUS_ICON = {
    enrolled: 'fa-book-open',
    available: 'fa-route',
    locked: 'fa-lock',
    approved: 'fa-check',
    warning: 'fa-triangle-exclamation'
  };

  const shortStatus = {
    approved: 'Aprobada',
    warning: 'Aprobada · revisar',
    enrolled: 'En curso',
    available: 'Disponible',
    locked: 'Bloqueada'
  };

  /**
   * @typedef {Object} PeriodHeaderData
   * @property {number|string} periodNumber
   * @property {string} periodName
   * @property {boolean} completed - true when every subject in the period is approved
   * @property {number} subjectCount - total subjects in the period (unfiltered)
   * @property {number} totalCredits - sum of credits of every subject in the period
   * @property {number} progressPercent - 0-100, drives the ring (ignored when completed)
   * @property {number|null} average - period average grade rounded to an integer, or null
   * @property {number} enrolledCount - subjects currently enrolled in the period; the
   *   "Cursando ahora" eyebrow only shows once this is > 0 (active variant)
   */

  /**
   * Renders the period header card: the "Cursando ahora" ring variant while the
   * period is in progress, or the tinted "Completado" variant once every subject
   * in it is approved.
   *
   * @param {PeriodHeaderData} data
   * @param {{escapeHtml?: Function}} [helpers]
   * @returns {string} HTML for a single self-contained period header card.
   */
  function renderPeriodHeaderCard(data, { escapeHtml = String } = {}) {
    const safeName = escapeHtml(data.periodName);
    const watermark = escapeHtml(String(data.periodNumber).padStart(2, '0'));
    const subjectCount = escapeHtml(data.subjectCount);
    const totalCredits = escapeHtml(data.totalCredits);

    if (data.completed) {
      const safeAverage = data.average === null || data.average === undefined ? '' : ` · Prom ${escapeHtml(data.average)}`;
      return `<div class="stk-period-card stk-period-card--completed">
        <div class="stk-period-watermark stk-period-watermark--2">${watermark}</div>
        <div class="stk-period-content">
          <div class="stk-period-index">${watermark}</div>
          <div class="stk-period-check"><i class="fas fa-check"></i></div>
          <div class="stk-period-text">
            <div class="stk-period-eyebrow stk-period-eyebrow--navy">Completado${safeAverage}</div>
            <div class="stk-period-title">${safeName}</div>
          </div>
        </div>
      </div>`;
    }

    const clampedPercent = Math.max(0, Math.min(100, Number(data.progressPercent) || 0));
    const circumference = 150.8;
    const offset = (circumference * (1 - clampedPercent / 100)).toFixed(1);
    // "Cursando ahora" only applies once the student has enrolled a subject here;
    // otherwise the period is simply upcoming ("Por cursar").
    const eyebrow = Number(data.enrolledCount) > 0
      ? '<div class="stk-period-eyebrow">Cursando ahora</div>'
      : '<div class="stk-period-eyebrow stk-period-eyebrow--idle">Por cursar</div>';

    return `<div class="stk-period-card stk-period-card--active">
      <div class="stk-period-watermark">${watermark}</div>
      <div class="stk-period-content">
        <div class="stk-period-index">${watermark}</div>
        <div class="stk-period-ring">
          <svg width="56" height="56" viewBox="0 0 56 56" style="transform:rotate(-90deg)">
            <circle cx="28" cy="28" r="24" fill="none" stroke="var(--stk-surface-2)" stroke-width="6"></circle>
            <circle cx="28" cy="28" r="24" fill="none" stroke="var(--stk-tint)" stroke-width="6" stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"></circle>
          </svg>
          <div class="stk-period-ring-value">${Math.round(clampedPercent)}%</div>
        </div>
        <div class="stk-period-text">
          ${eyebrow}
          <div class="stk-period-title">${safeName}</div>
          <div class="stk-period-subtitle">${subjectCount} materia${data.subjectCount === 1 ? '' : 's'} · ${totalCredits} crédito${data.totalCredits === 1 ? '' : 's'}</div>
        </div>
      </div>
    </div>`;
  }

  /**
   * @typedef {Object} SubjectCardData
   * @property {string} id
   * @property {string} name
   * @property {string} code
   * @property {number|string} credits
   * @property {'enrolled'|'available'|'locked'|'approved'|'warning'} state
   * @property {number|string|null} grade - numeric grade, or null when not recorded
   * @property {string|null} scheduleSummary - e.g. "Mar y Jue · 6–8 PM" (enrolled only), null otherwise
   * @property {string|null} completionLabel - e.g. "Concluida mar 2025", or null when the app has no
   *   completion date on file for this subject (approved/warning only)
   * @property {string} prerequisiteLabel - human-readable prerequisite requirement, '' when none
   * @property {boolean} missingGrade - approved without a recorded grade (warning only)
   * @property {boolean} skippedPrerequisite - approved even though its prerequisite is no longer met
   * @property {boolean} disabled - true when locked and prerequisite-skipping is turned off
   * @property {number} attempts - retry count shown in the details panel
   * @property {string} section
   * @property {string} classroom
   * @property {string} teacher
   * @property {string} completionRaw - raw "YYYY-MM" value backing the details-panel date field
   */

  function detailsPanelHTML(data, { escapeHtml, actionArgs }) {
    const safeIdHtml = escapeHtml(data.id);
    return `<div class="stk-details" id="details-${safeIdHtml}">
      <div class="stk-details-inner">
        <div class="stk-details-grid">
          <div class="stk-field"><label>Sección</label><input type="text" placeholder="Ej: 01" value="${escapeHtml(data.section || '')}" data-change="updateSubjectExtra" data-args="${actionArgs(data.id, 'section', '$value')}"></div>
          <div class="stk-field"><label>Aula</label><input type="text" placeholder="Ej: A-101" value="${escapeHtml(data.classroom || '')}" data-change="updateSubjectExtra" data-args="${actionArgs(data.id, 'classroom', '$value')}"></div>
          <div class="stk-field stk-field--wide"><label>Maestro</label><input type="text" placeholder="Nombre del profesor" value="${escapeHtml(data.teacher || '')}" data-change="updateSubjectExtra" data-args="${actionArgs(data.id, 'teacher', '$value')}"></div>
          <div class="stk-field"><label>Retiros</label><input type="number" min="0" max="10" placeholder="0" value="${escapeHtml(data.attempts || 0)}" data-change="updateAttempts" data-args="${actionArgs(data.id, '$value')}"></div>
          <div class="stk-field"><label>Fecha</label><input type="month" value="${escapeHtml(data.completionRaw || '')}" data-change="updateCompletionDate" data-args="${actionArgs(data.id, '$value')}"></div>
        </div>
      </div>
    </div>`;
  }

  function expandButtonHTML(data, { escapeHtml, actionArgs }) {
    const safeSubjectName = escapeHtml(data.name);
    return `<button class="stk-expand-btn" aria-label="Ver detalles de ${safeSubjectName}" data-action="toggleSubjectDetails" data-args="${actionArgs(data.id)}"><i class="fas fa-chevron-down stk-chev" id="chevron-${escapeHtml(data.id)}"></i></button>`;
  }

  function gradeInputHTML(data, { escapeHtml, actionArgs }, extraAttrs = '') {
    const safeSubjectName = escapeHtml(data.name);
    const safeGrade = escapeHtml(data.grade ?? '');
    return `<input type="number" min="0" max="100" step="any" class="stk-grade" aria-label="Nota de ${safeSubjectName}" placeholder="--" value="${safeGrade}" data-change="updateGrade" data-args="${actionArgs(data.id, '$value')}" ${extraAttrs}>`;
  }

  function renderEnrolledCard(data, helpers) {
    const { escapeHtml, actionArgs } = helpers;
    const safeIdHtml = escapeHtml(data.id);
    const safeSubjectName = escapeHtml(data.name);
    const safeCode = escapeHtml(data.code);
    const safeCredits = escapeHtml(data.credits);

    const metaLine = data.scheduleSummary
      ? `<div class="stk-subject-meta stk-subject-meta--schedule"><i class="fas fa-calendar-check"></i>${escapeHtml(data.scheduleSummary)}</div>`
      : `<div class="stk-subject-meta">${safeCode} · ${safeCredits} créditos</div>`;

    const scheduleBtn = data.scheduleSummary
      ? ''
      : `<button class="stk-action-btn stk-action-btn--tint" data-action="openScheduleModal" data-args="${actionArgs(data.id, data.name, null)}"><i class="fas fa-clock"></i>Agregar horario</button>`;

    const gradeBtn = `<label class="stk-note stk-note--navy" data-action="stop">
      <span class="stk-note-cap"><i class="fas fa-award"></i>Registrar nota</span>
      ${gradeInputHTML(data, helpers)}
    </label>`;

    return `<div id="subject-card-${safeIdHtml}" class="subject-card-mobile stk-subject-card stk-subject-card--enrolled">
      <div class="stk-subject-header" data-action="toggleSubjectDetails" data-args="${actionArgs(data.id)}">
        <button class="stk-orb" aria-label="Cambiar estado de ${safeSubjectName}" title="${shortStatus.enrolled}" data-action="toggleSubjectStatus" data-args="${actionArgs(data.id)}"><span class="stk-orb-tile stk-orb-tile--enrolled"><i class="fas ${STATUS_ICON.enrolled}"></i></span></button>
        <div class="stk-subject-main">
          <div class="stk-subject-name">${safeSubjectName}</div>
          ${metaLine}
        </div>
        <button class="stk-pill stk-pill--enrolled" data-action="toggleEnrollment" data-args="${actionArgs(data.id)}">En curso</button>
        ${expandButtonHTML(data, helpers)}
      </div>
      <div class="stk-actions">${scheduleBtn}${gradeBtn}</div>
      ${detailsPanelHTML(data, helpers)}
    </div>`;
  }

  function renderAvailableCard(data, helpers) {
    const { escapeHtml, actionArgs } = helpers;
    const safeIdHtml = escapeHtml(data.id);
    const safeSubjectName = escapeHtml(data.name);
    const safeCode = escapeHtml(data.code);
    const safeCredits = escapeHtml(data.credits);

    return `<div id="subject-card-${safeIdHtml}" class="subject-card-mobile stk-subject-card stk-subject-card--available">
      <div class="stk-subject-icon" title="${shortStatus.available}"><i class="fas ${STATUS_ICON.available}"></i></div>
      <div class="stk-subject-main">
        <div class="stk-subject-name">${safeSubjectName}</div>
        <div class="stk-subject-meta">${safeCode} · ${safeCredits} créditos</div>
      </div>
      <button class="stk-pill stk-pill--inscribir" data-action="toggleEnrollment" data-args="${actionArgs(data.id)}">Inscribir</button>
    </div>`;
  }

  function renderLockedCard(data, helpers) {
    const { escapeHtml, actionArgs } = helpers;
    const safeIdHtml = escapeHtml(data.id);
    const safeSubjectName = escapeHtml(data.name);
    const safeCode = escapeHtml(data.code);
    const safePrereq = escapeHtml(data.prerequisiteLabel || '');

    const inscribirBtn = data.disabled
      ? ''
      : `<button class="stk-pill stk-pill--inscribir" data-action="toggleEnrollment" data-args="${actionArgs(data.id)}">Inscribir</button>`;

    return `<div id="subject-card-${safeIdHtml}" class="subject-card-mobile stk-subject-card stk-subject-card--locked ${data.disabled ? 'stk-subject-card--dim' : ''}">
      <div class="stk-subject-icon" title="${shortStatus.locked}"><i class="fas ${STATUS_ICON.locked}"></i></div>
      <div class="stk-subject-main">
        <div class="stk-subject-name">${safeSubjectName}</div>
        <button type="button" class="stk-subject-subtitle-link" title="${safePrereq}" data-action="showPrerequisitePopover" data-args="${actionArgs('$event', data.id)}">${safeCode} · requiere ${safePrereq}</button>
      </div>
      ${inscribirBtn}
    </div>`;
  }

  function renderCompletedRow(data, helpers) {
    const { escapeHtml, actionArgs } = helpers;
    const safeIdHtml = escapeHtml(data.id);
    const safeSubjectName = escapeHtml(data.name);
    const safeCode = escapeHtml(data.code);
    const safeCredits = escapeHtml(data.credits);
    const isWarning = data.state === 'warning';
    const stateClass = isWarning ? 'stk-subject-card--warning' : 'stk-subject-card--approved';

    const subtitle = data.completionLabel
      ? `${safeCode} · ${escapeHtml(data.completionLabel)}`
      : `${safeCode} · ${safeCredits} créditos`;

    const skippedPrereqLine = data.skippedPrerequisite
      ? `<button type="button" class="stk-subject-subtitle-link stk-subject-subtitle-link--warning" title="${escapeHtml(data.prerequisiteLabel || '')}" data-action="showPrerequisitePopover" data-args="${actionArgs('$event', data.id)}"><i class="fas fa-triangle-exclamation"></i>Requisito saltado</button>`
      : '';

    const missingGradeText = data.missingGrade
      ? `<div class="stk-warn-text"><i class="fas fa-triangle-exclamation" style="font-size:10px"></i>Falta registrar la nota</div>`
      : '';

    const gradeSlot = data.missingGrade
      ? gradeInputHTML(data, helpers, 'data-action="stop" title="Materia completada sin nota registrada"')
      : gradeInputHTML(data, helpers, 'data-action="stop"');

    return `<div id="subject-card-${safeIdHtml}" class="subject-card-mobile stk-subject-card ${stateClass}">
      <div class="stk-subject-row-head" data-action="toggleSubjectDetails" data-args="${actionArgs(data.id)}">
        <button class="stk-orb" aria-label="Cambiar estado de ${safeSubjectName}" title="${isWarning ? shortStatus.warning : shortStatus.approved}" data-action="toggleSubjectStatus" data-args="${actionArgs(data.id)}"><span class="stk-orb-tile stk-orb-tile--row"><i class="fas ${isWarning ? STATUS_ICON.warning : STATUS_ICON.approved}"></i></span></button>
        <div class="stk-subject-main">
          <div class="stk-subject-name">${safeSubjectName}</div>
          <div class="stk-subject-meta">${subtitle}</div>
          ${skippedPrereqLine}
          ${missingGradeText}
        </div>
        ${gradeSlot}
        ${expandButtonHTML(data, helpers)}
      </div>
      ${detailsPanelHTML(data, helpers)}
    </div>`;
  }

  /**
   * Renders one subject card in the variant matching `data.state`.
   *
   * @param {SubjectCardData} data
   * @param {{escapeHtml?: Function, actionArgs?: Function}} [helpers]
   * @returns {string} HTML for a single self-contained subject card.
   */
  function renderSubjectCard(data, helpers = {}) {
    const escapeHtml = helpers.escapeHtml || String;
    const actionArgs = helpers.actionArgs || ((...args) => escapeHtml(JSON.stringify(args)));
    const resolved = { escapeHtml, actionArgs };

    if (data.state === 'enrolled') return renderEnrolledCard(data, resolved);
    if (data.state === 'available') return renderAvailableCard(data, resolved);
    if (data.state === 'locked') return renderLockedCard(data, resolved);
    return renderCompletedRow(data, resolved); // 'approved' | 'warning'
  }

  global.StudyTrackCards = {
    shortStatus,
    renderPeriodHeaderCard,
    renderSubjectCard
  };
})(typeof window !== 'undefined' ? window : globalThis);
