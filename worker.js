/* ============================================================================
   LISTEN – Cloudflare Worker
   ----------------------------------------------------------------------------
   Zwei Routen:

   1. `/?host=webdav.mc.gmx.net&path=/listen.json`  (GET/PUT) – WebDAV-Proxy.
      Reicht Anfragen der App an den WebDAV-Server weiter und setzt die CORS-Header.
      Speichert NICHTS – weder Zugangsdaten noch Listen. Das Ziel muss auf der
      Host-Allowlist unten stehen (kein offener Proxy).
      Automatischer Wiederholungsversuch bei 5xx (kurze Aussetzer).

   2. `/push`  (POST) – Web-Push-Versand („Anstupsen").
      Verschlüsselt die Nachricht (RFC 8291) und schickt sie signiert (VAPID,
      RFC 8292) an den Push-Dienst des Empfängers (Apple/Google/Mozilla).
      Speichert ebenfalls NICHTS: Das Abo kommt im Request-Body, der private
      VAPID-Schlüssel liegt als Worker-Secret. Siehe README.

   ZUGANG: Der Worker steht bewusst allen offen – es gibt keine Origin-Prüfung
   mehr. Sie hätte nur Browser gebremst (per `curl` ist der Header fälschbar)
   und hätte verhindert, dass die App von anderen Adressen aus läuft.

   Was stattdessen trägt, und zwar allein:
   • die HOST-Allowlist unten – ohne sie wäre der Worker ein Relay, das für
     jeden Basic-Auth-Anfragen an beliebige Server stellt, auf Rechnung des
     Betreibers. Sie ist der eigentliche Schutz, nicht die frühere CORS-Regel.
   • die Pfad-Prüfung – kein Ausbruch aus dem Zielserver.
   • eine Rate-Limiting-Regel auf der Worker-Route in der Cloudflare-Konsole.
     Siehe CLOUDFLARE.md.
   Ein statisches App-Token brächte nichts – die index.html liegt öffentlich
   auf GitHub Pages.
   ========================================================================== */

/* Nur geprüfte WebDAV-Anbieter. Eigene Server (z. B. eine Nextcloud) kommen
   über das Secret EXTRA_WEBDAV_HOSTS dazu, kommagetrennt und als exakter
   Hostname – dafür muss der Code nicht angefasst werden. Secret und nicht
   Variable, weil die Konfiguration öffentlich im Repo liegt und ein Deploy
   sonst die freigeschalteten Server überschreiben würde. Siehe CLOUDFLARE.md. */
const WEBDAV_HOSTS = [
  'webdav.mc.gmx.net',            // GMX MediaCenter
  'webdav.smartdrive.web.de',     // web.de SmartDrive
  'webdav.hidrive.strato.com',    // Strato HiDrive
  'app.koofr.net',                // Koofr
  'dav.mailbox.org',              // mailbox.org
];
const MAX_SEGMENTS = 12;
const MAX_PATH = 400;

/* Nur echte Push-Dienste als Ziel. Ohne diese Liste wäre `/push` ein
   SSRF-Gadget: Die Ziel-URL kommt aus dem Request-Body, ein Angreifer könnte
   den Worker sonst beliebige Hosts anfragen lassen. */
const PUSH_HOSTS = [
  /(^|\.)push\.apple\.com$/,                  // Safari / iOS
  /(^|\.)fcm\.googleapis\.com$/,              // Chrome / Android
  /^updates\.push\.services\.mozilla\.com$/,  // Firefox
  /(^|\.)notify\.windows\.com$/,              // Edge
];
const endpointAllowed = (u) => {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && !x.port && PUSH_HOSTS.some((re) => re.test(x.hostname));
  } catch (e) { return false; }
};

/* Der Zielserver kommt aus dem Request. Ohne diese Prüfung könnte jeder den
   Worker beliebige Hosts anfragen lassen und dabei fremde Zugangsdaten
   mitschicken (SSRF / anonymisierender Relay). Gleiche Aufgabe wie
   `endpointAllowed` für die Push-Route, gleiche Machart.
   IP-Literale sind ausgeschlossen: ein Hostname, der wie eine IPv4 aussieht
   oder in Klammern steht, fliegt raus – sonst führte der Umweg über
   127.0.0.1 oder eine interne Adresse am Sinn der Liste vorbei. */
