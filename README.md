# 🌍 Flaggenspaß

Ein Browser-Quiz zum Erraten von Länderflaggen — mit Mehrfachauswahl der Kontinente, drei Antwortmodi, Lern- und Profimodus, Zeitbonus und einer **zentralen, geteilten Bestenliste**. Läuft direkt im Browser, keine Installation nötig, und lässt sich auf dem iPhone als eigenständige App-artige PWA einrichten.

**👉 Jetzt spielen: [stan2003sf.github.io/Flaggenquiz](https://stan2003sf.github.io/Flaggenquiz/)**

<p align="center">
  <img src="flaggenquiz-qr.png" alt="QR-Code zum Flaggenspaß" width="260">
</p>

## ✨ Features

### Grundspiel
- **197 Länder** aus allen Kontinenten, Flaggenbilder ([flagpedia.net](https://flagpedia.net)) liegen lokal im Projekt, immer vollständig ohne Beschnitt dargestellt
- **Mehrfachauswahl der Kontinente** — beliebig kombinierbar, nicht nur "alle" oder "einer", mit Klartext-Anzeige der aktuellen Auswahl (z. B. "Alle außer Afrika")
- Einstellungen (Kontinente, Rundenlänge, Modus) werden automatisch gemerkt und beim nächsten Besuch wiederhergestellt

### Drei Antwortmodi
- **Multiple Choice** — 4 Länder zur Auswahl, bis zu 2 Tipps entfernen je eine falsche Antwort
- **Reverse Multiple Choice** — der Ländername steht oben, 4 **Flaggen** stehen als Antwortoptionen zur Wahl
- **Texteingabe** — mit tippfehlertoleranter Prüfung; die erlaubte Abweichung skaliert automatisch mit der Namenslänge (kurze Namen wie "USA" bleiben streng, lange wie "Zentralafrikanische Republik" verzeihen mehr)

### Zusatzmodi
- **🎓 Lernmodus** — ohne Zeitdruck und ohne Highscore-Eintrag, nur zum Üben
- **🎯 Profimodus** — verschärft die Regeln: strenge 1-Zeichen-Tippfehlertoleranz im Textmodus, und bei beiden Multiple-Choice-Varianten stammen falsche Antworten ausschließlich aus den gewählten Kontinenten
- **⚡ Speedmodus** — Zeit läuft doppelt so schnell, schließt sich mit dem Lernmodus gegenseitig aus

### 🌐 Sprachumschalter
- Komplette Oberfläche auf Deutsch oder Englisch nutzbar (Umschalt-Button in den Einstellungen), inklusive sprachabhängiger Ländernamen in allen Antwortmodi
- Erkennt beim allerersten Besuch automatisch die Browsersprache, merkt sich danach die manuelle Wahl dauerhaft

### ⛰️ Gipfelsturm
- Durchläuft automatisch alle 197 Länder, sortiert von bekannt nach unbekannt (basierend auf einer geräteübergreifenden, anonymen Trefferquote-Statistik pro Land)
- 5 Leben, bei je 50 richtigen Antworten ein Leben zurück (max. 5) sowie ein neues Fortschritts-Abzeichen (🧢/🎓/🎩)
- Wer alle 197 Flaggen schafft, erhält die Krone 👑 — sichtbar neben dem Namen in jeder Bestenliste, im Gruppenquiz und im Battle

### ⚔️ 1-gegen-1 Duell (Battle)
- Direktes Duell per 5-stelligem Code oder QR-Code, gemeinsam gewählter Kontinent-Pool
- Beide Spieler:innen dürfen sich gegenseitig 3 geheime Fallen-Flaggen unterjubeln, 5 Leben pro Person
- Eigene Battle-Bestenliste (Anzahl gewonnener Duelle)

### 🎖️ Erfolge & Titel
- Kontinent-, Meta-, Gipfelsturm-Meilenstein- und Siegesserien-Erfolge, live aus der vorhandenen Spielstatistik berechnet
- Freigeschaltete Erfolge lassen sich als Titel auswählen, der dann überall (Bestenlisten, Gruppenquiz, Battle) neben dem eigenen Namen erscheint

### 🏆 Zentraler Bestenlisten-Hub
- Eine Übersicht für alle drei Bestenlisten-Arten (Entdecker-Modus je Kontinent-/Längen-/Modus-Kombination, Gipfelsturm, Battle) an einem Ort

### 🧑‍🏫 Gruppenquiz (z. B. für Schulklassen)
- **Gruppe erstellen**: Gruppenleiter:in (z. B. Lehrkraft) erhält einen kurzen 5-stelligen Code plus QR-Code zum Beitreten
- **Beitreten per Code oder QR-Scan** (`?gruppe=CODE` in der URL öffnet den Beitritt automatisch)
- **Live-Einstellungen**: Die Gruppenleitung wählt Kontinente, Rundenlänge und Modus zentral — Änderungen erscheinen bei allen Beigetretenen in Echtzeit; deren eigene Einstellungs-Buttons sind gesperrt (roter Rahmen + Hinweis)
- **Freigabe-Mechanik**: Der Start-Button der Mitspieler:innen bleibt gesperrt, bis die Leitung "Spiel freigeben" klickt; weitere Runden per "Nächste Runde starten"
- **Live-Teilnehmerliste** im Leiter-Banner (Nummer + Name), damit vor dem Start sichtbar ist, wer schon da ist — Namensänderungen der Spieler:innen werden live übernommen
- **Gruppen-Bestenliste** (getrennt von der globalen): pro Runde und als Gesamtwertung über alle Runden, live aktualisiert am Rundenende und jederzeit für die Leitung einsehbar
- **Gruppe schließen** löscht alle Gruppendaten (Sitzung, Ergebnisse, Teilnehmerliste); zusätzlich laufen Gruppen nach 12 Stunden automatisch ab und werden beim nächsten Erstellen einer neuen Gruppe beiläufig mit aufgeräumt
- Absicherung über einen geheimen, nur lokal auf dem Leiter-Gerät gespeicherten Leiter-Schlüssel (nur damit sind Einstellungsänderungen, Freigabe und Schließen möglich)

### Zentrale Bestenliste
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
├── index.html               # HTML-Grundgerüst aller Bildschirme, bindet css/ und js/ ein
├── css/
│   └── style.css            # Gesamtes Styling
├── js/                      # Spiellogik, aufgeteilt nach Bereich (gemeinsamer globaler Scope,
│                             #   kein Modul-System — Ladereihenfolge in index.html ist relevant)
│   ├── firebase-init.js     # Firebase-Konfiguration & -Initialisierung
│   ├── i18n.js               # Sprachumschalter DE/EN (Text-Mapping + Lookup)
│   ├── data-countries.js     # Länderdaten (Name DE/EN, ISO-Code, Kontinent, Hauptstädte)
│   ├── utils.js               # Hilfsfunktionen (Zufall, Tippfehlertoleranz, Namensfilter, Sound)
│   ├── core-state.js          # Zentraler Spielzustand (Einstellungen, laufende Runde)
│   ├── navigation.js          # Bildschirm-Navigation zwischen den Menü-Ebenen
│   ├── standard-settings.js   # Einstellungen-Screen des Entdecker-Modus
│   ├── highscore-ladder-stats.js # Globale Bestenlisten-Anzeige, Geräte-ID, Cache
│   ├── group-quiz.js          # Gruppenquiz (Leitung & Mitspieler:innen), persönliche Lernstatistik
│   ├── standard-game.js       # Entdecker-Modus (Spiellogik, Punkte, Rundenende)
│   ├── ladder-mode.js         # Gipfelsturm-Modus
│   ├── achievements.js        # Erfolgs-/Titel-System
│   ├── battle-mode.js         # 1-gegen-1 Duell (Battle)
│   ├── highscore-hub.js       # Zentraler Bestenlisten-Hub (alle drei Modi an einem Ort)
│   └── init.js                # Seiten-Initialisierung, Bindung der Menü-Buttons, PWA-Registrierung
├── manifest.json            # Web App Manifest für die PWA / Homescreen-Installation
├── service-worker.js        # Network-First-Caching für den Offline-Start der App-Hülle
├── flags/                   # Flaggenbilder (SVG) der 197 im Spiel enthaltenen Länder, Quelle: flagpedia.net
├── flagsns/                 # Flaggen von Gebieten/Territorien ohne eigenen Länder-Eintrag im Spiel (nicht eingebunden)
├── icon192.png               # App-Icon (192×192)
├── icon512.png                # App-Icon (512×512)
├── appletouchicon.png          # App-Icon für iOS
└── flaggenquiz-qr.png              # QR-Code zum schnellen Teilen/Öffnen der Seite
```

## 🛠️ Technischer Aufbau

- **Reines HTML/CSS/JavaScript** — kein Build-Prozess, kein Framework
- **Zentrale Bestenliste**: läuft über eine zentrale, geteilte Datenbank im Hintergrund (Lesen: öffentlich, Schreiben: nur strukturell gültige Top-50-Listen)
- **Flaggenbilder** liegen als SVG lokal im Projekt (`flags/`, Quelle: [flagpedia.net](https://flagpedia.net)) — dafür ist beim Spielen keine Internetverbindung nötig; nur Bestenliste und Mehrspieler-Funktionen brauchen eine Verbindung
- Gehostet über **GitHub Pages** (rein statisches Hosting)
- Service Worker arbeitet nach dem **"Network First"**-Prinzip: Updates sind sofort sichtbar, der Cache dient nur als Rückfallebene bei fehlender Internetverbindung

## 🚀 Selbst hosten

Da es sich um eine rein statische Seite handelt, reicht jeder Static-Site-Host:

- **GitHub Pages** (wie hier verwendet): Repository → Settings → Pages → Branch `main`, `/ (root)`
- **Netlify Drop**: Ordner mit allen Dateien auf [app.netlify.com/drop](https://app.netlify.com/drop) ziehen
- Lokal testen: Datei einfach im Browser öffnen (Achtung: Service Worker und die zentrale Bestenliste benötigen eine echte `http(s)`-Verbindung, kein `file://`)

## 📄 Weitere Dokumentation

Eine ausführliche technische Dokumentation (welche Plattform macht was, Wartungsaufgaben, vollständige Löschung des Projekts) existiert als `Flaggenquiz-Dokumentation.docx`, liegt aber nicht in diesem Repository.

## 📄 Lizenz

Noch keine Lizenz festgelegt — bei Bedarf hier ergänzen (z. B. MIT).
