(function (global) {
  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function escapeJsString(value) {
    return escapeHtml(String(value ?? '')
      .replaceAll('\\', '\\\\')
      .replaceAll("'", "\\'")
      .replaceAll('\n', '\\n')
      .replaceAll('\r', '\\r')
      .replaceAll('\u2028', '\\u2028')
      .replaceAll('\u2029', '\\u2029'));
  }

  function sanitizeCssClasses(value) {
    return String(value ?? '')
      .split(/\s+/)
      .filter((token) => /^[A-Za-z0-9_:/.[\]%-]+$/.test(token))
      .join(' ');
  }

  global.StudyTrackSanitize = {
    escapeHtml,
    escapeJsString,
    sanitizeCssClasses
  };
})(typeof window !== 'undefined' ? window : globalThis);
