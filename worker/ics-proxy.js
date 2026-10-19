// Cloudflare Worker: relay for the university Moodle calendar (.ics) used by StudyTrack
// when the browser blocks the direct download (CORS). It must never become an open proxy:
// only allowed origins, only allowed hosts, only the Moodle export path, only GET.

const DEFAULT_ORIGINS = 'https://miruta.erlin.do';
const DEFAULT_HOSTS = 'eva.uapa.edu.do';
const EXPORT_PATH = '/calendar/export_execute.php';

function parseList(value, fallback) {
  return String(value || fallback)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
  };
}

function plain(status, origin) {
  return new Response(null, { status, headers: corsHeaders(origin) });
}

export default {
  async fetch(request, env) {
    const origins = parseList(env?.ALLOWED_ORIGINS, DEFAULT_ORIGINS);
    const hosts = parseList(env?.ALLOWED_HOSTS, DEFAULT_HOSTS).map((h) => h.toLowerCase());

    const origin = request.headers.get('Origin');
    if (!origin || !origins.includes(origin)) {
      return new Response('Forbidden', { status: 403 });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(origin),
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    if (request.method !== 'GET') {
      return plain(405, origin);
    }

    const target = new URL(request.url).searchParams.get('url');
    if (!target) {
      return plain(400, origin);
    }

    let upstreamUrl;
    try {
      upstreamUrl = new URL(target);
    } catch {
      return plain(400, origin);
    }

    if (
      upstreamUrl.protocol !== 'https:' ||
      !hosts.includes(upstreamUrl.hostname.toLowerCase()) ||
      upstreamUrl.pathname !== EXPORT_PATH
    ) {
      return plain(400, origin);
    }

    let upstream;
    try {
      upstream = await fetch(upstreamUrl.href);
    } catch {
      // Never include the URL here: it carries the secret calendar token.
      return plain(502, origin);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...corsHeaders(origin),
        'Cache-Control': 'no-store',
        'Content-Type': 'text/calendar; charset=utf-8',
      },
    });
  },
};
