(function (global) {
  // Pure rules for the hidden developer mode: unlocked by tapping the app version, it gates features
  // that are off by default (QR / NFC card sharing). No DOM, no storage, no Date: the app passes time in.
  const TAPS_NEEDED = 7;
  const MAX_GAP_MS = 2000;

  const FEATURES = [
    { id: 'qr', label: 'Carné por QR', hint: 'Compartir o leer el carné con un código QR.' },
    { id: 'nfc', label: 'Carné por NFC', hint: 'Compartir o leer el carné con NFC (Chrome en Android).' }
  ];

  // state: { count, last } from the previous tap (or null). A tap continues the streak only if it comes
  // at most MAX_GAP_MS after the previous one; a clock that moved backwards restarts it.
  function registerVersionTap(state, nowMs) {
    const prev = state || { count: 0, last: null };
    const continues = typeof prev.last === 'number' && nowMs >= prev.last && nowMs - prev.last <= MAX_GAP_MS;
    const count = continues ? prev.count + 1 : 1;
    if (count >= TAPS_NEEDED) return { count: 0, last: null, unlocked: true, remaining: 0 };
    return { count, last: nowMs, unlocked: false, remaining: TAPS_NEEDED - count };
  }

  // A feature shows only when developer mode is unlocked AND its own switch is on (default: off).
  function isFeatureOn(unlocked, flags, id) {
    return Boolean(unlocked) && FEATURES.some((f) => f.id === id) && Boolean(flags) && flags[id] === true;
  }

  function normalizeFlags(raw) {
    const flags = {};
    FEATURES.forEach((f) => { flags[f.id] = Boolean(raw) && raw[f.id] === true; });
    return flags;
  }

  function toggleFlag(flags, id) {
    const next = normalizeFlags(flags);
    if (FEATURES.some((f) => f.id === id)) next[id] = !next[id];
    return next;
  }

  global.StudyTrackDevMode = { TAPS_NEEDED, MAX_GAP_MS, FEATURES, registerVersionTap, isFeatureOn, normalizeFlags, toggleFlag };
})(typeof window !== 'undefined' ? window : globalThis);
