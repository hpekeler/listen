/* ============================================================================
   LISTEN – Cloudflare Worker (GMX-WebDAV-Proxy)
   ----------------------------------------------------------------------------
   Reicht Anfragen der App an GMX-WebDAV weiter und setzt die CORS-Header.
   Speichert NICHTS. Fest auf GMX beschränkt (kein offener Proxy).
   Automatischer Wiederholungsversuch bei GMX-5xx (kurze Aussetzer).

   ACHTUNG: CORS bremst nur Browser, kein `curl`. Gegen Missbrauch als
   anonymisierendes Relay (z. B. GMX-Login-Bruteforce) schützt in erster Linie
   die Pfad-Allowlist unten plus eine Rate-Limiting-Regel auf der Worker-Route
   in der Cloudflare-Konsole. Ein statisches App-Token brächte nichts – die
   index.html liegt öffentlich auf GitHub Pages.
   ========================================================================== */

const GMX_BASE = 'https://webdav.mc.gmx.net';
const ALLOWED_ORIGINS = new Set(['https://hpekeler.github.io']);
const PATH_RE = /^\/[A-Za-z0-9._-]+\.json$/;   // schließt '..' und Unterordner aus

function cors(origin) {
  const h = {
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  };
  // Kein ACAO für fremde Origins -> der Browser verwirft die Antwort.
  if (ALLOWED_ORIGINS.has(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
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

    // Origin für ALLE Methoden prüfen, nicht nur beim Preflight: sonst ginge jede
    // fremde Anfrage weiterhin an GMX raus und nur die Antwort bliebe im Browser
    // hängen. Der Header ist per curl fälschbar – das hier spart Upstream-Last und
    // stoppt Gelegenheits-Scans, die eigentliche Bremse ist das Rate-Limiting.
    if (!ALLOWED_ORIGINS.has(origin)) {
      return new Response('Forbidden origin', { status: 403, headers: cors(origin) });
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    if (request.method !== 'GET' && request.method !== 'PUT') {
      return new Response('Method not allowed', { status: 405, headers: cors(origin) });
    }

    const url = new URL(request.url);
    const path = url.searchParams.get('path') || '';
    if (!PATH_RE.test(path)) {
      return new Response('Bad path', { status: 400, headers: cors(origin) });
    }

    // Vor jedem Upstream-Call prüfen: unauthentifizierte Scans kosten GMX nichts.
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Basic ')) {
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
