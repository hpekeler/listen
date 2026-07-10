# Listen

Geteilte Einkaufs- und To-do-Listen als PWA für iPhone und Android. Zwei Handys sehen
dieselben Listen; die Daten liegen in **einer JSON-Datei in der GMX-Cloud**, nicht bei
einem fremden Anbieter. Kein Konto, kein Tracking, keine Datenbank.

Die App ist eine einzige `index.html` – kein Build, kein Framework, keine Abhängigkeiten.

---

## Was die App kann

### Ordner, Listen, Einträge
- **Ordner** (z. B. *Einkauf*, *Haushalt*) bündeln Listen. Umbenennen per Stift-Symbol.
- **Listen** liegen in genau einem Ordner. Die Startseite zeigt alle Ordner mit ihren
  Listen und je Liste, wie viele Einträge offen bzw. erledigt sind.
- **Einträge** haben Text, optional eine **Menge** und optional einen **Link oder eine
  Notiz**. Links werden anklickbar dargestellt.

### Einträge erfassen
- Menge wird beim Tippen automatisch erkannt: `2x Milch`, `500g Kaffee`, `1 Pck Butter`
  landen als Menge + Text getrennt in der Liste.
- **Doppelte Einträge werden zusammengefasst.** Steht `2x Milch` schon offen auf der
  Liste und jemand trägt `3x Milch` ein, wird daraus `5x Milch` – statt zweier Zeilen.
  Nur gleiche Einheiten werden addiert.

### Arbeiten mit einer Liste
- Antippen erledigt einen Eintrag; der Text wird durchgestrichen und die Zeile rutscht
  nach unten.
- **Reihenfolge ändern**: am Griff ⠿ ziehen – z. B. passend zum Weg durch den
  Supermarkt. Nahe am Bildschirmrand scrollt die Liste automatisch mit. Erledigte
  Einträge haben keinen Griff, ihre Position ergibt sich aus dem Erledigt-Status.
- Über **⋯** je Eintrag: Text, Menge und Notiz bearbeiten oder den Eintrag löschen.
  Dort steht auch, wer ihn zuletzt geändert hat.

### Liste abschließen (Menü **⋯** oben rechts)
- **Abschließen – Rest behalten**: legt einen datierten Schnappschuss der kompletten
  Liste ins Archiv, löscht die erledigten Einträge und lässt die offenen stehen. Der
  typische Wochenrhythmus beim Einkaufen.
- **Erledigte aufräumen**: entfernt nur die abgehakten Einträge.
- **Als Vorlage speichern**: friert die Liste als wiederverwendbare Vorlage ein.
- **Archivieren** / **Löschen**.

### Anstupsen (Push-Benachrichtigung)
Die **Glocke** oben rechts in einer Liste schickt allen anderen registrierten Geräten
eine Meldung:

> **Listen**
> Bitte Liste „Einkauf" checken, von Henri

Sie erscheint auf dem Sperrbildschirm, **auch wenn die App dort geschlossen ist** – das
Betriebssystem weckt dafür den Service-Worker. Ein Tipp auf die Meldung öffnet genau
diese Liste.

Einmalig pro Gerät: *Einstellungen → Benachrichtigungen einschalten*. Solange kein
zweites Gerät registriert ist, sagt die App das beim Tippen auf die Glocke.

Der **Absender** muss die App dagegen offen haben – nichts schickt von selbst eine
Meldung, wenn jemand einen Eintrag hinzufügt. Es gibt bewusst keine Empfängerauswahl:
Angestupst werden immer alle anderen Geräte.

**Auf dem iPhone geht das nur in der App vom Home-Bildschirm** (iOS 16.4+), nie in einem
Safari-Tab – dort versteckt die App die Glocke. Auf Android genügt der Browser.

### Vorlagen
Aus einer Vorlage entsteht per Tipp eine neue, frische Liste (alles unerledigt) – etwa
für den immer gleichen Wocheneinkauf. Vorlagen lassen sich bearbeiten und löschen.

### Archiv
Archivierte Listen bleiben **nach Ordner sortiert** – eine archivierte *Supermarkt*-Liste
steht weiter unter *Einkauf*. Listen, deren Ordner gelöscht wurde, sammeln sich unter
*Ohne Gruppe*. Von dort: wiederherstellen, ansehen, einzeln oder komplett löschen.

