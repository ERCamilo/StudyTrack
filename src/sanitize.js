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

  // Serializes handler arguments into a CSP-safe `data-args` attribute value:
  // JSON (handles quotes/types) then HTML-escaped for the attribute context. The
  // delegated dispatcher JSON.parses it back. Tokens "$value"/"$this"/"$event"
  // are resolved at dispatch time.
  function actionArgs(...args) {
    return escapeHtml(JSON.stringify(args));
  }

  global.StudyTrackSanitize = {
    escapeHtml,
    escapeJsString,
    sanitizeCssClasses,
    actionArgs
  };
})(typeof window !== 'undefined' ? window : globalThis);
