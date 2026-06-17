(function (global) {
  const DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
  const DAY_NAMES = { domingo: 'Dom', lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', jueves: 'Jue', viernes: 'Vie', sabado: 'Sáb' };
  const SUBJECT_COLORS = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-pink-500', 'bg-orange-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-rose-500'];

  function formatTime12h(time) {
    if (!time) return '';
    const [hourPart, minutePart = '00'] = String(time).split(':');
    let hour = Number.parseInt(hourPart, 10);
    if (!Number.isFinite(hour)) return '';
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour %= 12;
    return `${hour || 12}:${minutePart} ${ampm}`;
  }

  function getSubjectColor(_id, index) {
    return SUBJECT_COLORS[index % SUBJECT_COLORS.length];
  }

  function isValidTimeRange(start, end) {
    return Boolean(start && end && start < end);
  }

  function collectScheduleBlocks(enrolledSubjects, scheduleData) {
    const blocks = [];
    enrolledSubjects.forEach((subject, index) => {
      (scheduleData[subject.id] || []).forEach((block) => {
        blocks.push({ ...block, subject, color: getSubjectColor(subject.id, index) });
      });
    });
    return blocks;
  }

  function groupBlocksByDay(blocks) {
    const byDay = {};
    DAYS.forEach((day) => {
      byDay[day] = [];
    });
    blocks.forEach((block) => {
      if (byDay[block.day]) byDay[block.day].push(block);
    });
    DAYS.forEach((day) => {
      byDay[day].sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
    });
    return byDay;
  }

  function rangesOverlap(startA, endA, startB, endB) {
    // Compare numerically (not as strings) so non-zero-padded times like "8:00" work too.
    return timeToDecimal(startA) < timeToDecimal(endB) && timeToDecimal(endA) > timeToDecimal(startB);
  }

  function findScheduleConflict({ day, start, end, enrolledSubjects, scheduleData, excludeSubjectId = null, excludeBlockId = null }) {
    for (const subject of enrolledSubjects) {
      const blocks = scheduleData[subject.id] || [];
      for (const block of blocks) {
        if (excludeBlockId && excludeSubjectId === subject.id && block.id === excludeBlockId) continue;
        if (block.day === day && rangesOverlap(start, end, block.startTime, block.endTime)) {
          return {
            conflict: true,
            subject: subject.name,
            time: `${block.startTime} - ${block.endTime}`,
            block
          };
        }
      }
    }
    return { conflict: false };
  }

  function validateScheduleBlockOperation({ day, start, end, enrolledSubjects, scheduleData, excludeSubjectId = null, excludeBlockId = null }) {
    if (!isValidTimeRange(start, end)) {
      return { valid: false, reason: 'invalid-range' };
    }

    const conflict = findScheduleConflict({
      day,
      start,
      end,
      enrolledSubjects,
      scheduleData,
      excludeSubjectId,
      excludeBlockId
    });

    if (conflict.conflict) {
      return { valid: false, reason: 'conflict', conflict };
    }

    return { valid: true };
  }

  function cloneScheduleData(scheduleData) {
    const nextData = {};
    Object.entries(scheduleData || {}).forEach(([subjectId, blocks]) => {
      nextData[subjectId] = Array.isArray(blocks) ? blocks.map((block) => ({ ...block })) : [];
    });
    return nextData;
  }

  function upsertScheduleBlock(scheduleData, subjectId, block, existingBlockId = null) {
    const nextData = cloneScheduleData(scheduleData);
    const currentBlocks = nextData[subjectId] || [];
    const nextBlock = {
      id: existingBlockId || block.id,
      day: block.day,
      startTime: block.startTime,
      endTime: block.endTime,
      room: block.room || ''
    };

    if (existingBlockId) {
      const index = currentBlocks.findIndex((candidate) => candidate.id === existingBlockId);
      if (index === -1) return { scheduleData: nextData, changed: false };
      currentBlocks[index] = { ...currentBlocks[index], ...nextBlock };
    } else {
      currentBlocks.push(nextBlock);
    }

    nextData[subjectId] = currentBlocks;
    return { scheduleData: nextData, changed: true, block: nextBlock };
  }

  function deleteScheduleBlock(scheduleData, subjectId, blockId) {
    if (!scheduleData?.[subjectId]) return { scheduleData: cloneScheduleData(scheduleData), changed: false };

    const nextData = cloneScheduleData(scheduleData);
    const nextBlocks = nextData[subjectId].filter((block) => block.id !== blockId);
    const changed = nextBlocks.length !== nextData[subjectId].length;

    if (nextBlocks.length === 0) {
      delete nextData[subjectId];
    } else {
      nextData[subjectId] = nextBlocks;
    }

    return { scheduleData: nextData, changed };
  }

  function renderEnrolledScheduleHTML(enrolledSubjects, scheduleData, { escapeHtml = String, escapeJsString = String, actionArgs = (...a) => escapeHtml(JSON.stringify(a)) } = {}) {
    return enrolledSubjects.map((subject, index) => {
      const blocks = scheduleData[subject.id] || [];
      const subjectIdJs = escapeJsString(subject.id);
      const safeSubjectName = escapeHtml(subject.name);
      const safeSubjectCodePrefix = escapeHtml(String(subject.code ?? '').substring(0, 2));
      const blocksHtml = blocks.map((block) => `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors" data-action="showBlockDetails" data-args="${actionArgs(subject.id, block.id)}">${escapeHtml(DAY_NAMES[block.day])} ${escapeHtml(formatTime12h(block.startTime))}-${escapeHtml(formatTime12h(block.endTime))}</span>`).join(' ');

      return `<div class="schedule-subject-row stk-surface-card flex flex-col sm:flex-row sm:items-center gap-3 p-3"><div class="flex items-center gap-3 flex-1 min-w-0"><div class="w-8 h-8 ${getSubjectColor(subject.id, index)} rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0">${safeSubjectCodePrefix}</div><div class="flex-1 min-w-0"><h4 class="font-bold text-slate-900 dark:text-white text-sm truncate">${safeSubjectName}</h4><div class="flex flex-wrap items-center gap-2 mt-1">${blocksHtml || '<span class="text-[10px] text-amber-600 dark:text-amber-400 italic">Sin horario asignado</span>'}</div></div></div><button data-action="openScheduleModal" data-args="${actionArgs(subject.id, subject.name, null)}" class="stk-press w-full sm:w-auto text-xs px-3 py-2 sm:py-1.5 font-bold shrink-0" style="background:var(--stk-surface-2);color:var(--stk-text-1);border:none;border-radius:var(--stk-radius-sm)"><i class="fas fa-plus mr-1"></i>Agregar Bloque</button></div>`;
    }).join('');
  }

  function renderWeeklyScheduleHTML(blocks, { escapeHtml = String, escapeJsString = String, actionArgs = (...a) => escapeHtml(JSON.stringify(a)) } = {}) {
    const byDay = groupBlocksByDay(blocks);
    let html = '';

    DAYS.forEach((day) => {
      if (byDay[day].length === 0) return;
      html += `<div class="mb-4"><div class="flex items-center gap-2 mb-2"><span class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase w-12 text-center">${escapeHtml(DAY_NAMES[day])}</span><div class="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div></div><div class="space-y-2 pl-14">${byDay[day].map((block) => `<div class="flex items-center gap-3 p-3 rounded-xl ${block.color} text-white group cursor-pointer hover:scale-[1.01] transition-transform" data-action="showBlockDetails" data-args="${actionArgs(block.subject.id, block.id)}"><div class="flex-1"><div class="font-bold text-sm">${escapeHtml(block.subject.name)}</div><div class="text-xs opacity-80">${escapeHtml(formatTime12h(block.startTime))} - ${escapeHtml(formatTime12h(block.endTime))}${block.room ? ' &bull; ' + escapeHtml(block.room) : ''}</div></div><div class="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100"><i class="fas fa-search-plus text-[10px]"></i></div></div>`).join('')}</div></div>`;
    });

    return html;
  }

  function timeToDecimal(time) {
    const [hourPart, minutePart = '0'] = String(time || '').split(':');
    const hour = Number.parseInt(hourPart, 10);
    const minute = Number.parseInt(minutePart, 10);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
    return hour + minute / 60;
  }

  function getVisualScheduleRange(blocks) {
    const starts = blocks.map((block) => Number.parseInt(String(block.startTime).split(':')[0], 10)).filter(Number.isFinite);
    const ends = blocks.map((block) => {
      const endHour = Number.parseInt(String(block.endTime).split(':')[0], 10);
      return Number.isFinite(endHour) ? endHour + (String(block.endTime).includes(':30') ? 1 : 0) : null;
    }).filter(Number.isFinite);

    const minHour = Math.max(0, Math.min(24, ...starts) - 1);
    const maxHour = Math.min(24, Math.max(0, ...ends) + 1);
    return { minHour, maxHour };
  }

  function renderVisualScheduleHTML(blocks, { escapeHtml = String, escapeJsString = String, actionArgs = (...a) => escapeHtml(JSON.stringify(a)) } = {}) {
    const { minHour, maxHour } = getVisualScheduleRange(blocks);
    const hourHeight = 60;
    const headerHeight = 40;
    const timeColWidth = 65;
    const totalHours = maxHour - minHour;
    const height = headerHeight + (totalHours * hourHeight);
    let html = `<div class="sticky top-0 left-0 w-full h-[${headerHeight}px] flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/95 backdrop-blur shadow-sm font-bold text-xs text-slate-500 dark:text-slate-400 z-30"><div class="w-[${timeColWidth}px] shrink-0 border-r border-slate-200 dark:border-slate-700 flex items-center justify-center bg-slate-50 dark:bg-slate-800"><i class="far fa-clock"></i></div>${DAYS.map((day) => `<div class="flex-1 flex items-center justify-center border-r border-slate-200 dark:border-slate-700 last:border-0">${escapeHtml(DAY_NAMES[day])}</div>`).join('')}</div>`;

    for (let hour = minHour; hour < maxHour; hour++) {
      const timeLabel = escapeHtml(formatTime12h(`${hour}:00`));
      html += `<div class="absolute left-0 w-full flex border-b border-slate-100 dark:border-slate-800/50" style="top:${headerHeight + (hour - minHour) * hourHeight}px; height:${hourHeight}px"><div class="w-[${timeColWidth}px] shrink-0 flex items-start justify-center pt-1 text-[10px] text-slate-400 font-mono border-r border-slate-200 dark:border-slate-700">${timeLabel}</div><div class="flex-1"></div></div>`;
    }

    blocks.forEach((block) => {
      const dayIndex = DAYS.indexOf(block.day);
      if (dayIndex === -1) return;
      const startHour = timeToDecimal(block.startTime);
      const endHour = timeToDecimal(block.endTime);
      const top = headerHeight + (startHour - minHour) * hourHeight;
      const blockHeight = (endHour - startHour) * hourHeight;
      html += `<div class="absolute px-1 py-0.5 rounded-lg ${block.color} text-white text-[10px] leading-tight overflow-hidden shadow-sm hover:z-20 hover:scale-[1.02] transition-all cursor-pointer flex flex-col justify-center" style="top:${top + 2}px; height:${blockHeight - 4}px; left: calc(${timeColWidth}px + (100% - ${timeColWidth}px) * ${dayIndex} / 7); width: calc((100% - ${timeColWidth}px) / 7 - 4px); margin-left: 2px;" data-action="showBlockDetails" data-args="${actionArgs(block.subject.id, block.id)}"><div class="font-bold truncate">${escapeHtml(block.subject.name)}</div><div class="opacity-90 truncate">${escapeHtml(formatTime12h(block.startTime))} - ${escapeHtml(formatTime12h(block.endTime))}</div>${block.room ? `<div class="opacity-75 truncate text-[9px]">${escapeHtml(block.room)}</div>` : ''}</div>`;
    });

    return { html, height };
  }

  global.StudyTrackSchedule = {
    DAYS,
    DAY_NAMES,
    SUBJECT_COLORS,
    formatTime12h,
    getSubjectColor,
    isValidTimeRange,
    collectScheduleBlocks,
    groupBlocksByDay,
    rangesOverlap,
    findScheduleConflict,
    validateScheduleBlockOperation,
    cloneScheduleData,
    upsertScheduleBlock,
    deleteScheduleBlock,
    renderEnrolledScheduleHTML,
    renderWeeklyScheduleHTML,
    timeToDecimal,
    getVisualScheduleRange,
    renderVisualScheduleHTML
  };
})(typeof window !== 'undefined' ? window : globalThis);
