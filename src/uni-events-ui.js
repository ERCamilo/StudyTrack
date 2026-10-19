(function (global) {
  // Pure HTML templates for the university-events UI (home list, month calendar, day list).
  // No DOM reads or global state: data comes in as plain objects and the HTML helpers are
  // injected by the caller, like src/cards.js and src/schedule.js.

  const WEEKDAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function defaults(helpers = {}) {
    const escapeHtml = helpers.escapeHtml || String;
    const actionArgs = helpers.actionArgs || ((...args) => escapeHtml(JSON.stringify(args)));
    return { escapeHtml, actionArgs };
  }

  function monthLabel(year, month) {
    return `${MONTH_NAMES[month - 1]} ${year}`;
  }

  /**
   * One row: tone chip ("Hoy", "Mañana", "Venció ayer"…), title, and "subject · date".
   * @param {{event: object, due: {relative: string, absolute: string, tone: string}, subjectName: string|null}} item
   */
  function eventRowHTML(item, helpers, { action = null, args = [] } = {}) {
    const { escapeHtml, actionArgs } = helpers;
    const { event, due, subjectName } = item;
    const who = subjectName || event.courseCode || 'General';
    const tag = action ? 'button' : 'div';
    const actionAttrs = action ? ` type="button" data-action="${escapeHtml(action)}" data-args="${actionArgs(...args)}"` : '';
    return `<${tag}${actionAttrs} class="stk-due-row${action ? ' stk-due-row--action' : ''}">
      <span class="stk-due-text">
        <span class="stk-due-title">${escapeHtml(event.title)}</span>
        <span class="stk-due-meta">${escapeHtml(who)} · ${escapeHtml(due.absolute)}</span>
      </span>
      <span class="stk-due-chip stk-due-chip--${escapeHtml(due.tone)}">${escapeHtml(due.relative)}</span>
    </${tag}>`;
  }

  /** Home "Próximas entregas": at most `limit` rows; each opens the calendar on its day. */
  function renderUpcomingList(items, helpers = {}, { limit = 5 } = {}) {
    const resolved = defaults(helpers);
    if (!items.length) {
      return `<div class="stk-due-empty"><i class="fas fa-mug-hot"></i>Sin entregas en los próximos días.</div>`;
    }
    return items.slice(0, limit)
      .map((item) => eventRowHTML(item, resolved, { action: 'openUniCalendarDay', args: [item.dayKey] }))
      .join('');
  }

  /**
   * Month grid. `grid` comes from StudyTrackUniEventsView.buildMonthGrid; `tonesByDay` maps
   * 'YYYY-MM-DD' to the list of tones of that day's events (one dot each, at most 3).
   */
  function renderMonthCalendar(grid, tonesByDay, selectedKey, helpers = {}) {
    const { escapeHtml, actionArgs } = defaults(helpers);
    const head = WEEKDAY_LETTERS.map((letter) => `<div class="stk-cal-head">${letter}</div>`).join('');
    const cells = grid.flat().map((cell) => {
      if (!cell.key) return '<div class="stk-cal-cell stk-cal-cell--blank"></div>';
      const tones = tonesByDay[cell.key] || [];
      const classes = ['stk-cal-cell'];
      if (cell.isToday) classes.push('stk-cal-cell--today');
      if (cell.key === selectedKey) classes.push('stk-cal-cell--selected');
      if (tones.length) classes.push('stk-cal-cell--has');
      const dots = tones.slice(0, 3).map((tone) => `<span class="stk-cal-dot stk-cal-dot--${escapeHtml(tone)}"></span>`).join('');
      const label = `${cell.day}${tones.length ? `, ${tones.length} ${tones.length === 1 ? 'entrega' : 'entregas'}` : ''}`;
      return `<button type="button" class="${classes.join(' ')}" aria-label="${escapeHtml(label)}" aria-pressed="${cell.key === selectedKey}" data-action="selectUniCalendarDay" data-args="${actionArgs(cell.key)}"><span class="stk-cal-num">${cell.day}</span><span class="stk-cal-dots">${dots}</span></button>`;
    }).join('');
    return `<div class="stk-cal-grid">${head}${cells}</div>`;
  }

  /** Events of the selected day, under the month grid. */
  function renderDayList(items, dayLabel, helpers = {}) {
    const resolved = defaults(helpers);
    const { escapeHtml } = resolved;
    const body = items.length
      ? items.map((item) => eventRowHTML(item, resolved)).join('')
      : '<div class="stk-due-empty stk-due-empty--compact">Sin entregas este día.</div>';
    return `<div class="stk-sched-eyebrow">${escapeHtml(dayLabel)}</div><div class="stk-due-list">${body}</div>`;
  }

  global.StudyTrackUniEventsUI = {
    monthLabel,
    renderUpcomingList,
    renderMonthCalendar,
    renderDayList
  };
})(typeof window !== 'undefined' ? window : globalThis);