function davHostAllowed(host, env) {
  if (!host || host.length > 253) return false;
  if (!/^[a-z0-9.-]+$/i.test(host)) return false;          // kein Port, kein user:pass@, kein '['
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;  // keine IPv4-Literale
  const extra = String((env && env.EXTRA_WEBDAV_HOSTS) || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const h = host.toLowerCase();
  return WEBDAV_HOSTS.includes(h) || extra.includes(h);
}

/* Pfade dürfen Unterordner haben, aber nicht aus dem Zielserver ausbrechen.
   Strukturell geprüft statt über eine Zeichenklasse: Ordner heißen nun mal
   „Meine Listen" oder „Bücher", eine ASCII-Regex hätte die ausgesperrt.
   Rückgabe: der neu zusammengesetzte, sauber kodierte Pfad – oder null. */
function safePath(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.length > MAX_PATH) return null;
  if (raw.includes('\\') || /[\x00-\x1f\x7f]/.test(raw)) return null;
  let dec;
  try { dec = decodeURIComponent(raw); } catch (e) { return null; }
  if (dec.includes('\\') || /[\x00-\x1f\x7f]/.test(dec)) return null;
  const segs = dec.split('/').slice(1);                    // führendes '' weg
  if (!segs.length || segs.length > MAX_SEGMENTS) return null;
  for (const s of segs) {
    if (!s || s === '.' || s === '..') return null;        // leer = '//', sonst Ausbruch
  }
  if (!/\.json$/i.test(segs[segs.length - 1])) return null;
  return '/' + segs.map(encodeURIComponent).join('/');
}

function cors() {
  return {
    // Bewusst offen: siehe Kopf der Datei. Zulässig ohne Risiko für Cookies,
    // weil die App den Authorization-Header selbst setzt und nie
    // `credentials:'include'` benutzt – der Browser schickt also keine Cookies mit.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
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

/* ---- Rate-Limiting (optional) ---------------------------------------------
   Nutzt Cloudflares Rate-Limiting-Binding (konfiguriert in wrangler.toml).
   Die Bindings gibt es nur bei Deploy über wrangler; beim Dashboard-Upload
   ist `limiter` undefiniert -> wir lassen dann durch, statt zu blockieren.
   Gezählt wird pro Absender-IP. Siehe CLOUDFLARE.md. */
async function overLimit(limiter, request) {
  if (!limiter) return false;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  try {
    const { success } = await limiter.limit({ key: ip });
    return !success;
  } catch (e) {
    return false;   // im Zweifel nicht blockieren – lieber durchlassen als Totalausfall
  }
}

/* ---- Bytes & Base64url ---------------------------------------------------- */
const enc = new TextEncoder();
const b64urlToBytes = (s) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const bytesToB64url = (b) => {
  let s = '';
  for (const byte of new Uint8Array(b)) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const concat = (...arrs) => {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let p = 0;
  for (const a of arrs) { out.set(a, p); p += a.length; }
  return out;
};
// Info-Strings enden laut RFC auf ein 0x00-Byte. Den 0x01-Zähler hängt
// HKDF-Expand selbst an (gilt für Ausgabelängen <= 32 Byte).
const infoBytes = (s) => concat(enc.encode(s), new Uint8Array([0]));

async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8);
  return new Uint8Array(bits);
}

/* ---- RFC 8291: Nutzlast für Web Push verschlüsseln (aes128gcm) -------------
   Der Empfänger liefert beim Abo zwei Werte: `p256dh` (sein 65-Byte-P-256-
   Public-Key) und `auth` (16 Byte Geheimnis). Wir würfeln pro Nachricht ein
   Wegwerf-Schlüsselpaar, leiten daraus Key und Nonce ab und packen unseren
   Public Key mit in den Header, damit der Empfänger dasselbe ableiten kann. */
async function encryptPayload(p256dhB64, authB64, plaintext) {
  const uaPub = b64urlToBytes(p256dhB64);       // 65 Byte, beginnt mit 0x04
  const authSecret = b64urlToBytes(authB64);    // 16 Byte
  if (uaPub.length !== 65 || uaPub[0] !== 0x04) throw new Error('bad p256dh');
  if (authSecret.length !== 16) throw new Error('bad auth secret');

  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));

  const keyInfo = concat(infoBytes('WebPush: info'), uaPub, asPub);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, infoBytes('Content-Encoding: aes128gcm'), 16);
  const nonce = await hkdf(salt, ikm, infoBytes('Content-Encoding: nonce'), 12);

  // 0x02 = Trenner "letzter Record" (RFC 8188), keine Füllbytes nötig.
  const record = concat(enc.encode(plaintext), new Uint8Array([0x02]));
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, record));

  // Header: salt(16) | rs(4, big endian) | idlen(1) | keyid(=asPub, 65)
  const rs = new Uint8Array([0, 0, 0x10, 0]);   // 4096
  const header = concat(salt, rs, new Uint8Array([asPub.length]), asPub);
  return concat(header, ct);
}

/* ---- RFC 8292: VAPID-Header ------------------------------------------------
   `sub` muss mailto: oder https: sein – web.push.apple.com antwortet sonst 403.
   WebCrypto liefert die ECDSA-Signatur bereits als rohes R||S (64 Byte), genau
   wie JOSE/ES256 es will. Kein DER-Encoding. */
async function vapidHeader(endpoint, env) {
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = bytesToB64url(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,             // nur Schema+Host, ohne Pfad
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT,
  })));
  const signingInput = header + '.' + body;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(signingInput));
  return `vapid t=${signingInput}.${bytesToB64url(sig)}, k=${env.VAPID_PUBLIC}`;
}

