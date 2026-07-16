(function (global) {
  const DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
  const DAY_NAMES = { domingo: 'Dom', lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', jueves: 'Jue', viernes: 'Vie', sabado: 'Sáb' };
  // Single-letter day markers for the weekly rail (día circle), following the
  // Spanish convention where "X" stands in for miércoles since "M" is martes.
  const DAY_LETTERS = { lunes: 'L', martes: 'M', miercoles: 'X', jueves: 'J', viernes: 'V', sabado: 'S', domingo: 'D' };
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
      const colorClass = getSubjectColor(subject.id, index);
      const blocksHtml = blocks.map((block) => `<button type="button" class="stk-sched-chip" data-action="showBlockDetails" data-args="${actionArgs(subject.id, block.id)}">${escapeHtml(DAY_NAMES[block.day])} ${escapeHtml(formatTime12h(block.startTime))}-${escapeHtml(formatTime12h(block.endTime))}</button>`).join(' ');

      return `<div class="schedule-subject-row stk-sched-row flex-col sm:flex-row items-start sm:items-center"><div class="flex items-center gap-3 flex-1 min-w-0"><div class="stk-sched-icon ${colorClass}">${safeSubjectCodePrefix}</div><div class="flex-1 min-w-0"><h4 class="font-bold text-slate-900 dark:text-white text-sm truncate">${safeSubjectName}</h4><div class="flex flex-wrap items-center gap-2 mt-1">${blocksHtml || '<span class="stk-sched-chip stk-sched-chip--warn"><i class="fas fa-clock"></i>Sin horario asignado</span>'}</div></div></div><button data-action="openScheduleModal" data-args="${actionArgs(subject.id, subject.name, null)}" class="stk-press stk-sched-add-btn w-full sm:w-auto"><i class="fas fa-plus"></i>Agregar Bloque</button></div>`;
    }).join('');
  }

  function renderWeeklyScheduleHTML(blocks, { escapeHtml = String, escapeJsString = String, actionArgs = (...a) => escapeHtml(JSON.stringify(a)) } = {}) {
    const byDay = groupBlocksByDay(blocks);

    const rows = DAYS.map((day) => {
      const dayBlocks = byDay[day];
      const hasClass = dayBlocks.length > 0;
      const dayLabel = escapeHtml(DAY_LETTERS[day] || DAY_NAMES[day].charAt(0));
      const content = hasClass
        ? dayBlocks.map((block) => `<button type="button" class="stk-class-block ${block.color}" data-action="showBlockDetails" data-args="${actionArgs(block.subject.id, block.id)}"><div class="stk-class-block-title">${escapeHtml(block.subject.name)}</div><div class="stk-class-block-meta"><i class="fas fa-clock"></i>${escapeHtml(formatTime12h(block.startTime))} - ${escapeHtml(formatTime12h(block.endTime))}${block.room ? ' &bull; ' + escapeHtml(block.room) : ''}</div></button>`).join('')
        : `<div class="stk-day-empty">Sin clases</div>`;

      return `<div class="stk-day-row"><div class="stk-day-col"><div class="stk-day-circle${hasClass ? ' stk-day-circle--active' : ''}">${dayLabel}</div></div><div class="stk-day-blocks">${content}</div></div>`;
    }).join('');

    return `<div class="stk-week-rail">${rows}</div>`;
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
    // Header day cells are positioned with the SAME calc as the blocks below, so a
    // block is guaranteed to sit under its day label (no flex-vs-calc drift).
    const dayHeaderCells = DAYS.map((day, i) => `<div class="absolute top-0 h-full flex items-center justify-center stk-sched-table-head" style="left: calc(${timeColWidth}px + (100% - ${timeColWidth}px) * ${i} / 7); width: calc((100% - ${timeColWidth}px) / 7); border-right:1px solid var(--stk-hairline);">${escapeHtml(DAY_NAMES[day])}</div>`).join('');
    let html = `<div class="sticky top-0 w-full h-[${headerHeight}px] backdrop-blur font-bold text-xs z-30" style="border-bottom:1px solid var(--stk-hairline); background:var(--stk-surface-2);"><div class="absolute left-0 top-0 h-full w-[${timeColWidth}px] flex items-center justify-center" style="border-right:1px solid var(--stk-hairline); background:var(--stk-surface-2); color:var(--stk-text-2)"><i class="far fa-clock"></i></div>${dayHeaderCells}</div>`;

    for (let hour = minHour; hour < maxHour; hour++) {
      const timeLabel = escapeHtml(formatTime12h(`${hour}:00`));
      html += `<div class="absolute left-0 w-full flex" style="top:${headerHeight + (hour - minHour) * hourHeight}px; height:${hourHeight}px; border-bottom:1px solid var(--stk-hairline)"><div class="w-[${timeColWidth}px] shrink-0 flex items-start justify-center pt-1 text-[10px] stk-sched-table-time" style="border-right:1px solid var(--stk-hairline)">${timeLabel}</div><div class="flex-1"></div></div>`;
    }

    blocks.forEach((block) => {
      const dayIndex = DAYS.indexOf(block.day);
      if (dayIndex === -1) return;
      const startHour = timeToDecimal(block.startTime);
      const endHour = timeToDecimal(block.endTime);
      const top = headerHeight + (startHour - minHour) * hourHeight;
      const blockHeight = (endHour - startHour) * hourHeight;
      html += `<button type="button" class="absolute px-1 py-0.5 stk-grid-block ${block.color} text-white text-[10px] leading-tight overflow-hidden hover:z-20 hover:scale-[1.02] transition-all cursor-pointer flex flex-col justify-center text-left" style="top:${top + 2}px; height:${blockHeight - 4}px; left: calc(${timeColWidth}px + (100% - ${timeColWidth}px) * ${dayIndex} / 7); width: calc((100% - ${timeColWidth}px) / 7 - 4px); margin-left: 2px;" data-action="showBlockDetails" data-args="${actionArgs(block.subject.id, block.id)}"><div class="font-bold truncate">${escapeHtml(block.subject.name)}</div><div class="opacity-90 truncate">${escapeHtml(formatTime12h(block.startTime))} - ${escapeHtml(formatTime12h(block.endTime))}</div>${block.room ? `<div class="opacity-75 truncate text-[9px]">${escapeHtml(block.room)}</div>` : ''}</button>`;
    });

    return { html, height };
  }

  // Legend shown below the Tabla (grid) view: one color swatch per enrolled
  // subject that actually has a schedule, so per-subject colors used in the
  // grid blocks stay identifiable at a glance.
  function renderScheduleLegendHTML(enrolledSubjects, scheduleData, { escapeHtml = String } = {}) {
    return enrolledSubjects.map((subject, index) => {
      const blocks = scheduleData[subject.id] || [];
      if (blocks.length === 0) return '';
      const colorClass = getSubjectColor(subject.id, index);
      const schedText = blocks
        .map((block) => `${DAY_NAMES[block.day]} ${formatTime12h(block.startTime)}-${formatTime12h(block.endTime)}`)
        .join(', ');
      return `<div class="stk-sched-legend-row"><div class="stk-sched-legend-swatch ${colorClass}"></div><div class="stk-sched-legend-name">${escapeHtml(subject.name)} <span class="stk-sched-legend-meta">&middot; ${escapeHtml(schedText)}</span></div></div>`;
    }).join('');
  }

  global.StudyTrackSchedule = {
    DAYS,
    DAY_NAMES,
    DAY_LETTERS,
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
    renderScheduleLegendHTML,
    timeToDecimal,
    getVisualScheduleRange,
    renderVisualScheduleHTML
  };
})(typeof window !== 'undefined' ? window : globalThis);
