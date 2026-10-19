(function (global) {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const CALENDAR_PATH = '/calendar/export_execute.php';
  const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

  function unescapeText(value) {
    return String(value).replace(/\\(.)/g, (_, ch) => (ch === 'n' || ch === 'N' ? '\n' : ch));
  }

  function unfoldLines(text) {
    const lines = [];
    for (const raw of text.split(/\r?\n/)) {
      if ((raw.startsWith(' ') || raw.startsWith('\t')) && lines.length > 0) {
        lines[lines.length - 1] += raw.slice(1);
      } else {
        lines.push(raw);
      }
    }
    return lines;
  }

  function parseDateValue(value, params) {
    const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
    if (dateOnly || /VALUE=DATE(\b|;|$)/i.test(params)) {
      const match = dateOnly || /^(\d{4})(\d{2})(\d{2})/.exec(value);
      if (!match) return null;
      return { start: `${match[1]}-${match[2]}-${match[3]}`, allDay: true };
    }
    const timed = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(value);
    if (!timed) return null;
    const [, y, mo, d, h, mi, s] = timed;
    return { start: `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`, allDay: false };
  }

  function parseIcs(text) {
    const source = String(text ?? '').replace(/^﻿/, '').trimStart();
    if (!source.startsWith('BEGIN:VCALENDAR')) return { ok: false, error: 'not-calendar' };

    const events = [];
    let current = null;

    for (const line of unfoldLines(source)) {
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const head = line.slice(0, colon);
      const value = line.slice(colon + 1);
      const semi = head.indexOf(';');
      const name = (semi < 0 ? head : head.slice(0, semi)).toUpperCase();
      const params = semi < 0 ? '' : head.slice(semi + 1);

      if (name === 'BEGIN' && value.toUpperCase() === 'VEVENT') {
        current = { uid: '', summary: '', start: null, allDay: false, categories: [] };
      } else if (name === 'END' && value.toUpperCase() === 'VEVENT') {
        if (current && current.start !== null) events.push(current);
        current = null;
      } else if (current) {
        if (name === 'UID') current.uid = unescapeText(value);
        else if (name === 'SUMMARY') current.summary = unescapeText(value);
        else if (name === 'DTSTART') {
          const parsed = parseDateValue(value.trim(), params);
          if (parsed) {
            current.start = parsed.start;
            current.allDay = parsed.allDay;
          }
        } else if (name === 'CATEGORIES') {
          for (const item of value.split(/(?<!\\),/)) {
            const category = unescapeText(item).trim();
            if (category) current.categories.push(category);
          }
        }
      }
    }

    return { ok: true, events };
  }

  function courseCodeFromCategory(category) {
    if (!category) return null;
    for (const segment of String(category).split('-')) {
      if (/^[A-Za-z]+\d+$/.test(segment.trim())) return segment.trim().toUpperCase();
    }
    return null;
  }

  function normalizeCode(value) {
    return String(value ?? '').replace(/[-\s]/g, '').toUpperCase();
  }

  function buildSubjectIndex(curriculum) {
    const index = new Map();
    const periods = Array.isArray(curriculum?.periods) ? curriculum.periods : [];
    for (const period of periods) {
      for (const subject of Array.isArray(period?.subjects) ? period.subjects : []) {
        for (const key of [subject.code, subject.id]) {
          const normalized = normalizeCode(key);
          if (normalized && !index.has(normalized)) index.set(normalized, subject.id);
        }
      }
    }
    return index;
  }

  function toMs(value) {
    return value instanceof Date ? value.getTime() : Date.parse(value);
  }

  function mergeStoredEvents(stored, fresh, now) {
    const nowMs = toMs(now);
    const seen = new Set();
    const merged = [];

    // Fresh download first: the first occurrence of a uid wins, and it replaces any stored copy.
    for (const event of Array.isArray(fresh) ? fresh : []) {
      if (!event || seen.has(event.uid)) continue;
      seen.add(event.uid);
      merged.push(event);
    }

    // Stored events missing from the download survive only if they are already past.
    for (const event of Array.isArray(stored) ? stored : []) {
      if (!event || seen.has(event.uid)) continue;
      seen.add(event.uid);
      if (toMs(event.start) < nowMs) merged.push(event);
    }

    return merged.sort((a, b) => toMs(a.start) - toMs(b.start));
  }

  function toUniEvents(parsedEvents, curriculum) {
    const index = buildSubjectIndex(curriculum);
    const seen = new Set();
    const result = [];

    for (const event of Array.isArray(parsedEvents) ? parsedEvents : []) {
      if (!event || seen.has(event.uid)) continue;
      seen.add(event.uid);

      let courseCode = null;
      for (const category of event.categories || []) {
        courseCode = courseCodeFromCategory(category);
        if (courseCode) break;
      }
      const subjectId = courseCode ? (index.get(normalizeCode(courseCode)) ?? null) : null;

      result.push({
        uid: event.uid,
        title: String(event.summary || '').replace(/^Vencimiento de /, ''),
        dueAt: event.start,
        allDay: Boolean(event.allDay),
        courseCode,
        subjectId
      });
    }

    return result.sort((a, b) => toMs(a.dueAt) - toMs(b.dueAt));
  }

  function isOverdue(event, now) {
    return toMs(now) > toMs(event.dueAt);
  }

  function isVisible(event, now) {
    return toMs(now) <= toMs(event.dueAt) + WEEK_MS;
  }

  function upcoming(events, now) {
    return (events || [])
      .filter((event) => isVisible(event, now))
      .sort((a, b) => toMs(a.dueAt) - toMs(b.dueAt));
  }

  function nextForSubject(events, subjectId, now) {
    const candidates = (events || [])
      .filter((event) => event.subjectId === subjectId && !isOverdue(event, now))
      .sort((a, b) => toMs(a.dueAt) - toMs(b.dueAt));
    return candidates[0] ?? null;
  }

  function dayKey(iso, timeZone) {
    const value = String(iso);
    if (DATE_ONLY.test(value)) return value;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    const pick = (type) => parts.find((part) => part.type === type).value;
    return `${pick('year')}-${pick('month')}-${pick('day')}`;
  }

  function eventsByDay(events, year, month, timeZone) {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const byDay = {};

    for (const event of events || []) {
      const key = dayKey(event.dueAt, timeZone);
      if (!key || !key.startsWith(prefix)) continue;
      (byDay[key] ||= []).push(event);
    }

    return byDay;
  }

  function validCalendarUrl(url) {
    // Plain pattern instead of the URL class, which is not available in every JS context.
    const match = /^https:\/\/[^/?#\s]+(\/[^?#]*)(?:\?[^#]*)?(?:#.*)?$/.exec(String(url ?? ''));
    return Boolean(match) && match[1] === CALENDAR_PATH;
  }

  function calendarRangeUrls(url) {
    const text = String(url ?? '');
    const hashAt = text.indexOf('#');
    const base = hashAt < 0 ? text : text.slice(0, hashAt);
    const fragment = hashAt < 0 ? '' : text.slice(hashAt);

    const withPreset = (value) => {
      if (/([?&])preset_time=[^&]*/.test(base)) {
        return base.replace(/([?&])preset_time=[^&]*/g, `$1preset_time=${value}`) + fragment;
      }
      const separator = base.includes('?') ? '&' : '?';
      return `${base}${separator}preset_time=${value}${fragment}`;
    };

    return { upcoming: withPreset('recentupcoming'), past: withPreset('custom') };
  }

  async function fetchText(fetchImpl, url) {
    let response;
    try {
      response = await fetchImpl(url);
    } catch {
      return { error: 'network' };
    }
    if (!response.ok) return { error: `http-${response.status}` };
    try {
      return { text: await response.text() };
    } catch {
      return { error: 'network' };
    }
  }

  async function loadCalendarText(url, { fetchImpl = fetch, proxyUrl } = {}) {
    if (!validCalendarUrl(url)) return { ok: false, error: 'invalid-url' };

    let result = await fetchText(fetchImpl, url);
    let via = 'direct';

    if (result.error === 'network' && proxyUrl) {
      result = await fetchText(fetchImpl, `${proxyUrl}?url=${encodeURIComponent(url)}`);
      via = 'proxy';
    }

    if (result.error) return { ok: false, error: result.error };
    if (!result.text.trimStart().startsWith('BEGIN:VCALENDAR')) return { ok: false, error: 'not-calendar' };
    return { ok: true, text: result.text, via };
  }

  global.StudyTrackUniEvents = {
    parseIcs,
    courseCodeFromCategory,
    toUniEvents,
    isOverdue,
    isVisible,
    upcoming,
    nextForSubject,
    dayKey,
    eventsByDay,
    loadCalendarText,
    calendarRangeUrls,
    mergeStoredEvents
  };
})(typeof window !== 'undefined' ? window : globalThis);
