(function (global) {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
  const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const TIME_PRESET = /([?&]preset_time=)custom(?=&|#|$)/;

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function toMs(value) {
    return value instanceof Date ? value.getTime() : Date.parse(value);
  }

  function toIso(value) {
    return value instanceof Date ? value.toISOString() : String(value);
  }

  function parseKey(key) {
    const [year, month, day] = String(key).split('-').map(Number);
    return { year, month, day };
  }

  // Index of the calendar day, so two keys can be subtracted without time zone effects.
  function dayIndex(key) {
    const { year, month, day } = parseKey(key);
    return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
  }

  function shortDate(key) {
    const { year, month, day } = parseKey(key);
    const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
    return `${weekday} ${day} ${MONTHS[month - 1]}`;
  }

  function clockTime(iso, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date(toMs(iso)));
    const pick = (type) => parts.find((part) => part.type === type).value;
    const hour = Number(pick('hour')) % 24;
    const minute = pick('minute');
    return `${hour % 12 || 12}:${minute} ${hour < 12 ? 'AM' : 'PM'}`;
  }

  function dayKeyOf(iso, timeZone) {
    return global.StudyTrackUniEvents.dayKey(toIso(iso), timeZone);
  }

  function describeDue(event, now, timeZone) {
    const U = global.StudyTrackUniEvents;
    const nowIso = toIso(now);
    const dueKey = dayKeyOf(event.dueAt, timeZone);
    const nowKey = dayKeyOf(nowIso, timeZone);
    const diff = dayIndex(dueKey) - dayIndex(nowKey);
    const overdue = event.allDay ? diff < 0 : U.isOverdue({ dueAt: event.dueAt }, nowIso);

    let relative;
    if (overdue) {
      const ago = -diff;
      if (ago === 0) relative = 'Venció hoy';
      else if (ago === 1) relative = 'Venció ayer';
      else relative = `Venció hace ${ago} días`;
    } else if (diff === 0) {
      relative = 'Hoy';
    } else if (diff === 1) {
      relative = 'Mañana';
    } else {
      relative = `En ${diff} días`;
    }

    let tone;
    if (overdue) tone = 'overdue';
    else if (diff === 0 || diff === 1) tone = 'soon';
    else tone = 'later';

    const absolute = event.allDay
      ? shortDate(dueKey)
      : `${shortDate(dueKey)} · ${clockTime(event.dueAt, timeZone)}`;

    return { relative, absolute, tone };
  }

  function buildMonthGrid(year, month, todayKey) {
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const leading = (firstWeekday + 6) % 7; // Monday first
    const cells = [];

    for (let i = 0; i < leading; i++) cells.push({ key: null, day: null, isToday: false });
    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${year}-${pad2(month)}-${pad2(day)}`;
      cells.push({ key, day, isToday: key === todayKey });
    }
    while (cells.length % 7 !== 0) cells.push({ key: null, day: null, isToday: false });

    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }

  function shiftMonth(year, month, delta) {
    const total = year * 12 + (month - 1) + delta;
    const shiftedYear = Math.floor(total / 12);
    const shiftedMonth = ((total % 12) + 12) % 12 + 1;
    return { year: shiftedYear, month: shiftedMonth };
  }

  function normalizeCalendarUrl(url) {
    const text = url === null || url === undefined ? '' : String(url).trim();
    return text.replace(TIME_PRESET, '$1recentupcoming');
  }

  function errorMessage(code) {
    if (code === 'invalid-url') {
      return 'El enlace debe ser un enlace de exportación de Moodle que contenga export_execute.php.';
    }
    if (code === 'http-401' || code === 'http-403' || code === 'not-calendar') {
      return 'La universidad no aceptó el enlace o no devolvió un calendario. Genera un enlace nuevo en Moodle (Calendario → Exportar calendario).';
    }
    if (code === 'network') {
      return 'No se pudo conectar con la universidad. Revisa tu conexión a internet e intenta de nuevo.';
    }
    const http = /^http-(\d+)$/.exec(String(code ?? ''));
    if (http) {
      return `La universidad respondió con un error (${http[1]}). Intenta más tarde.`;
    }
    return 'No se pudo actualizar el calendario. Intenta de nuevo.';
  }

  function statusLine(meta, now, timeZone) {
    if (meta === null || meta === undefined) return 'Aún no se ha actualizado';

    const sameDay = dayKeyOf(meta.fetchedAt, timeZone) === dayKeyOf(now, timeZone);
    const when = sameDay ? 'hoy' : shortDate(dayKeyOf(meta.fetchedAt, timeZone));
    const time = clockTime(meta.fetchedAt, timeZone);
    const count = Number(meta.count);
    const noun = count === 1 ? 'entrega' : 'entregas';
    return `Actualizado ${when} · ${time} · ${count} ${noun}`;
  }

  global.StudyTrackUniEventsView = {
    describeDue,
    buildMonthGrid,
    shiftMonth,
    normalizeCalendarUrl,
    errorMessage,
    statusLine
  };
})(typeof window !== 'undefined' ? window : globalThis);
