(function (global) {
  // Pure card model for sharing an academic student card over NFC.
  // This module is intentionally side-effect free: NO document, NO NDEFReader,
  // NO Date, NO innerHTML. All runtime/DOM concerns live in src/app.js so this
  // file stays unit-testable in plain Node.
  const CARD_TYPE = 'studytrack-card';
  const CARD_VERSION = 1;
  const MIME_TYPE = 'application/vnd.studytrack.card+json';
  // NFC NDEF tags are small; cap the serialized payload so we fail fast with a
  // clear message instead of letting the tag write reject cryptically.
  const MAX_PAYLOAD_BYTES = 480;

  function safeString(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  // Counts must always be a number; bad input degrades to 0 rather than NaN.
  function safeCount(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  // Optional numerics (average, gpa, creditsTotal) may legitimately be unknown.
  // Non-finite input becomes null so the reader can show a placeholder.
  function safeOptionalNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function round(value, decimals) {
    if (value === null) return null;
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }

  function buildStudentCard(input) {
    const source = input && typeof input === 'object' ? input : {};
    return {
      v: CARD_VERSION,
      t: CARD_TYPE,
      name: safeString(source.name),
      institution: safeString(source.institution),
      career: safeString(source.career),
      degree: safeString(source.degree),
      periodsTaken: safeCount(source.periodsTaken),
      subjectsApproved: safeCount(source.subjectsApproved),
      subjectsTotal: safeCount(source.subjectsTotal),
      creditsEarned: safeCount(source.creditsEarned),
      creditsTotal: safeOptionalNumber(source.creditsTotal),
      progress: round(safeCount(source.progress), 1),
      average: round(safeOptionalNumber(source.average), 1),
      gpa: round(safeOptionalNumber(source.gpa), 2),
      // generatedAt is supplied by the caller (the browser adapter), never
      // generated here — keeping this module deterministic and Date-free.
      generatedAt: safeString(source.generatedAt)
    };
  }

  function isValidCard(obj) {
    return !!obj && typeof obj === 'object' && obj.t === CARD_TYPE && typeof obj.v === 'number';
  }

  function serializeCard(card) {
    return JSON.stringify(buildStudentCard(card));
  }

  function byteLength(text) {
    return new TextEncoder().encode(String(text)).length;
  }

  function fitsTag(text) {
    return byteLength(text) <= MAX_PAYLOAD_BYTES;
  }

  function parseCard(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    if (!isValidCard(parsed)) return null;
    // Re-normalize so a card written by an older/newer client is coerced into
    // the shape this client expects before it ever reaches the UI.
    return buildStudentCard(parsed);
  }

  global.StudyTrackNfc = {
    CARD_TYPE,
    CARD_VERSION,
    MIME_TYPE,
    MAX_PAYLOAD_BYTES,
    buildStudentCard,
    isValidCard,
    serializeCard,
    byteLength,
    fitsTag,
    parseCard
  };
})(typeof window !== 'undefined' ? window : globalThis);
