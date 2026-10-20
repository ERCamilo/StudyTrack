(function (global) {
  // Lowercase and strip accents so "calculo" finds "Cálculo I" (and the other way round).
  function normalizeSearchText(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function subjectMatchesFilter(subject, progress, textFilter = '', statusFilter = 'all') {
    const normalizedText = normalizeSearchText(textFilter);
    const matchesText = !normalizedText
      || normalizeSearchText(subject.name).includes(normalizedText)
      || normalizeSearchText(subject.code).includes(normalizedText);
    const status = progress?.[subject.id]?.status || 'pending';

    if (statusFilter === 'enrolled') return matchesText && status === 'enrolled';
    if (statusFilter === 'completed') return matchesText && status === 'approved';
    if (statusFilter === 'pending') return matchesText && status === 'pending';
    return matchesText;
  }

  // Message for an empty subject list: says why it is empty and whether there is a search or filter to clear.
  function getEmptyListMessage(searchText, statusFilter) {
    const text = String(searchText == null ? '' : searchText).trim();
    if (text) return { title: `Sin resultados para «${text}»`, hint: 'Revisa la ortografía o prueba con el código de la materia.', showClear: true };
    const byFilter = {
      enrolled: { title: 'No tienes materias en curso', hint: 'Inscribe una desde la pestaña Pendientes.' },
      completed: { title: 'Aún no tienes materias aprobadas', hint: 'Cuando apruebes una, aparecerá aquí.' },
      pending: { title: 'No te quedan materias pendientes', hint: 'Todas están en curso o aprobadas.' }
    };
    if (byFilter[statusFilter]) return { ...byFilter[statusFilter], showClear: true };
    return { title: 'No hay materias para mostrar', hint: 'Carga una carrera desde Configuración.', showClear: false };
  }

  function getVisibleSubjects(period, progress, textFilter = '', statusFilter = 'all') {
    return (period?.subjects || []).filter((subject) => subjectMatchesFilter(subject, progress, textFilter, statusFilter));
  }

  function isPeriodOpen(periodIndex, collapsedPeriods, textFilter = '', statusFilter = 'all') {
    return !collapsedPeriods?.has(periodIndex) || Boolean(textFilter) || statusFilter !== 'all';
  }

  // Renders the clickable/collapsible shell around a period. The header's own
  // visual (ring, watermark, eyebrow…) is pre-rendered by the caller via
  // StudyTrackCards.renderPeriodHeaderCard and handed in as `headerHtml` —
  // this module only owns the collapse interaction and the subject list.
  function renderPeriodCardHTML({
    periodIndex,
    periodNumber,
    headerHtml,
    visibleSubjects,
    open,
    renderSubject,
    escapeHtml = String,
    actionArgs = (...a) => escapeHtml(JSON.stringify(a))
  }) {
    const chevronStyle = `position:absolute;top:16px;right:16px;z-index:2;${open ? 'transform:rotate(180deg);' : ''}`;
    // The chevron lives OUTSIDE the #period-header-content-{i} span so that
    // updatePeriodHeaderDOM (a targeted innerHTML patch after a subject changes)
    // can replace just the header visual without wiping the collapse indicator.
    return `<div data-action="togglePeriod" data-args="${actionArgs(periodIndex)}" role="button" tabindex="0" aria-expanded="${open ? 'true' : 'false'}" class="relative cursor-pointer select-none"><div id="period-header-content-${escapeHtml(periodIndex)}">${headerHtml}</div><i class="fas fa-chevron-down stk-chev" style="${chevronStyle}"></i></div><div class="collapsible-content ${open ? 'open' : ''}"><div class="pt-2 space-y-2 sm:space-y-2.5">${visibleSubjects.map((subject) => renderSubject(subject, periodNumber)).join('')}</div></div>`;
  }

  global.StudyTrackPeriods = {
    getEmptyListMessage,
    getVisibleSubjects,
    isPeriodOpen,
    renderPeriodCardHTML,
    subjectMatchesFilter
  };
})(typeof window !== 'undefined' ? window : globalThis);
