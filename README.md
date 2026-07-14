# 🌍 Flaggenquiz

Ein Browser-Quiz zum Erraten von Länderflaggen — mit Mehrfachauswahl der Kontinente, Multiple-Choice- oder Texteingabe-Modus, Zeitbonus und einer **zentralen, geteilten Bestenliste**. Läuft direkt im Browser, keine Installation nötig, und lässt sich auf dem iPhone als eigenständige App-artige PWA einrichten.

**👉 Jetzt spielen: [stan2003sf.github.io/Flaggenquiz](https://stan2003sf.github.io/Flaggenquiz/)**

<p align="center">
  <img src="flaggenquiz-qr.png" alt="QR-Code zum Flaggenquiz" width="260">
</p>

## ✨ Features

- **195 Länder** aus allen Kontinenten, Flaggenbilder live von [flagcdn.com](https://flagcdn.com)
- **Mehrfachauswahl der Kontinente** — beliebig kombinierbar, nicht nur "alle" oder "einer"
- **Zwei Antwortmodi:**
  - *Texteingabe* mit toleranter Prüfung (Tippfehler, Akzente/Umlaute werden verziehen)
  - *Multiple Choice* mit bis zu zwei Tipps, die je eine falsche Antwort entfernen
- **Zeitbonus** mit visuellem Countdown-Balken für schnelle richtige Antworten
- **Zentrale Top-3-Bestenliste** über Firebase Firestore — alle Spieler:innen treten gegeneinander an, pro Kontinent-/Längen-/Modus-Kombination getrennt
- **Eigener Nickname**, wird lokal gemerkt
- **Als "App" nutzbar:** Progressive Web App (PWA) mit eigenem Icon, Vollbildmodus und Offline-Start der App-Hülle über Safari → "Zum Home-Bildschirm"
- Responsives Design, optimiert für Smartphone und Desktop

## 📱 Installation auf dem iPhone

1. Seite in **Safari** öffnen (wichtig: nur Safari unterstützt das)
2. Teilen-Symbol antippen
3. **"Zum Home-Bildschirm"** wählen
4. Fertig — eigenes App-Icon, startet im Vollbildmodus

## 🗂️ Projektstruktur

```
├── index.html              # Hauptdatei (identisch zu Flaggenquiz.html, für Root-URL)
├── Flaggenquiz.html         # Hauptdatei (Spiel-Logik, HTML, CSS, JS in einer Datei)
├── manifest.json            # Web App Manifest für die PWA / Homescreen-Installation
├── service-worker.js        # Cached die App-Hülle für den Offline-Start
├── icon-192.png              # App-Icon (192×192)
├── icon-512.png               # App-Icon (512×512)
├── apple-touch-icon.png        # App-Icon für iOS (180×180)
└── flaggenquiz-qr.png            # QR-Code zum schnellen Teilen/Öffnen der Seite
```

## 🛠️ Technischer Aufbau

- **Reines HTML/CSS/JavaScript** — kein Build-Prozess, kein Framework
- **Firebase Firestore** für die zentrale Bestenliste (Lesen: öffentlich, Schreiben: nur begrenzt validierte Top-3-Einträge, siehe Sicherheitsregeln unten)
- **Flaggenbilder** werden live von der kostenlosen [flagcdn.com](https://flagcdn.com)-API geladen — dafür ist beim Spielen eine Internetverbindung nötig
- Gehostet über **GitHub Pages** (rein statisches Hosting)

### Eigene Firebase-Instanz einrichten

Wer das Projekt forkt und eine eigene, unabhängige Bestenliste möchte:

1. Eigenes Firebase-Projekt unter [console.firebase.google.com](https://console.firebase.google.com) anlegen
2. **Firestore Database** aktivieren
3. Unter **Firestore → Regeln** folgende Regeln setzen:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /highscores/{docId} {
         allow read: if true;
         allow write: if request.resource.data.entries is list
                      && request.resource.data.entries.size() <= 3
                      && request.resource.data.keys().hasOnly(['entries']);
       }
     }
   }
   ```
4. Eigene Web-App registrieren (Projekteinstellungen → "App hinzufügen" → Web `</>`)
5. Den `firebaseConfig`-Block am Anfang von `Flaggenquiz.html` (und `index.html`) durch die eigenen Werte ersetzen

## 🚀 Selbst hosten

Da es sich um eine rein statische Seite handelt, reicht jeder Static-Site-Host:

- **GitHub Pages** (wie hier verwendet): Repository → Settings → Pages → Branch `main`, `/ (root)`
- **Netlify Drop**: Ordner mit allen Dateien auf [app.netlify.com/drop](https://app.netlify.com/drop) ziehen
- Lokal testen: Datei einfach im Browser öffnen (Achtung: Service Worker und Firestore benötigen eine echte `http(s)`-Verbindung, kein `file://`)

## 📄 Lizenz

Noch keine Lizenz festgelegt — bei Bedarf hier ergänzen (z. B. MIT).
