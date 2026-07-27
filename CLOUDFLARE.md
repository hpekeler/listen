# Cloudflare

Alles, was die App außerhalb von GitHub Pages braucht: der **Worker** als Vermittler zur
Cloud, die **Push-Schlüssel** fürs Anstupsen und eine **Rate-Limiting-Regel**.

Der Worker ist zustandslos. Er speichert nichts – weder Zugangsdaten noch Listen – und
reicht Anfragen nur weiter. Er existiert allein deshalb, weil der Browser eine fremde
Cloud aus Sicherheitsgründen nicht direkt ansprechen darf (CORS).

---

## 1. Worker anlegen

1. Kostenloses Konto auf [dash.cloudflare.com](https://dash.cloudflare.com) anlegen.
2. *Workers & Pages* → *Create* → *Start with Hello World* → Name vergeben.
3. Den kompletten Inhalt von `worker.js` einfügen und *Deploy* klicken.
4. Die Adresse (`https://NAME.USER.workers.dev`) merken – sie kommt in `index.html`
   in die Zeile `PROXY_BASE`.

Alternativ per CLI: `npx wrangler deploy`. Dafuer liegt eine `wrangler.toml` im
Projekt — **ohne sie raet wrangler falsch**: Es nimmt den Ordnernamen (`listen`) als
Worker-Namen und haelt das Projekt wegen der `index.html` fuer eine statische Website.
Das Ergebnis waere ein zweiter, funktionsloser Worker unter falscher Adresse — oder im
schlimmsten Fall der bestehende, ersetzt durch hochgeladene App-Dateien.

Meldet wrangler beim Start trotzdem *„Framework: Static / Output Directory: ."*, laeuft
der Befehl nicht im Projektordner oder die `wrangler.toml` fehlt. Abbrechen, nicht
durchklicken.

> **Reihenfolge:** erst den Worker deployen, dann die neue `index.html` auf Pages
> schieben. Andersherum ruft die App Routen auf, die es noch nicht gibt.

## 2. Push-Schlüssel (VAPID)

Ohne dieses Schlüsselpaar identifiziert sich niemand gegenüber Apple und Google, und die
Glocke bleibt versteckt. Einmal erzeugen – ein **neues Paar macht alle bestehenden Abos
ungültig**:

```bash
node tools/gen-vapid.mjs
```

Die drei Werte als Secrets ablegen (Konsole: *Settings* → *Variables and Secrets*, Typ
*Secret*; oder per CLI):

```bash
npx wrangler secret put VAPID_PRIVATE_JWK   # bleibt geheim, verlässt den Worker nie
npx wrangler secret put VAPID_PUBLIC
npx wrangler secret put VAPID_SUBJECT       # mailto:deine@adresse.de
```

`VAPID_SUBJECT` **muss** mit `mailto:` oder `https:` beginnen – Apple antwortet sonst mit
`403`. Anschließend `VAPID_PUBLIC` zusätzlich in `index.html` eintragen.

## 3. Einen neuen WebDAV-Server freischalten

Der Worker lässt nur bekannte WebDAV-Server durch. Das ist seine wichtigste Absicherung:
Der Zielserver kommt aus dem Browser, und ohne diese Liste könnte jeder den Worker
beliebige Adressen anfragen lassen – mit fremden Zugangsdaten und auf deine Rechnung.

Ab Werk erlaubt sind GMX, web.de, Strato HiDrive, Koofr und mailbox.org (`WEBDAV_HOSTS`
in `worker.js`). Alles Weitere – etwa die Nextcloud einer Freundin – kommt **ohne
Code-Änderung** über das Secret `EXTRA_WEBDAV_HOSTS` dazu.

### So geht's

Jemand meldet: *„Bei mir sagt die App, mein Server sei nicht freigeschaltet."* Dann:

1. **Hostnamen erfragen** – nur der Host, ohne `https://`, ohne Pfad, ohne Port.
   Aus `https://cloud.beispiel.de/remote.php/dav/…` wird `cloud.beispiel.de`.
2. **Vollständige Liste setzen** (siehe Warnung unten):

   ```bash
   npx wrangler secret put EXTRA_WEBDAV_HOSTS
   # Eingabe: cloud.beispiel.de, nextcloud.freundin.example
   ```

   Ohne CLI geht es auch in der Konsole: *Workers & Pages → listen-sync → Settings →
   Variables and Secrets → Add*, Typ **Secret**, Name `EXTRA_WEBDAV_HOSTS`.
3. **Fertig.** Kein Deploy nötig, die Änderung greift sofort. Die Person wählt in der App
   *Anderer WebDAV-Server* (oder *Nextcloud / ownCloud*) und trägt ihre Adresse ein.

### Zwei Fallstricke

**Die Eingabe ersetzt die Liste, sie ergänzt sie nicht.** Beim Hinzufügen eines Servers
immer **alle** Hosts erneut eintragen, kommagetrennt. Wer nur den neuen einträgt, sperrt
alle bisherigen aus – und merkt es erst, wenn sich jemand beschwert.

**Secrets lassen sich nicht auslesen.** `npx wrangler secret list` zeigt nur die Namen,
nie die Werte – das ist der Sinn von Secrets. Führe deshalb selbst Buch darüber, welche
Hosts gerade freigeschaltet sind (Passwortmanager, Notiz). Ist die Liste verloren, hilft
nur, sie aus den Rückmeldungen neu zusammenzutragen.

### Warum Secret und nicht Variable?

Die Hostnamen sind keine Geheimnisse im engeren Sinn, aber:

- Diese Konfiguration liegt **öffentlich auf GitHub**. Die Adresse einer privaten
  Nextcloud gehört der Person, der sie gehört – nicht in dein Repo.
- Eine `[vars]`-Angabe in der `wrangler.toml` würde bei **jedem** `wrangler deploy` den in
  der Konsole gesetzten Wert überschreiben. Freigeschaltete Server wären danach
  stillschweigend wieder gesperrt. Secrets überleben Deploys.

Der Worker liest `env.EXTRA_WEBDAV_HOSTS` – ob der Wert als Variable oder als Secret
gesetzt ist, macht für den Code keinen Unterschied. Ein Name darf allerdings **nicht
beides gleichzeitig** sein; eine `[vars]`-Sektion mit diesem Namen führt beim Deploy zum
Konflikt.

## 4. Rate-Limiting einrichten

**Ohne diese Regel bremst nichts.** Es gibt keine Origin-Prüfung mehr (sie hätte nur
Browser gebremst und die App an eine feste Adresse gefesselt), also ist das Rate-Limit
neben der Host-Liste die zweite tragende Absicherung.

Im Free-Plan ist **eine** Rate-Limiting-Regel enthalten. Sie greift an der Kante, also
noch **bevor** der Worker startet – sie verbraucht damit kein Request-Kontingent.

*Konsole → deine Domain bzw. `workers.dev`-Route → **Security** → **WAF** → **Rate
limiting rules** → **Create rule***:

| Feld | Wert |
|---|---|
| Wenn eingehende Anfragen entsprechen | `Hostname` gleich deiner Worker-Adresse |
| Zählen nach | IP-Adresse |
| Rate | **60 Anfragen** pro **1 Minute** |
| Dann | *Block*, Dauer 1 Minute |

60/Minute liegt weit über dem, was die App je braucht: Sie synchronisiert alle 15
Sekunden, und das nur bei sichtbarer App – also rund 4 Anfragen pro Minute und Gerät.

Wer stattdessen die im Code vorgesehenen Bindings benutzen will (`SYNC_LIMITER`,
`PUSH_LIMITER` in `overLimit`), ergänzt sie in der `wrangler.toml` und deployt per
`npx wrangler deploy`. Achtung: Beim Einfügen über die Konsole sind Bindings nicht
gesetzt – `overLimit` lässt dann bewusst durch, statt alles zu blockieren.

## 5. Was passiert bei Überlastung?

Der Free-Plan umfasst **100.000 Anfragen pro Tag** und **hat keine Abrechnung** – es kann
also nichts ins Geld laufen. Ist das Kontingent aufgebraucht, antwortet der Worker bis
zum nächsten UTC-Tag mit einem Fehler.

Für die App heißt das: **Ausfall, kein Datenverlust.** Sie arbeitet offline weiter,
speichert lokal und reicht alles nach, sobald der Worker wieder antwortet.

Zur Einordnung: Der 15-Sekunden-Takt läuft nur bei geöffneter App, das sind rund 240
Anfragen pro Stunde aktiver Nutzung. Bei 10 Minuten Nutzung pro Person und Tag reicht das
Kontingent für etwa 2.500 Personen.

---

## Einen eigenen Worker betreiben

Wer den Listen nicht über einen fremden Vermittler laufen lassen will, betreibt seinen
eigenen. Ein Fork der App ist dafür **nicht** nötig.

Hintergrund: Der Worker sieht zwangsläufig alles im Klartext, was durch ihn läuft – auch
das Cloud-Passwort. Er speichert nichts davon und schreibt nichts mit. Aber wer ihn
betreibt, *könnte* sein Programm ändern und genau das tun, und von außen lässt sich das
nicht überprüfen. Deshalb gilt in jedem Fall: **immer ein anwendungsspezifisches
Passwort** verwenden, nie das Konto-Passwort. Es gilt nur für den Dateizugriff und lässt
sich einzeln zurückziehen, ohne das Konto anzufassen.

1. Schritte 1 und 2 oben durchlaufen (Worker anlegen, VAPID-Secrets setzen). Ohne die
   Secrets funktioniert alles außer den Benachrichtigungen.
2. Einen eigenen Cloud-Server über `EXTRA_WEBDAV_HOSTS` freischalten (Schritt 3).
3. In der App beim Einrichten unter **Erweitert → Worker-Adresse** die eigene Adresse
   eintragen.

Danach laufen Sync **und** Anstupsen über den eigenen Worker; über den fremden läuft
nichts mehr. Die App selbst kann weiterhin von der geteilten Adresse geladen werden –
sie ist nur HTML und enthält keine Daten.
