(function (global) {
  function normalizeRequirements(requirements) {
    return Array.isArray(requirements)
      ? requirements.map((requirement) => ({
        id: requirement.id,
        name: String(requirement.name ?? '').trim(),
        completed: Boolean(requirement.completed)
      })).filter((requirement) => requirement.name)
      : [];
  }

  function getRequirementStats(requirements) {
    const normalized = normalizeRequirements(requirements);
    const total = normalized.length;
    const completed = normalized.filter((requirement) => requirement.completed).length;
    return {
      total,
      completed,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0
    };
  }

  function addRequirement(requirements, name, idFactory = () => `req-${Date.now()}`) {
    const trimmedName = String(name ?? '').trim();
    const nextRequirements = normalizeRequirements(requirements);
    if (!trimmedName) return { requirements: nextRequirements, changed: false };

    const requirement = {
      id: idFactory(),
      name: trimmedName,
      completed: false
    };

    return {
      requirements: [...nextRequirements, requirement],
      changed: true,
      requirement
    };
  }

  function toggleRequirement(requirements, index) {
    const nextRequirements = normalizeRequirements(requirements);
    if (!Number.isInteger(index) || index < 0 || index >= nextRequirements.length) {
      return { requirements: nextRequirements, changed: false };
    }

    nextRequirements[index] = {
      ...nextRequirements[index],
      completed: !nextRequirements[index].completed
    };

    return { requirements: nextRequirements, changed: true };
  }

  function deleteRequirement(requirements, index) {
    const nextRequirements = normalizeRequirements(requirements);
    if (!Number.isInteger(index) || index < 0 || index >= nextRequirements.length) {
      return { requirements: nextRequirements, changed: false };
    }

    return {
      requirements: nextRequirements.filter((_requirement, currentIndex) => currentIndex !== index),
      changed: true
    };
  }

  function renderRequirementsWidgetHTML(requirements, { expanded = true, escapeHtml = String } = {}) {
    const normalized = normalizeRequirements(requirements);
    if (normalized.length === 0) {
      return '<div class="text-xs text-slate-400 text-center italic">Sin requisitos</div>';
    }

    const stats = getRequirementStats(normalized);
    const header = `
                <div class="flex items-center justify-between mb-3 cursor-pointer select-none group" onclick="toggleRequirementsWidget()">
                    <div class="flex items-center gap-2">
                        <h3 class="text-xs font-bold uppercase text-slate-400 dark:text-slate-500">Requisitos de Grado</h3>
                        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">${stats.completed}/${stats.total}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="h-1.5 w-16 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div class="h-full bg-emerald-500 transition-all duration-500" style="width: ${stats.percentage}%"></div>
                        </div>
                        <i class="fas fa-chevron-down text-slate-400 transition-transform duration-300 ${!expanded ? '-rotate-90' : ''} group-hover:text-slate-600 dark:group-hover:text-slate-300"></i>
                    </div>
                </div>
            `;

    const content = expanded ? `
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-fade-in">
                    ${normalized.map((requirement) => `
                        <div class="flex items-center gap-3 p-2 rounded-lg border border-transparent ${requirement.completed ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-900/30' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800'}">
                            <div class="shrink-0 text-lg">
                                ${requirement.completed ? '<i class="fas fa-check-circle text-emerald-500"></i>' : '<i class="fas fa-circle text-slate-200 dark:text-slate-700"></i>'}
                            </div>
                            <span class="text-sm font-medium leading-tight ${requirement.completed ? 'text-emerald-900 dark:text-emerald-200' : 'text-slate-600 dark:text-slate-400'}">${escapeHtml(requirement.name)}</span>
                        </div>
                    `).join('')}
                </div>
            ` : '';

    return header + content;
  }

  function renderSettingsRequirementsHTML(requirements, { escapeHtml = String } = {}) {
    return normalizeRequirements(requirements).map((requirement, index) => `<div class="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 group"><input type="checkbox" ${requirement.completed ? 'checked' : ''} onchange="toggleRequirement(${index})" class="shrink-0 cursor-pointer"><div class="flex-1 font-medium text-sm text-slate-900 dark:text-white">${escapeHtml(requirement.name)}</div><button onclick="deleteRequirement(${index})" class="text-slate-400 hover:text-red-500 p-2 opacity-0 group-hover:opacity-100 transition-opacity"><i class="fas fa-trash-alt"></i></button></div>`).join('');
  }

  global.StudyTrackRequirements = {
    normalizeRequirements,
    getRequirementStats,
    addRequirement,
    toggleRequirement,
    deleteRequirement,
    renderRequirementsWidgetHTML,
    renderSettingsRequirementsHTML
  };
})(typeof window !== 'undefined' ? window : globalThis);
