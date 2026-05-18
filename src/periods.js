(function (global) {
  function subjectMatchesFilter(subject, progress, textFilter = '', statusFilter = 'all') {
    const normalizedText = String(textFilter || '').toLowerCase();
    const matchesText = !normalizedText
      || String(subject.name || '').toLowerCase().includes(normalizedText)
      || String(subject.code || '').toLowerCase().includes(normalizedText);
    const status = progress?.[subject.id]?.status || 'pending';

    if (statusFilter === 'enrolled') return matchesText && status === 'enrolled';
    if (statusFilter === 'completed') return matchesText && status === 'approved';
    if (statusFilter === 'pending') return matchesText && status === 'pending';
    return matchesText;
  }

  function getVisibleSubjects(period, progress, textFilter = '', statusFilter = 'all') {
    return (period?.subjects || []).filter((subject) => subjectMatchesFilter(subject, progress, textFilter, statusFilter));
  }

  function isPeriodOpen(periodIndex, collapsedPeriods, textFilter = '', statusFilter = 'all') {
    return !collapsedPeriods?.has(periodIndex) || Boolean(textFilter) || statusFilter !== 'all';
  }

  function renderPeriodStatsHTML(stats, totalSubjects) {
    return `<div class="flex items-center gap-2"><div class="h-1.5 w-20 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden"><div class="h-full bg-emerald-500 transition-all duration-500" style="width: ${stats.completionPercentage}%"></div></div><span class="text-xs text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">${stats.completed}/${totalSubjects}</span></div>`;
  }

  function renderPeriodCardHTML({
    period,
    periodIndex,
    visibleSubjects,
    open,
    stats,
    average,
    gpa4,
    statusColor,
    escapeHtml,
    renderSubject
  }) {
    const safePeriodNumber = escapeHtml(period.period_number);
    const safePeriodName = escapeHtml(period.name);
    let badgesHtml = '';
    if (average) badgesHtml += `<span class="badge-stat hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 ml-2"><i class="fas fa-chart-line mr-1 text-slate-400"></i>${escapeHtml(average)}</span>`;
    if (gpa4) badgesHtml += `<span class="badge-stat hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 ml-1"><i class="fas fa-star mr-1 text-slate-400"></i>${escapeHtml(gpa4)}</span>`;

    let mobileStatsHtml = renderPeriodStatsHTML(stats, period.subjects.length);
    if (average) mobileStatsHtml += `<span class="sm:hidden text-[10px] font-bold text-slate-500 ml-2">Prom: ${escapeHtml(average)}</span>`;
    if (gpa4) mobileStatsHtml += `<span class="sm:hidden text-[10px] font-bold text-slate-500 ml-1">&bull; GPA: ${escapeHtml(gpa4)}</span>`;

    return `<div onclick="togglePeriod(${periodIndex})" class="px-3 sm:px-5 py-3 sm:py-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all select-none flex items-center justify-between group"><div class="flex items-center gap-2 sm:gap-4 flex-1 min-w-0"><div class="shrink-0 w-8 h-8 sm:w-10 sm:h-10 ${statusColor} text-white rounded-lg sm:rounded-xl flex items-center justify-center font-black text-xs sm:text-sm shadow-lg transition-colors duration-500">${safePeriodNumber}</div><div class="flex-1 min-w-0"><div class="flex items-center gap-2 mb-0.5 sm:mb-1"><h3 class="font-bold text-slate-900 dark:text-white text-xs sm:text-sm truncate">${safePeriodName}</h3>${badgesHtml}</div><div id="period-header-stats-${periodIndex}" class="flex items-center gap-3">${mobileStatsHtml}</div></div></div><i class="fas fa-chevron-down text-slate-300 dark:text-slate-600 transition-transform duration-300 ${open ? 'rotate-180' : ''} group-hover:text-slate-400 dark:group-hover:text-slate-500"></i></div><div class="collapsible-content ${open ? 'open' : ''}"><div class="px-2 sm:px-3 pb-2 sm:pb-3 space-y-1.5 sm:space-y-2 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-800/50">${visibleSubjects.map((subject) => renderSubject(subject, period.period_number)).join('')}</div></div>`;
  }

  global.StudyTrackPeriods = {
    getVisibleSubjects,
    isPeriodOpen,
    renderPeriodCardHTML,
    renderPeriodStatsHTML,
    subjectMatchesFilter
  };
})(typeof window !== 'undefined' ? window : globalThis);