### Navigation
Der Android-Zurück-Knopf und die iOS-Wischgeste gehen **einen Schritt in der Oberfläche
zurück** – sie machen nie eine Änderung rückgängig. Ein Detail-Formular schließt sich
vor der Liste, die Liste führt zurück zur Übersicht. Eine aus dem Archiv geöffnete Liste
führt zurück ins Archiv. Auf der Startseite schließt Zurück die App.

### Offline und Sync
- Alles funktioniert **offline**. Änderungen werden lokal gespeichert und nachgereicht,
  sobald wieder Netz da ist.
- Automatisch synchronisiert wird alle 15 Sekunden, kurz nach jeder Änderung und beim
  Schließen der App. Ein Tipp auf die Statuspille synchronisiert sofort.
- Die Pille zeigt: `aktuell`, `sync…`, `Sync?` (Sync fehlgeschlagen) oder `nur lokal`
  (der Browser lässt keinen dauerhaften Speicher zu – die Daten überleben das Schließen
  dann nicht).

### Demo-Modus
Beim ersten Start lässt sich „Erstmal ohne GMX testen" wählen: alles bleibt auf diesem
Gerät. Gut zum Ausprobieren, ohne Zugangsdaten einzugeben.

---

## Wie das Zusammenführen funktioniert

Beide Geräte schreiben dieselbe Datei. Statt sie stumpf zu überschreiben, führt die App
Ordner, Listen und **jeden einzelnen Eintrag** anhand eines Zeitstempels (`updatedAt`)
zusammen: Die jeweils neuere Fassung gewinnt, bei Gleichstand die lokale. Zwei Personen
können also gleichzeitig an derselben Liste arbeiten, ohne sich zu überschreiben.

Gelöschtes wird nicht sofort entfernt, sondern 30 Tage lang als Grabstein markiert –
sonst würde ein länger offline gewesenes Gerät die Löschung wieder rückgängig machen.

Dieselbe Datei trägt unter `devices` auch die **Push-Abos** beider Handys. Sie brauchen
deshalb keinen eigenen Speicher: Der vorhandene Merge verteilt sie, und der Worker bleibt
zustandslos. Ein Abo verschwindet nur, wenn der Push-Dienst es mit `404`/`410` für
ungültig erklärt – der 30-Tage-Aufräumer fasst nur Grabsteine an, nie lebende Einträge.

**Grenzen:** Ein Gerät, das länger als 30 Tage offline war, kann gelöschte Einträge
zurückbringen. Sortieren zwei Geräte dieselbe Liste gleichzeitig um, kann sich die
Reihenfolge vermischen. Ordner lassen sich (noch) nicht löschen, und eine Liste lässt
sich nicht in einen anderen Ordner verschieben.

---

## Sicherheit und Privatsphäre

Die Listen liegen ausschließlich in deiner GMX-Cloud. Der Cloudflare-Worker reicht
Anfragen nur durch und **speichert nichts**; er existiert allein deshalb, weil der
Browser die GMX-Cloud aus Sicherheitsgründen nicht direkt ansprechen darf (CORS).

### Immer ein anwendungsspezifisches Passwort
In GMX die 2-Faktor-Authentifizierung aktivieren und unter *Sicherheit* ein
**anwendungsspezifisches Passwort** erzeugen. **Nicht** das Konto-Passwort verwenden.

Grund: Die Zugangsdaten liegen im Klartext im `localStorage` des Handys und laufen bei
jedem Sync durch den Cloudflare-Worker. Beides lässt sich in dieser Architektur nicht
vermeiden. Ein App-Passwort gilt nur für WebDAV und lässt sich einzeln zurückziehen,
ohne das GMX-Konto anzufassen – es begrenzt den Schaden, falls es je abhandenkommt.
Das Konto-Passwort täte das nicht.

### Absicherung des Workers
Der Worker akzeptiert nur die Origin `https://hpekeler.github.io`, nur Pfade der Form
`/name.json` und nur `GET`/`PUT` mit `Basic`-Authentifizierung. Unauthentifizierte oder
fremde Anfragen erreichen GMX gar nicht erst.

