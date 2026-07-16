(function (global) {
  const KEYS = {
    curriculum: 'studytrack_curriculum_v8',
    progress: 'studytrack_progress_v8',
    libraryCache: 'studytrack_library_v4',
    darkMode: 'dark-mode',
    collapsedPeriods: 'collapsed_periods',
    allowSkipPrerequisites: 'allow_skip_prereqs',
    maxEnrolledSubjects: 'max_enrolled_subjects',
    gradeScale: 'grade_scale',
    passingGrade: 'passing_grade',
    schedule: 'studytrack_schedule_v1',
    scheduleViewType: 'schedule_view_type',
    studentName: 'studytrack_student_name',
    studentPhoto: 'studytrack_student_photo',
    studentId: 'studytrack_student_id',
    studentGoal: 'studytrack_student_goal',
    studentStatus: 'studytrack_student_status',
    milestones: 'studytrack_milestones',
    carneVariant: 'studytrack_carne_variant'
  };

  function getStorage() {
    try {
      return global.localStorage || null;
    } catch {
      return null;
    }
  }

  function getItem(key) {
    const storage = getStorage();
    if (!storage) return null;

    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  }

  function setItem(key, value) {
    const storage = getStorage();
    if (!storage) return false;

    try {
      storage.setItem(key, String(value));
      return true;
    } catch {
      return false;
    }
  }

  function getJson(key, fallback = null) {
    const raw = getItem(key);
    if (raw === null || raw === '') return fallback;

    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function setJson(key, value) {
    return setItem(key, JSON.stringify(value));
  }

  function getBoolean(key, fallback = false) {
    const raw = getItem(key);
    if (raw === null) return fallback;
    return raw === 'true';
  }

  function setBoolean(key, value) {
    return setItem(key, Boolean(value));
  }

  function getNumber(key, fallback = 0) {
    const raw = getItem(key);
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : fallback;
  }

  function getFloat(key, fallback = 0) {
    const raw = getItem(key);
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : fallback;
  }

  function setNumber(key, value) {
    return setItem(key, value);
  }

  function clearAll() {
    const storage = getStorage();
    if (!storage) return false;

    try {
      storage.clear();
      return true;
    } catch {
      return false;
    }
  }

  global.StudyTrackStorage = {
    KEYS,
    clearAll,
    getBoolean,
    getFloat,
    getItem,
    getJson,
    getNumber,
    setBoolean,
    setItem,
    setJson,
    setNumber
  };
})(typeof window !== 'undefined' ? window : globalThis);
