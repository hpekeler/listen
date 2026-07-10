/* Erzeugt ein VAPID-Schlüsselpaar. Einmal laufen lassen, dann nie wieder –
   ein neues Paar macht alle bestehenden Push-Abos ungültig.

     node tools/gen-vapid.mjs

   Braucht nur Node (>=16), kein npm-Paket. Der private Teil geht als Secret in
   den Cloudflare-Worker, der öffentliche in die index.html. Siehe README. */
import { webcrypto } from 'node:crypto';

const { subtle } = webcrypto;
const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);

const privateJwk = await subtle.exportKey('jwk', kp.privateKey);
const rawPublic = Buffer.from(await subtle.exportKey('raw', kp.publicKey));   // 65 Byte, beginnt mit 0x04
const publicB64 = rawPublic.toString('base64url');

console.log(`
VAPID_PRIVATE_JWK  (geheim -> npx wrangler secret put VAPID_PRIVATE_JWK)
${JSON.stringify(privateJwk)}

VAPID_PUBLIC  (öffentlich -> npx wrangler secret put VAPID_PUBLIC  UND  index.html)
${publicB64}

VAPID_SUBJECT  (-> npx wrangler secret put VAPID_SUBJECT)
mailto:deine@adresse.de
`);