Wichtig zur Einordnung: Die Origin-Prüfung bremst **nur Browser**. Ein `curl`-Aufruf kann
den Header fälschen. Sie spart Last und stoppt Gelegenheits-Scans; die eigentliche Bremse
gegen Missbrauch als anonymisierendes Relay ist eine **Rate-Limiting-Regel auf der
Worker-Route** in der Cloudflare-Konsole.

### Absicherung der Push-Route
Bei `/push` steht die Ziel-Adresse im Request-Body. Ohne Prüfung wäre der Worker damit ein
Werkzeug, um in fremdem Namen beliebige Adressen anzufragen (SSRF). Er lässt deshalb nur
`https` zu echten Push-Diensten durch – Apple, Google, Mozilla, Microsoft – und weist
alles andere mit `400` ab, **bevor** er irgendetwas anfragt.

Was danach bleibt: Wer eine gültige Abo-Adresse kennt, kann darüber Meldungen schicken.
Diese Adressen sind lange Zufallszeichenketten und stehen nur in deiner GMX-Datei. Ein
Token in der `index.html` brächte nichts – die Datei liegt öffentlich auf GitHub Pages.
Auch hier ist die Rate-Limiting-Regel die eigentliche Bremse; sie sollte `/push`
mit abdecken.

Der **private VAPID-Schlüssel** liegt als Cloudflare-Secret und verlässt den Worker nie.
Die Nachricht wird erst im Worker verschlüsselt (RFC 8291): Weder Apple noch Google sehen,
welche Liste gemeint ist.

---

## Aufbau des Projekts

| Datei | Läuft wo | Zweck |
|---|---|---|
| `index.html` | GitHub Pages | Die komplette App: Oberfläche, Datenmodell, Sync |
| `sw.js` | GitHub Pages | Service-Worker: Offline-Betrieb, Caching, Push-Empfang |
| `manifest.json` | GitHub Pages | PWA-Metadaten (Name, Icons, Farben) |
| `icon-*.png`, `apple-touch-icon.png` | GitHub Pages | App-Icons |
| `.nojekyll` | GitHub Pages | Verhindert, dass Jekyll die Dateien anfasst |
| `worker.js` | **Cloudflare** | WebDAV-Proxy zu GMX + Push-Versand. Wird von Pages *nicht* ausgeliefert |
| `tools/gen-vapid.mjs` | einmalig lokal | Erzeugt das VAPID-Schlüsselpaar für Push |

Der Service-Worker lädt die HTML-Datei „network-first" (Updates kommen sofort an, offline
greift der Cache) und Icons „cache-first".

Die App findet den Worker über die feste Konstante `PROXY_BASE` ganz oben im
`<script>`-Block von `index.html`; daneben steht `VAPID_PUBLIC`.

### Zwei Dinge heißen „Worker"
Leicht zu verwechseln, aber unabhängig voneinander:

- Der **Cloudflare-Worker** (`worker.js`) läuft in Cloudflares Rechenzentrum, und nur
  solange er eine Anfrage bearbeitet. An der Zustellung einer Meldung ist er nicht
  beteiligt – er übergibt sie verschlüsselt an Apple bzw. Google.
- Der **Service-Worker** (`sw.js`) liegt auf dem Handy. Ihn weckt das Betriebssystem,
  wenn eine Meldung eintrifft, über dieselbe Verbindung wie bei jeder anderen App. Die
  App muss dafür nicht laufen.

Ist das Handy offline, hält der Push-Dienst die Meldung 24 Stunden (`TTL`) vor und stellt
sie zu, sobald es wieder Netz hat.

---

## Deployment

### Einmalig: GitHub Pages
Repository-Einstellungen → *Pages* → Quelle `master` / Branch-Root. HTTPS ist bei
`github.io` automatisch aktiv und für PWA + Service-Worker zwingend nötig.
Die App liegt danach unter `https://hpekeler.github.io/listen/`.

### Einmalig: VAPID-Schlüssel für Push
Ohne dieses Schlüsselpaar identifiziert sich niemand gegenüber Apple und Google, und die
Glocke bleibt versteckt. Einmal erzeugen – ein **neues Paar macht alle bestehenden Abos
ungültig**:

