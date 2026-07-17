import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const context = { globalThis: {} };
context.globalThis = context;
// The pure module relies on TextEncoder for byteLength; expose Node's global.
context.TextEncoder = TextEncoder;
vm.createContext(context);

vm.runInContext(fs.readFileSync('src/nfc.js', 'utf8'), context, { filename: 'src/nfc.js' });

const { StudyTrackNfc } = context;

// Constants are stable and documented.
assert.equal(StudyTrackNfc.CARD_TYPE, 'studytrack-card');
assert.equal(StudyTrackNfc.CARD_VERSION, 1);
assert.equal(StudyTrackNfc.MIME_TYPE, 'application/vnd.studytrack.card+json');
assert.equal(StudyTrackNfc.MAX_PAYLOAD_BYTES, 480);

// buildStudentCard normalizes and rounds without touching Date.
const built = StudyTrackNfc.buildStudentCard({
  name: '  Ada Lovelace  ',
  institution: 'UASD',
  career: 'Ingeniería',
  degree: 'Licenciatura',
  periodsTaken: '3',
  subjectsApproved: 12,
  subjectsTotal: 50,
  creditsEarned: 36,
  creditsTotal: 240,
  progress: 17.5123,
  average: null,
  gpa: 3.666,
  generatedAt: '2026-06-16T00:00:00.000Z'
});

assert.equal(built.v, 1);
assert.equal(built.t, 'studytrack-card');
assert.equal(built.name, 'Ada Lovelace');
assert.equal(built.institution, 'UASD');
assert.equal(built.career, 'Ingeniería');
assert.equal(built.degree, 'Licenciatura');
assert.equal(built.periodsTaken, 3);
assert.equal(built.subjectsApproved, 12);
assert.equal(built.subjectsTotal, 50);
assert.equal(built.creditsEarned, 36);
assert.equal(built.creditsTotal, 240);
assert.equal(built.progress, 17.5);
assert.equal(built.average, null);
assert.equal(built.gpa, 3.67);
assert.equal(built.generatedAt, '2026-06-16T00:00:00.000Z');

// Missing strings collapse to '', counts to 0, optional numerics to null.
const blank = StudyTrackNfc.buildStudentCard({});
assert.equal(blank.name, '');
assert.equal(blank.institution, '');
assert.equal(blank.career, '');
assert.equal(blank.degree, '');
assert.equal(blank.periodsTaken, 0);
assert.equal(blank.subjectsApproved, 0);
assert.equal(blank.subjectsTotal, 0);
assert.equal(blank.creditsEarned, 0);
assert.equal(blank.creditsTotal, null);
assert.equal(blank.progress, 0);
assert.equal(blank.average, null);
assert.equal(blank.gpa, null);
assert.equal(blank.generatedAt, '');

// average rounds to 1 decimal; numeric strings coerce.
const withAverage = StudyTrackNfc.buildStudentCard({ average: '88.46', gpa: '3.1' });
assert.equal(withAverage.average, 88.5);
assert.equal(withAverage.gpa, 3.1);

// Non-finite optional numerics fall back to null (e.g. NaN strings).
const garbage = StudyTrackNfc.buildStudentCard({ average: 'oops', gpa: 'NaN', creditsTotal: 'x' });
assert.equal(garbage.average, null);
assert.equal(garbage.gpa, null);
assert.equal(garbage.creditsTotal, null);

// isValidCard requires the type tag and a numeric version.
assert.equal(StudyTrackNfc.isValidCard(built), true);
assert.equal(StudyTrackNfc.isValidCard(null), false);
assert.equal(StudyTrackNfc.isValidCard('string'), false);
assert.equal(StudyTrackNfc.isValidCard({ t: 'studytrack-card' }), false); // no numeric v
assert.equal(StudyTrackNfc.isValidCard({ t: 'studytrack-card', v: 1 }), true);
assert.equal(StudyTrackNfc.isValidCard({ t: 'other', v: 1 }), false);

// serializeCard returns a JSON string.
const serialized = StudyTrackNfc.serializeCard(built);
assert.equal(typeof serialized, 'string');
assert.equal(JSON.stringify(JSON.parse(serialized)), JSON.stringify(built));

// byteLength and fitsTag rely on UTF-8 byte counting.
assert.equal(StudyTrackNfc.byteLength('abc'), 3);
assert.ok(StudyTrackNfc.byteLength('é') > 1, 'Multibyte characters count as more than one byte');
assert.equal(StudyTrackNfc.fitsTag(serialized), true);
assert.equal(StudyTrackNfc.fitsTag('x'.repeat(600)), false);

// Round-trip: serialize -> parse -> normalize must equal a freshly built card.
const roundTripInput = {
  name: 'Grace Hopper',
  institution: 'UASD',
  career: 'Informática',
  degree: 'Maestría',
  periodsTaken: 4,
  subjectsApproved: 20,
  subjectsTotal: 45,
  creditsEarned: 60,
  creditsTotal: 200,
  progress: 44.4444,
  average: 91.27,
  gpa: 3.888,
  generatedAt: '2026-06-16T12:00:00.000Z'
};
const reference = StudyTrackNfc.buildStudentCard(roundTripInput);
assert.equal(
  JSON.stringify(StudyTrackNfc.parseCard(StudyTrackNfc.serializeCard(reference))),
  JSON.stringify(reference)
);

// parseCard is defensive against bad input.
assert.equal(StudyTrackNfc.parseCard('not json'), null);
assert.equal(StudyTrackNfc.parseCard(JSON.stringify({ foo: 1 })), null); // wrong type
assert.equal(StudyTrackNfc.parseCard(JSON.stringify({ t: 'studytrack-card' })), null); // no numeric v

// A valid serialized card parses into a normalized object.
const parsedValid = StudyTrackNfc.parseCard(JSON.stringify({
  t: 'studytrack-card',
  v: 1,
  name: '  Alan Turing  ',
  progress: 12.345,
  average: '70.05',
  gpa: 2.999
}));
assert.ok(parsedValid && typeof parsedValid === 'object');
assert.equal(parsedValid.name, 'Alan Turing');
assert.equal(parsedValid.progress, 12.3);
assert.equal(parsedValid.average, 70.1);
assert.equal(parsedValid.gpa, 3);

console.log('NFC checks passed');
