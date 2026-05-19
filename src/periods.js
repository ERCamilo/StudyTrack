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
    const total = Number(totalSubjects) || 0;
    const completed = Math.max(0, Number(stats.completed) || 0);
    const percentage = total > 0
      ? Math.max(0, Math.min(100, Number(stats.completionPercentage) || 0))
      : 0;

    return `<div class="period-progress flex items-center gap-2 min-w-0"><div class="h-1.5 flex-1 min-w-16 max-w-24 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden"><div class="h-full bg-emerald-500 transition-all duration-500" style="width: ${percentage}%"></div></div><span class="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-bold whitespace-nowrap">${completed}/${total}</span><span class="sm:hidden text-[10px] text-slate-400 dark:text-slate-500 font-bold whitespace-nowrap">${Math.round(percentage)}%</span></div>`;
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
    const mobileMetrics = [];
    if (average) mobileMetrics.push(`<span class="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300"><i class="fas fa-chart-line text-[8px] text-slate-400"></i>${escapeHtml(average)}</span>`);
    if (gpa4) mobileMetrics.push(`<span class="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300"><i class="fas fa-star text-[8px] text-slate-400"></i>${escapeHtml(gpa4)}</span>`);
    if (mobileMetrics.length) mobileStatsHtml += `<div class="period-mobile-metrics sm:hidden flex items-center gap-1 mt-1">${mobileMetrics.join('')}</div>`;

    return `<div onclick="togglePeriod(${periodIndex})" class="px-3 sm:px-5 py-3 sm:py-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all select-none flex items-center justify-between group"><div class="flex items-center gap-2 sm:gap-4 flex-1 min-w-0"><div class="shrink-0 w-8 h-8 sm:w-10 sm:h-10 ${statusColor} text-white rounded-lg sm:rounded-xl flex items-center justify-center font-black text-xs sm:text-sm shadow-lg transition-colors duration-500">${safePeriodNumber}</div><div class="flex-1 min-w-0"><div class="flex items-center gap-2 mb-0.5 sm:mb-1"><h3 class="font-bold text-slate-900 dark:text-white text-xs sm:text-sm truncate">${safePeriodName}</h3>${badgesHtml}</div><div id="period-header-stats-${periodIndex}" class="period-header-stats flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">${mobileStatsHtml}</div></div></div><i class="fas fa-chevron-down text-slate-300 dark:text-slate-600 transition-transform duration-300 ${open ? 'rotate-180' : ''} group-hover:text-slate-400 dark:group-hover:text-slate-500"></i></div><div class="collapsible-content ${open ? 'open' : ''}"><div class="px-2 sm:px-3 pb-2 sm:pb-3 space-y-1.5 sm:space-y-2 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-800/50">${visibleSubjects.map((subject) => renderSubject(subject, period.period_number)).join('')}</div></div>`;
  }

  global.StudyTrackPeriods = {
    getVisibleSubjects,
    isPeriodOpen,
    renderPeriodCardHTML,
    renderPeriodStatsHTML,
    subjectMatchesFilter
  };
})(typeof window !== 'undefined' ? window : globalThis);