```bash
node tools/gen-vapid.mjs
```

Die drei ausgegebenen Werte als Cloudflare-Secrets ablegen:

```bash
npx wrangler secret put VAPID_PRIVATE_JWK   # der private Teil, bleibt geheim
npx wrangler secret put VAPID_PUBLIC        # der öffentliche Teil
npx wrangler secret put VAPID_SUBJECT       # mailto:deine@adresse.de
```

`VAPID_SUBJECT` **muss** mit `mailto:` oder `https:` beginnen – Apple antwortet sonst
mit `403`. Anschließend `VAPID_PUBLIC` zusätzlich in `index.html` eintragen (ersetzt den
Platzhalter `DEIN-VAPID-PUBLIC-KEY`).

### Einmalig: Cloudflare-Worker
`worker.js` läuft unter `https://listen-sync.henri-pekeler.workers.dev`.
Deployen mit `npx wrangler deploy` oder per Copy-and-paste in der Cloudflare-Konsole.

**Reihenfolge:** erst den Worker deployen, dann die neue `index.html` auf Pages schieben.
Andersherum ruft die App eine `/push`-Route auf, die es noch nicht gibt.

Danach in der Cloudflare-Konsole eine **Rate-Limiting-Regel** auf die Worker-Route legen –
sie sollte `/push` mit abdecken.

### Einmalig: auf die Handys
1. `https://hpekeler.github.io/listen/` im Handy-Browser öffnen.
2. iPhone: Teilen → „Zum Home-Bildschirm". Android: „App installieren".
   Auf dem iPhone ist dieser Schritt **Voraussetzung für Benachrichtigungen**.
3. Einrichten: Name, GMX-Adresse, **anwendungsspezifisches Passwort**, Pfad
   `/listen.json` – auf beiden Geräten identisch.
4. *Einstellungen → Benachrichtigungen einschalten* – auf **beiden** Geräten, sonst hat
   die Glocke niemanden zum Anstupsen.

### Updates einspielen
1. Datei(en) ändern.
2. In `sw.js` die Zeile `const CACHE = 'listen-vN';` **hochzählen** (z. B. v10 → v11) –
   sonst liefern die Handys unter Umständen die alte Version aus dem Cache.
3. `git commit` + `git push`. Pages baut automatisch neu; die Handys holen die neue
   Version beim nächsten Öffnen.
4. **Nur wenn `worker.js` geändert wurde:** zusätzlich zu Cloudflare deployen.
   GitHub Pages liefert `worker.js` nicht aus – ein `git push` allein ändert am Worker
   nichts.

### Stolperfallen
- **Der Pfad muss `/name.json` sein**, ohne Unterordner. Der Worker weist alles andere
  mit `400` ab. Voreinstellung und Empfehlung: `/listen.json`.
- **Beide Geräte müssen die neue Version haben, bevor Push zuverlässig ist.** Eine alte
  `index.html` kennt das Feld `devices` nicht: Sie liest die Datei, schreibt sie ohne
  dieses Feld zurück – und löscht damit beide Abos. Sobald beide aktualisiert sind, kann
  das nicht mehr passieren.
- **Push scheitert lautlos, wenn der Empfänger nie „Benachrichtigungen einschalten"
  getippt hat.** Der Absender sieht dann *„Kein anderes Gerät registriert"*.
- **Meldung kommt an, aber der Tipp öffnet die falsche Ansicht?** Der Service-Worker
  wurde nicht erneuert. `CACHE` in `sw.js` hochzählen.
- **Die Adresse ist festgeschrieben.** Zieht die Seite je auf eine andere Domain um,
  muss `ALLOWED_ORIGINS` in `worker.js` mitwandern – sonst blockiert der Browser jeden
  Sync mit `403`. Dasselbe gilt beim Testen von `localhost` aus.
- **Ändert sich die Worker-URL**, nur die eine Zeile `PROXY_BASE` in `index.html`
  anpassen.
- Ein neuer Origin ist für die Handys eine **frische Installation** (leerer
  `localStorage`). Die Listen liegen in GMX und gehen dabei nicht verloren, die
  Zugangsdaten müssen aber neu eingetragen werden.
