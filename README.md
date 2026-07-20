# 🌍 Flaggenquiz

Ein Browser-Quiz zum Erraten von Länderflaggen — mit Mehrfachauswahl der Kontinente, drei Antwortmodi, Lern- und Profimodus, Zeitbonus und einer **zentralen, geteilten Bestenliste**. Läuft direkt im Browser, keine Installation nötig, und lässt sich auf dem iPhone als eigenständige App-artige PWA einrichten.

**👉 Jetzt spielen: [stan2003sf.github.io/Flaggenquiz](https://stan2003sf.github.io/Flaggenquiz/)**

<p align="center">
  <img src="flaggenquiz-qr.png" alt="QR-Code zum Flaggenquiz" width="260">
</p>

## ✨ Features

### Grundspiel
- **195 Länder** aus allen Kontinenten, Flaggenbilder live von [flagcdn.com](https://flagcdn.com), immer vollständig ohne Beschnitt dargestellt
- **Mehrfachauswahl der Kontinente** — beliebig kombinierbar, nicht nur "alle" oder "einer", mit Klartext-Anzeige der aktuellen Auswahl (z. B. "Alle außer Afrika")
- Einstellungen (Kontinente, Rundenlänge, Modus) werden automatisch gemerkt und beim nächsten Besuch wiederhergestellt

### Drei Antwortmodi
- **Multiple Choice** — 4 Länder zur Auswahl, bis zu 2 Tipps entfernen je eine falsche Antwort
- **Reverse Multiple Choice** — der Ländername steht oben, 4 **Flaggen** stehen als Antwortoptionen zur Wahl
- **Texteingabe** — mit tippfehlertoleranter Prüfung; die erlaubte Abweichung skaliert automatisch mit der Namenslänge (kurze Namen wie "USA" bleiben streng, lange wie "Zentralafrikanische Republik" verzeihen mehr)

### Zusatzmodi
- **🎓 Lernmodus** — ohne Zeitdruck und ohne Highscore-Eintrag, nur zum Üben
- **🎯 Profimodus** — verschärft die Regeln: strenge 1-Zeichen-Tippfehlertoleranz im Textmodus, und bei beiden Multiple-Choice-Varianten stammen falsche Antworten ausschließlich aus den gewählten Kontinenten

### 🧑‍🏫 Gruppenquiz (z. B. für Schulklassen)
- **Gruppe erstellen**: Gruppenleiter:in (z. B. Lehrkraft) erhält einen kurzen 5-stelligen Code plus QR-Code zum Beitreten
- **Beitreten per Code oder QR-Scan** (`?gruppe=CODE` in der URL öffnet den Beitritt automatisch)
- **Live-Einstellungen**: Die Gruppenleitung wählt Kontinente, Rundenlänge und Modus zentral — Änderungen erscheinen bei allen Beigetretenen in Echtzeit; deren eigene Einstellungs-Buttons sind gesperrt (roter Rahmen + Hinweis)
- **Freigabe-Mechanik**: Der Start-Button der Mitspieler:innen bleibt gesperrt, bis die Leitung "Spiel freigeben" klickt; weitere Runden per "Nächste Runde starten"
- **Live-Teilnehmerliste** im Leiter-Banner (Nummer + Name), damit vor dem Start sichtbar ist, wer schon da ist — Namensänderungen der Spieler:innen werden live übernommen
- **Gruppen-Bestenliste** (getrennt von der globalen): pro Runde und als Gesamtwertung über alle Runden, live aktualisiert am Rundenende und jederzeit für die Leitung einsehbar
- **Gruppe schließen** löscht alle Gruppendaten (Sitzung, Ergebnisse, Teilnehmerliste); zusätzlich laufen Gruppen nach 12 Stunden automatisch ab und werden beim nächsten Erstellen einer neuen Gruppe beiläufig mit aufgeräumt
- Absicherung über einen geheimen, nur lokal auf dem Leiter-Gerät gespeicherten Leiter-Schlüssel (nur damit sind Einstellungsänderungen, Freigabe und Schließen möglich)

### Zentrale Bestenliste (Firebase Firestore)
- **Top 50** pro Kontinent-/Längen-/Modus-Kombination, mit Medaillen 🥇🥈🥉 für die ersten drei Plätze
- **Nur der persönliche Bestwert zählt** — schlechtere Wiederholungen erzeugen keinen neuen Eintrag, sondern werden ignoriert; ein neuer Bestwert ersetzt automatisch den alten
- Erkennung über eine unsichtbare Geräte-ID, mit Namens-Fallback bei Gerätewechsel
- **Namens-Kollisionsschutz**: Ist ein Name bereits unter einer anderen Geräte-ID vergeben, erscheint vor Rundenstart die Meldung "Name bereits vergeben"
- Eigener Nickname, wird lokal gemerkt; beim allerersten Spielstart automatisch mit einem freundlichen, zufälligen Fantasienamen vorbelegt (z. B. "Fröhlicher Falke 42")
- **Jugendschutz-Namensfilter**: blockiert gängige Schimpfwörter, sexualisierte Begriffe und Beleidigungen (Deutsch, Englisch, Türkisch, Arabisch inkl. gängiger Umgehungsversuche wie Leetspeak) — betroffene Namen werden automatisch durch einen neuen Fantasienamen ersetzt

### Persönliche Lernstatistik
- Läuft komplett lokal auf dem eigenen Gerät (unabhängig von der zentralen Bestenliste)
- Zeigt Gesamt-Trefferquote sowie die Länder, bei denen am häufigsten danebengelegen wird
- Mit kurzer Erklärung direkt im Popup, jederzeit zurücksetzbar

### Sonstiges
- **Zeitbonus** mit visuellem Countdown-Balken (zeigt nur den Verlauf, keine Zahl) für schnelle richtige Antworten
- **Sound-Mute-Button**, auf jedem Bildschirm erreichbar, Einstellung wird gemerkt
- **Datenschutz-Hinweis** direkt auf der Startseite abrufbar
- **Als "App" nutzbar:** Progressive Web App (PWA) mit eigenem Icon, Vollbildmodus und Offline-Start der App-Hülle über Safari → "Zum Home-Bildschirm"
- Responsives Design, kompakte Spielfläche ohne Scrollen auf dem Smartphone optimiert

## 📱 Installation auf dem iPhone

1. Seite in **Safari** öffnen (wichtig: nur Safari unterstützt das)
2. Teilen-Symbol antippen
3. **"Zum Home-Bildschirm"** wählen
4. Fertig — eigenes App-Icon, startet im Vollbildmodus

## 🗂️ Projektstruktur

```
├── index.html              # Hauptdatei (identisch zu Flaggenquiz.html, für Root-URL)
├── Flaggenquiz.html         # Hauptdatei (Spiellogik, HTML, CSS, JS, Firebase-Anbindung in einer Datei)
├── manifest.json            # Web App Manifest für die PWA / Homescreen-Installation
├── service-worker.js        # Network-First-Caching für den Offline-Start der App-Hülle
├── icon-192.png              # App-Icon (192×192)
├── icon-512.png                # App-Icon (512×512)
├── apple-touch-icon.png          # App-Icon für iOS (180×180)
├── flaggenquiz-qr.png              # QR-Code zum schnellen Teilen/Öffnen der Seite
└── Flaggenquiz-Dokumentation.docx   # Technische Doku & Wartungsanleitung (nicht Teil der Live-Seite)
```

## 🛠️ Technischer Aufbau

- **Reines HTML/CSS/JavaScript** — kein Build-Prozess, kein Framework
- **Firebase Firestore** für die zentrale Bestenliste (Lesen: öffentlich, Schreiben: nur strukturell gültige Top-50-Listen, siehe Sicherheitsregeln unten)
- **Flaggenbilder** werden live von der kostenlosen [flagcdn.com](https://flagcdn.com)-API geladen — dafür ist beim Spielen eine Internetverbindung nötig
- Gehostet über **GitHub Pages** (rein statisches Hosting)
- Service Worker arbeitet nach dem **"Network First"**-Prinzip: Updates sind sofort sichtbar, der Cache dient nur als Rückfallebene bei fehlender Internetverbindung

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
                      && request.resource.data.entries.size() <= 50
                      && request.resource.data.keys().hasOnly(['entries']);
       }

       match /gruppen/{code} {
         allow read: if true;
         allow create: if request.resource.data.keys().hasOnly(['leaderToken','status','round','createdAt','expiresAt'])
                       && request.resource.data.leaderToken is string
                       && request.resource.data.status == 'warten';
         allow update: if request.resource.data.leaderToken == resource.data.leaderToken;
         allow delete: if resource.data.expiresAt < request.time;

         match /ergebnisse/{deviceId} {
           allow read: if true;
           allow create, update: if request.resource.data.keys().hasOnly(['name','roundScores','updatedAt'])
                                 && request.resource.data.name is string
                                 && request.resource.data.roundScores is map;
           allow delete: if get(/databases/$(database)/documents/gruppen/$(code)).data.status == 'beendet'
                         || get(/databases/$(database)/documents/gruppen/$(code)).data.expiresAt < request.time;
         }

         match /teilnehmer/{deviceId} {
           allow read: if true;
           allow create, update: if request.resource.data.keys().hasOnly(['name','joinedAt'])
                                 && request.resource.data.name is string;
           allow delete: if true;
         }
       }

     }
   }
   ```
4. Eigene Web-App registrieren (Projekteinstellungen → "App hinzufügen" → Web `</>`)
5. Den `firebaseConfig`-Block am Anfang von `Flaggenquiz.html` (und `index.html`) durch die eigenen Werte ersetzen
6. Im Google-Cloud-Projekt (automatisch mit Firebase verknüpft) den API-Schlüssel unter "Anmeldedaten" auf die eigene Domain einschränken (HTTP-Verweis-URLs)

## 🚀 Selbst hosten

Da es sich um eine rein statische Seite handelt, reicht jeder Static-Site-Host:

- **GitHub Pages** (wie hier verwendet): Repository → Settings → Pages → Branch `main`, `/ (root)`
- **Netlify Drop**: Ordner mit allen Dateien auf [app.netlify.com/drop](https://app.netlify.com/drop) ziehen
- Lokal testen: Datei einfach im Browser öffnen (Achtung: Service Worker und Firestore benötigen eine echte `http(s)`-Verbindung, kein `file://`)

## 📄 Weitere Dokumentation

Eine ausführliche technische Dokumentation (welche Plattform macht was, Wartungsaufgaben, vollständige Löschung des Projekts) liegt als `Flaggenquiz-Dokumentation.docx` bei.

## 📄 Lizenz

Noch keine Lizenz festgelegt — bei Bedarf hier ergänzen (z. B. MIT).
