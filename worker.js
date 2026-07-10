/* ============================================================================
   LISTEN – Cloudflare Worker (GMX-WebDAV-Proxy)
   ----------------------------------------------------------------------------
   Reicht Anfragen der App an GMX-WebDAV weiter und setzt die CORS-Header.
   Speichert NICHTS. Fest auf GMX beschränkt (kein offener Proxy).
   Neu: automatischer Wiederholungsversuch bei GMX-5xx (kurze Aussetzer).
   ========================================================================== */

const GMX_BASE = 'https://webdav.mc.gmx.net';
const ALLOW_ORIGIN = '*'; // z. B. 'https://listen.pages.dev' zum Einschränken

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOW_ORIGIN === '*' ? (origin || '*') : ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

// Bei 5xx bis zu 3x mit kurzer Pause neu versuchen (body ist ein String -> wiederverwendbar)
async function fetchRetry(target, init, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(target, init);
      if (r.status < 500) return r;
      last = r;
    } catch (e) {
      last = e;
    }
    await new Promise((res) => setTimeout(res, 300 * (i + 1)));
  }
  if (last instanceof Response) return last;
  throw last;
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    if (request.method !== 'GET' && request.method !== 'PUT') {
      return new Response('Method not allowed', { status: 405, headers: cors(origin) });
    }

    const url = new URL(request.url);
    const path = url.searchParams.get('path') || '';
    if (!path.startsWith('/') || path.includes('..')) {
      return new Response('Bad path', { status: 400, headers: cors(origin) });
    }

    const auth = request.headers.get('Authorization');
    if (!auth) {
      return new Response('Missing Authorization', { status: 401, headers: cors(origin) });
    }

    const target = GMX_BASE + path;
    const init = { method: request.method, headers: { 'Authorization': auth } };
    if (request.method === 'PUT') {
      init.body = await request.text();
      init.headers['Content-Type'] = 'application/json';
    }

    let resp;
    try {
      resp = await fetchRetry(target, init);
    } catch (e) {
      return new Response('Upstream error: ' + e, { status: 502, headers: cors(origin) });
    }

    const body = await resp.text();
    const headers = cors(origin);
    headers['Content-Type'] = 'application/json';
    return new Response(body, { status: resp.status, headers });
  },
};