/* ---- Route /push ---------------------------------------------------------- */
const clip = (s, n) => String(s || '').slice(0, n);

async function handlePush(request, env) {
  const headers = { ...cors(), 'Content-Type': 'application/json' };
  const fail = (status, msg) => new Response(JSON.stringify({ error: msg }), { status, headers });

  if (request.method !== 'POST') return fail(405, 'Method not allowed');
  if (await overLimit(env.PUSH_LIMITER, request)) return fail(429, 'Too many requests');
  if (!env.VAPID_PRIVATE_JWK || !env.VAPID_PUBLIC || !env.VAPID_SUBJECT) return fail(500, 'VAPID secrets missing');

  let req;
  try { req = await request.json(); } catch (e) { return fail(400, 'Bad JSON'); }

  const sub = req.subscription;
  // Vor jedem Netzwerk-Zugriff prüfen – hier hängt der SSRF-Schutz dran.
  if (!sub || !endpointAllowed(sub.endpoint)) return fail(400, 'Bad endpoint');
  if (!sub.keys || !sub.keys.p256dh || !sub.keys.auth) return fail(400, 'Bad keys');

  // Push-Dienste nehmen höchstens ~4 KB Nutzlast. Namen deckeln, statt später
  // eine 413 vom Dienst zurückzubekommen.
  const listName = clip(req.listName, 120);
  const fromName = clip(req.fromName, 60) || 'jemand';
  const listId = clip(req.listId, 40);

  const payload = JSON.stringify({
    title: `${fromName}`,
    body: `Bitte Liste „${listName}" checken`,
    listId,
  });

  let body, auth;
  try {
    body = await encryptPayload(sub.keys.p256dh, sub.keys.auth, payload);
    auth = await vapidHeader(sub.endpoint, env);
  } catch (e) {
    return fail(400, 'Encrypt failed: ' + e);
  }

  let resp;
  try {
    resp = await fetch(sub.endpoint, {
      method: 'POST',
      body,
      headers: {
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        'TTL': '86400',                                        // 24 h nachliefern, falls Handy offline
        'Urgency': 'normal',
        // Kein 'Topic'-Header: Apples Push-Dienst (web.push.apple.com) lehnt viele
        // eigentlich RFC-8030-konforme Werte mit "BadWebPushTopic" (400) ab. Der
        // Header collabiert nur wiederholte Stupser derselben Liste – verzichtbar.
        'Authorization': auth,
      },
    });
  } catch (e) {
    return fail(502, 'Push service unreachable: ' + e);
  }

  // 404/410 = Abo tot. Der Client räumt den Geräte-Eintrag daraufhin weg;
  // deshalb den Status durchreichen statt ihn hier zu schlucken.
  const detail = resp.ok ? '' : clip(await resp.text().catch(() => ''), 200);
  return new Response(JSON.stringify({ status: resp.status, detail }), { status: 200, headers });
}

/* ---- Einstieg ------------------------------------------------------------- */
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors() });
    }

    const url = new URL(request.url);
    if (url.pathname === '/push') return handlePush(request, env);

    /* --- ab hier: der WebDAV-Proxy --- */
    if (request.method !== 'GET' && request.method !== 'PUT') {
      return new Response('Method not allowed', { status: 405, headers: cors() });
    }

    // Host zuerst: Das ist die Prüfung, an der alles hängt, seit die
    // Origin-Regel weg ist. Eigene Meldung, damit die App sagen kann, was zu
    // tun ist ("Server freischalten lassen oder eigenen Worker betreiben").
    const host = url.searchParams.get('host') || '';
    if (!davHostAllowed(host, env)) {
      return new Response('Host not allowed', { status: 400, headers: cors() });
    }

    const path = safePath(url.searchParams.get('path') || '');
    if (!path) {
      return new Response('Bad path', { status: 400, headers: cors() });
    }

    // Vor jedem Upstream-Call prüfen: unauthentifizierte Scans kosten den
    // Zielserver nichts.
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Basic ')) {
      return new Response('Missing Authorization', { status: 401, headers: cors() });
    }

    if (await overLimit(env.SYNC_LIMITER, request)) {
      return new Response('Too many requests', { status: 429, headers: cors() });
    }

    const target = 'https://' + host + path;
    const init = { method: request.method, headers: { 'Authorization': auth } };
    if (request.method === 'PUT') {
      init.body = await request.text();
      init.headers['Content-Type'] = 'application/json';
    }

    let resp;
    try {
      resp = await fetchRetry(target, init);
    } catch (e) {
      return new Response('Upstream error: ' + e, { status: 502, headers: cors() });
    }

    const body = await resp.text();
    const headers = cors();
    headers['Content-Type'] = 'application/json';
    return new Response(body, { status: resp.status, headers });
  },
};
