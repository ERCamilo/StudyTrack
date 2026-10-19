// Cloudflare Worker that relays the university calendar when the browser blocks the direct download (CORS).
// It must never become an open proxy: only allowed hosts, only the Moodle export path, only from StudyTrack.
import assert from 'node:assert/strict';
import worker from '../worker/ics-proxy.js';

const APP = 'https://miruta.erlin.do';
const CAL_URL = 'https://eva.uapa.edu.do/calendar/export_execute.php?userid=1&authtoken=abc&preset_what=all&preset_time=recentupcoming';
const CAL = 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n';

let upstream = [];
globalThis.fetch = async (url) => {
  upstream.push(String(url));
  if (String(url).includes('authtoken=expired')) return new Response('Forbidden', { status: 403 });
  return new Response(CAL, { status: 200, headers: { 'content-type': 'text/calendar' } });
};
const call = async (target, { origin = APP, method = 'GET', env = {} } = {}) => {
  upstream = [];
  const url = target === null ? 'https://proxy.test/' : `https://proxy.test/?url=${encodeURIComponent(target)}`;
  const headers = origin ? { Origin: origin } : {};
  return worker.fetch(new Request(url, { method, headers }), env);
};

// Regla de negocio: el intermediario devuelve el calendario tal cual, solo a StudyTrack, sin guardarlo en caché.
{
  const r = await call(CAL_URL);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), CAL);
  assert.deepEqual(upstream, [CAL_URL]);
  assert.equal(r.headers.get('access-control-allow-origin'), APP);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.match(r.headers.get('content-type'), /text\/calendar/);
}

// Regla de negocio: solo responde a los orígenes permitidos (por defecto, el dominio de StudyTrack).
for (const origin of ['https://otro-sitio.com', null]) {
  const r = await call(CAL_URL, { origin });
  assert.equal(r.status, 403);
  assert.deepEqual(upstream, [], 'a forbidden origin never reaches the university');
}
assert.equal((await call(CAL_URL, { origin: 'http://localhost:5173', env: { ALLOWED_ORIGINS: 'https://miruta.erlin.do, http://localhost:5173' } })).status, 200);

// Regla de negocio: solo trae enlaces https de exportación de calendario de los dominios permitidos (por defecto, eva.uapa.edu.do).
for (const bad of [null, 'http://eva.uapa.edu.do/calendar/export_execute.php?x=1', 'https://evil.example/calendar/export_execute.php?x=1',
  'https://eva.uapa.edu.do/user/profile.php', 'https://eva.uapa.edu.do.evil.example/calendar/export_execute.php', 'no-es-un-enlace']) {
  const r = await call(bad);
  assert.equal(r.status, 400, `rejects ${bad}`);
  assert.deepEqual(upstream, []);
}
assert.equal((await call('https://campus.otra.edu/calendar/export_execute.php?a=1', { env: { ALLOWED_HOSTS: 'eva.uapa.edu.do,campus.otra.edu' } })).status, 200);

// Regla de negocio: si la universidad responde con error, el intermediario pasa el mismo código.
{
  const r = await call(CAL_URL.replace('authtoken=abc', 'authtoken=expired'));
  assert.equal(r.status, 403);
  assert.equal(r.headers.get('access-control-allow-origin'), APP);
}

// Regla de negocio: responde la consulta previa del navegador (OPTIONS) y rechaza otros métodos.
{
  const pre = await call(CAL_URL, { method: 'OPTIONS' });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), APP);
  assert.match(pre.headers.get('access-control-allow-methods'), /GET/);
  assert.deepEqual(upstream, []);
  assert.equal((await call(CAL_URL, { method: 'POST' })).status, 405);
}

console.log('University calendar proxy checks passed');
