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

---

## Aufbau des Projekts

| Datei | Läuft wo | Zweck |
|---|---|---|
| `index.html` | GitHub Pages | Die komplette App: Oberfläche, Datenmodell, Sync |
| `sw.js` | GitHub Pages | Service-Worker: Offline-Betrieb, Caching |
| `manifest.json` | GitHub Pages | PWA-Metadaten (Name, Icons, Farben) |
| `icon-*.png`, `apple-touch-icon.png` | GitHub Pages | App-Icons |
| `.nojekyll` | GitHub Pages | Verhindert, dass Jekyll die Dateien anfasst |
| `worker.js` | **Cloudflare** | WebDAV-Proxy zu GMX. Wird von Pages *nicht* ausgeliefert |

Der Service-Worker lädt die HTML-Datei „network-first" (Updates kommen sofort an, offline
greift der Cache) und Icons „cache-first".

Die App findet den Worker über die feste Konstante `PROXY_BASE` ganz oben im
`<script>`-Block von `index.html`.

---

## Deployment

### Einmalig: GitHub Pages
Repository-Einstellungen → *Pages* → Quelle `master` / Branch-Root. HTTPS ist bei
`github.io` automatisch aktiv und für PWA + Service-Worker zwingend nötig.
Die App liegt danach unter `https://hpekeler.github.io/listen/`.

### Einmalig: Cloudflare-Worker
`worker.js` läuft unter `https://listen-sync.henri-pekeler.workers.dev`.
Deployen mit `npx wrangler deploy` oder per Copy-and-paste in der Cloudflare-Konsole.

Danach in der Cloudflare-Konsole eine **Rate-Limiting-Regel** auf die Worker-Route legen.

### Einmalig: auf die Handys
1. `https://hpekeler.github.io/listen/` im Handy-Browser öffnen.
2. iPhone: Teilen → „Zum Home-Bildschirm". Android: „App installieren".
3. Einrichten: Name, GMX-Adresse, **anwendungsspezifisches Passwort**, Pfad
   `/listen.json` – auf beiden Geräten identisch.

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
- **Die Adresse ist festgeschrieben.** Zieht die Seite je auf eine andere Domain um,
  muss `ALLOWED_ORIGINS` in `worker.js` mitwandern – sonst blockiert der Browser jeden
  Sync mit `403`. Dasselbe gilt beim Testen von `localhost` aus.
- **Ändert sich die Worker-URL**, nur die eine Zeile `PROXY_BASE` in `index.html`
  anpassen.
- Ein neuer Origin ist für die Handys eine **frische Installation** (leerer
  `localStorage`). Die Listen liegen in GMX und gehen dabei nicht verloren, die
  Zugangsdaten müssen aber neu eingetragen werden.
