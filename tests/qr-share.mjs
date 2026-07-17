import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Load the pure modules into a vm context, mirroring tests/logic.mjs. The QR
// renderer (vendored library + canvas) is NOT loaded here — only the pure
// URL encode/decode logic is exercised, so this runs in plain Node.
const context = { globalThis: {} };
context.globalThis = context;
context.TextEncoder = TextEncoder;
context.TextDecoder = TextDecoder;
context.btoa = btoa;
context.atob = atob;
context.URLSearchParams = URLSearchParams;
vm.createContext(context);

for (const file of ['src/nfc.js', 'src/qr-share.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}
const { StudyTrackNfc, StudyTrackShare } = context;

const card = StudyTrackNfc.buildStudentCard({
  name: 'Ana Pérez', institution: 'UNICARIBE', career: 'Ing. de Software', degree: 'Grado',
  periodsTaken: 2, subjectsApproved: 8, subjectsTotal: 40, creditsEarned: 24, creditsTotal: 240,
  progress: 20, average: 88.5, gpa: 3.4, generatedAt: '2026-06-17T00:00:00.000Z'
});

// Build URL carries the card in a base64url param (no +, /, = that would break a URL/QR).
const url = StudyTrackShare.buildShareUrl('https://studytrack.erlin.do/', card);
assert.ok(url.includes('?card='), 'share URL carries the card param');
const payload = url.split('card=')[1];
assert.ok(!/[+/=]/.test(payload), 'payload is base64url-clean');

// Round-trip: a card survives encode -> URL -> decode unchanged (UTF-8 name included).
const back = StudyTrackShare.parseShareParam(new URL(url).search);
assert.equal(JSON.stringify(back), JSON.stringify(card), 'card round-trips through the share URL');
assert.equal(back.name, 'Ana Pérez', 'UTF-8 name survives base64url');

// Rejections: every malformed input degrades to null, never throws.
assert.equal(StudyTrackShare.parseShareParam(''), null, 'empty search -> null');
assert.equal(StudyTrackShare.parseShareParam('?foo=1'), null, 'missing card param -> null');
assert.equal(StudyTrackShare.parseShareParam('?card=%%%not-base64%%%'), null, 'garbage payload -> null');
assert.equal(
  StudyTrackShare.parseShareParam('?card=' + StudyTrackShare.b64urlEncode('{"not":"a card"}')),
  null,
  'valid base64 but wrong type -> null'
);

console.log('QR share checks passed');
