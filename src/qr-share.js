(function (global) {
  // Pure share-link model for the student card. Encodes the card into a URL the
  // receiver can open from any phone's camera (deep-link), and decodes it back.
  // Side-effect free: no DOM, no QR rendering (that lives in the app adapter) — so
  // this stays unit-testable in plain Node.
  const CARD_PARAM = 'card';

  // base64url over UTF-8 bytes: ASCII-safe payload that survives a URL and a QR
  // without '+', '/' or '=' (which would need percent-encoding).
  function b64urlEncode(str) {
    const bytes = new global.TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
    return global.btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64urlDecode(b64url) {
    const pad = b64url.length % 4 === 0 ? '' : '='.repeat(4 - (b64url.length % 4));
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const bin = global.atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new global.TextDecoder().decode(bytes);
  }

  function encodeCard(card) {
    return b64urlEncode(global.StudyTrackNfc.serializeCard(card));
  }

  function buildShareUrl(baseUrl, card) {
    const sep = String(baseUrl).indexOf('?') === -1 ? '?' : '&';
    return baseUrl + sep + CARD_PARAM + '=' + encodeCard(card);
  }

  // Safe inbound parse: returns a normalized card or null for anything malformed
  // (missing param, bad base64, non-JSON, or a payload that isn't our card type).
  function parseShareParam(search) {
    if (!search || typeof search !== 'string') return null;
    let value;
    try {
      value = new global.URLSearchParams(search).get(CARD_PARAM);
    } catch {
      return null;
    }
    if (!value) return null;
    let json;
    try {
      json = b64urlDecode(value);
    } catch {
      return null;
    }
    return global.StudyTrackNfc.parseCard(json);
  }

  global.StudyTrackShare = {
    CARD_PARAM,
    b64urlEncode,
    b64urlDecode,
    encodeCard,
    buildShareUrl,
    parseShareParam
  };
})(typeof window !== 'undefined' ? window : globalThis);
