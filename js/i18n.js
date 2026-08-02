// ================= i18n: Sprachumschalter DE/EN =================
// Phase 1: Grundgerüst (Text-Mapping + Lookup + Re-Render) plus Ebene 0/Hauptmenü, Namens-Card
// und Einstellungen-Screen. Weitere Bereiche (Spielmodi, Gruppenquiz, Bestenliste-Hub, Hilfe/
// Datenschutz) werden in späteren Phasen ergänzt -- bis dahin bleiben sie auch bei "EN" auf
// Deutsch, da für sie noch keine Übersetzungs-Keys existieren.

const LANG_STORAGE_KEY = "flagquiz_lang";

// Nur beim ALLERERSTEN Besuch (noch keine gespeicherte Sprachwahl) die Browsersprache auswerten:
// alles außer Deutsch startet auf Englisch. Sobald einmal eine Sprache gewählt/gespeichert wurde,
// hat diese immer Vorrang -- kein erneutes Auto-Erkennen bei jedem Laden.
function detectBrowserLang() {
    try {
        const langs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ""];
        const primary = (langs[0] || "").toLowerCase();
        return primary.startsWith("de") ? "de" : "en";
    } catch (e) { return "de"; }
}

const storedLang = localStorage.getItem(LANG_STORAGE_KEY);
let currentLang = (storedLang === "en" || storedLang === "de") ? storedLang : detectBrowserLang();

const TRANSLATIONS = {
    de: {
        appTitle: "Flaggenspaß",
        subtitle: "Flaggen raten, Wissen sammeln!",
        offlineWarning: "⚠️ Keine oder schlechte Internetverbindung — Bestenliste und Mehrspieler-Funktionen sind möglicherweise eingeschränkt.",
        nicknameEditHint: "Name ändern",
        nicknameFallback: "Dein Name",

        "mainMenu.singlePlayer.title": "Einzelspieler",
        "mainMenu.singlePlayer.sub": "Entdecker-Modus oder Gipfelsturm — allein spielen",
        "mainMenu.multiPlayer.title": "Mehrspieler",
        "mainMenu.multiPlayer.sub": "Gruppenquiz oder 1-gegen-1 Duell",
        "mainMenu.settingsTile.title": "Einstellungen",
        "mainMenu.settingsTile.sub": "Ton, Sprache und mehr",
        "mainMenu.stats.title": "Meine Statistik",
        "mainMenu.stats.sub": "Deine persönliche Lernauswertung",
        "mainMenu.achievements.title": "Erfolge",
        "mainMenu.achievements.sub": "Titel freischalten und anzeigen",
        "mainMenu.highscoreHub.title": "Bestenliste",
        "mainMenu.highscoreHub.sub": "Alle Ranglisten an einem Ort",

        "footer.help": "❓ Hilfe",
        "footer.privacy": "🔒 Datenschutz",
        "footer.flagCredit": "Flaggenbilder:",

        "settings.back": "⬅️ Zurück",
        "settings.heading": "⚙️ Einstellungen",
        "settings.nameLabel": "Dein Name",
        "settings.namePlaceholder": "z. B. Max",
        "settings.nameHint": "Wird in der Bestenliste angezeigt, wenn du eine Runde beendest.",
        "settings.muteOn": "🔊 Ton: AN",
        "settings.muteOff": "🔇 Ton: AUS",
        "settings.muteTitleWhenMuted": "Sound einschalten",
        "settings.muteTitleWhenUnmuted": "Sound ausschalten",
        "settings.languageButton": "Sprache: DE",

        "common.anonymous": "Anonym",
        "common.back": "⬅️ Zurück",
        "common.mainMenuBack": "⬅️ Hauptmenü",
        "common.backToModeMenu": "⬅️ Zurück zum Modus-Menü",
        "common.continue": "Weiter ➜",
        "common.online": "🌐 zentrale Bestenliste",
        "common.offline": "📴 offline (nur lokal)",
        "common.loading": "Bestenliste wird geladen …",

        "multiPlayerMenu.heading": "👥 Mehrspieler",
        "multiPlayerMenu.battle.title": "1-gegen-1 Duell",
        "multiPlayerMenu.battle.sub": "Duell mit Fallen-Flaggen — wer übersteht mehr?",

        "common.flagLoadError": "Flagge konnte nicht geladen werden",
        "common.onlineTitle": "Zentrale, geteilte Bestenliste",
        "common.offlineTitle": "Keine Verbindung zur zentralen Bestenliste — zeigt deinen lokalen Stand",
        "common.beTheFirst": "Sei der Erste!",
        "common.loadingShort": "Wird geladen …",
        "common.localOnlyNote": " (nur lokal gespeichert, keine Verbindung zur zentralen Liste)",

        "ladder.tierCap": "Cap",
        "ladder.tierGrad": "Doktorhut",
        "ladder.tierTopHat": "Zylinder",
        "ladder.tierCrown": "Krone",
        "ladder.flagOf": "Flagge {a} von {b}",
        "ladder.milestoneTitle": "Leben aufgefüllt! ❤️",
        "ladder.milestoneBadgeEarned": "Du hast ein neues Abzeichen erreicht:",
        "ladder.minusOneLife": "-1 Leben",
        "ladder.confirmEnd": "Möchtest du den Gipfelsturm wirklich beenden? Dein Fortschritt in dieser Runde geht verloren.",
        "ladder.wonTitle": "Geschafft — du trägst jetzt die Krone!",
        "ladder.wonSub": "Alle {n} Flaggen durchlaufen. 👑",
        "ladder.lostTitle": "Runde beendet",
        "ladder.lostSub": "{reached} von {total} Flaggen geschafft.",
        "ladder.noRankInTop50": "Kein Platz in den Top 50 der Gipfelsturm-Bestenliste.",
        "ladder.rankLine": "Platz {rank} in der Gipfelsturm-Bestenliste (von {total}).",
        "ladder.noResultsYet": "Noch kein Gipfelsturm-Ergebnis",

        "settings.continentsLabel2": "🌍 Kontinent",
        "settings.lengthLabel2": "🔢 Anzahl Flaggen",
        "settings.modeLabel2": "🎮 Antwortmodus",
        "settings.continentMultiHint": "Mehrfachauswahl möglich",
        "modeButtons.mc": "🔤 Multiple Choice",
        "modeButtons.reverseMc": "🏳️ Umkehr Multiple Choice",
        "modeButtons.text": "⌨️ Text eingeben",
        "modeButtons.mixed": "🔀 Mixed",
        "settings.extraModeLabel": "⚙️ Spielmodus",
        "settings.learningModeHint": "Kein Zeitdruck und kein Highscore-Eintrag — nur Üben.",
        "settings.proModeHint": "Tippfehler werden strenger bewertet, und bei Multiple Choice kommen falsche Antworten nur aus den gewählten Kontinenten.",
        "settings.speedModeHint": "Zeit läuft doppelt so schnell (Zeitbonus-Fenster auf 5 Sek. halbiert). Läuft die Zeit ab, zählt die Frage automatisch als nicht beantwortet. Speedmodus und Lernmodus schließen sich gegenseitig aus.",
        "settings.viewHighscore": "🏆 Bestenliste ansehen",

        "highscore.noneYet": "Noch kein Highscore",
        "highscore.prestigeTitle": "Prestige: ",
        "highscore.points": "Pkt.",
        "highscore.allContinents": "alle Kontinente",

        "game.answerPlaceholder": "Land eingeben",
        "game.showTip": "💡 Tipp anzeigen",
        "game.solve": "Lösen",
        "game.next": "Weiter ➡️",
        "game.roundOver": "Runde beendet!",
        "game.points": "Punkte",
        "game.flagOf": "Flagge {a} von {b}",
        "game.learningModeNote": "🎓 Lernmodus — kein Zeitdruck, kein Highscore-Eintrag",
        "game.loadingFlags": "⏳ Flaggen werden geladen…",
        "game.flagsLoadError": "⚠️ Flaggen konnten nicht geladen werden.",
        "game.tipWrongRemoved1": "Eine falsche Antwort wurde entfernt.",
        "game.tipWrongRemoved2": "Noch eine falsche Antwort wurde entfernt.",
        "game.tipLetterCount": "Anzahl Buchstaben: ",
        "game.tipContinent": "Kontinent: ",
        "game.tipFirstLetter": "Erster Buchstabe: ",
        "game.correctFuzzy": "Richtig (kleiner Tippfehler toleriert)!",
        "game.correct": "Richtig!",
        "game.streakSuffix": "er Serie)",
        "game.correctAnswerWas": "Richtig wäre: ",
        "game.noAnswer": "(keine Antwort)",
        "game.learningRoundDone": "🎓 Lernrunde abgeschlossen!",
        "game.learningNoScoreNote": "Im Lernmodus werden keine Punkte gezählt und kein Highscore-Eintrag gespeichert — nur zum Üben.",
        "game.scoreReached": "Du hast {score} Punkte erreicht!",
        "game.groupScoreNote": "🚩 Deine Punkte fließen in die Gruppen-Bestenliste weiter unten ein.",
        "game.highscoreUpdating": "Bestenliste wird aktualisiert …",
        "game.noTop50": "Kein Platz in den Top 50.",
        "game.previousBestStillBetter": "Dein bisheriger Bestwert (Platz {rank}, {score} Punkte) ist bereits mindestens genauso gut — Eintrag bleibt unverändert.",
        "game.prestigeAgain": "Platz {rank} mit {score} Punkten erneut erreicht!",
        "game.newHighscore": "🥇 Neuer Highscore — Platz 1!",
        "game.newHighscoreBadge": "Top!",
        "game.rank2": "🥈 Stark! Platz 2 in der Bestenliste erreicht.",
        "game.rank3": "🥉 Platz 3 in der Bestenliste erreicht!",
        "game.rankOther": "🏅 Platz {rank} von {total} in der Bestenliste erreicht!",
        "game.closeToTop50": "Knapp kein Platz in den Top 50 — Platz 50 liegt bei {score} Punkten.",
        "game.allCorrect": "Alles richtig — stark! 🎉",
        "game.practiceWrongList": "Zum Üben — diese Länder waren falsch:",
        "game.yourAnswer": "deine Antwort: ",
        "game.confirmEnd": "Möchtest du das Quiz wirklich beenden? Dein aktueller Fortschritt in dieser Runde geht verloren.",
        "game.newPrestige": "💎 Neues Prestige erreicht! (jetzt {level}× {score} Punkte)",
        "game.newBestStreak": "🔥 Neue persönliche Bestserie: {n} in Folge!",
        "nickname.collision": "Name bereits vergeben – bitte wähle einen anderen Namen.",

        "battle.heading": "⚔️ 1-gegen-1 Duell",
        "battle.entryDescription": "Fordere jemanden zum Duell heraus: gemeinsam gewählter Kontinent, geheime Fallen-Flaggen für den Gegner, 5 Leben — wer länger durchhält, gewinnt.",
        "battle.createButton": "⚔️ Battle erstellen",
        "battle.joinButton": "🔗 Battle beitreten",
        "battle.codePlaceholder": "z. B. A7K3M",
        "battle.joinConfirm": "Beitreten",
        "battle.viewHighscore": "🏆 Battle-Bestenliste ansehen",
        "battle.leave": "🚪 Battle verlassen",
        "battle.leaveShort": "🚪 verlassen",
        "battle.continentChooseHeading": "🌍 Wählt gemeinsam 2 von 3 Kontinenten",
        "battle.continentSecretHint": "Deine Wahl bleibt geheim, bis euer Gegner ebenfalls gewählt hat.",
        "battle.confirm": "Bestätigen",
        "battle.poisonChooseHeading": "🪤 Wähle 3 Fallen-Flaggen für deinen Gegner",
        "battle.poisonSecretHint": "Diese Flaggen bekommt dein Gegner untergemischt — deine Wahl bleibt geheim.",
        "battle.creatingCode": "Wird erstellt…",
        "battle.checkingCode": "Prüfe Code…",
        "battle.codeNotFound": "Code nicht gefunden oder Battle bereits vergeben/abgelaufen.",
        "battle.needsOnlineJoin": "Für den Beitritt wird eine Internetverbindung benötigt.",
        "battle.needsOnlineCreate": "Für ein Battle wird eine Internetverbindung benötigt.",
        "battle.enterFullCode": "Bitte den 5-stelligen Code vollständig eingeben.",
        "battle.couldNotCreate": "Battle konnte nicht erstellt werden.",
        "battle.notExistsAnymore": "Dieses Battle existiert nicht mehr (abgelaufen oder abgebrochen).",
        "battle.shareCode": "Code an deinen Gegner weitergeben oder QR-Code scannen lassen:",
        "battle.waitingForOpponent": "Warte auf Gegner …",
        "battle.opponentJoined": "Gegner beigetreten ✅ — ",
        "battle.waitingFor": "Warte auf {name} …",
        "battle.round": "Runde {n} von 12",
        "battle.suddenDeathRound": "Sudden Death — Runde {n}",
        "battle.trapFrom": "🪤 Falle von {name}!",
        "battle.connectionMaybeLost": "⚠️ Verbindung zu {name} könnte unterbrochen sein — warte noch kurz …",
        "battle.connectionLost": "⚠️ Verbindung zu {name} scheint abgebrochen zu sein.",
        "battle.claimWin": "🏆 Battle für dich werten",
        "battle.confirmLeaveEntry": "Battle wirklich abbrechen?",
        "battle.confirmForfeit": "Battle wirklich verlassen? Das zählt als Niederlage für dich.",
        "battle.drawTitle": "Unentschieden!",
        "battle.drawSub": "Beide Leben gleichzeitig aufgebraucht.",
        "battle.winTitle": "Gewonnen!",
        "battle.winSub": "Du hast das Duell für dich entschieden.",
        "battle.loseTitle": "Verloren",
        "battle.loseSub": "Diesmal hat dein Gegner gewonnen.",
        "battle.noResultsYet": "Noch kein Battle gewonnen — sei der Erste!",
        "battle.wins": "Sieg",
        "battle.winsPlural": "Siege",
        "battle.you": "Du",
        "battle.opponent": "Gegner",
        "battle.chosenOf3": " / 3 gewählt",
        "battle.continentsChosenNote": "Es wurde {continents} gewählt. Bitte wähle 3 Fallen-Flaggen.",
        "battle.suddenDeathAnnounceTitle": "⚔️ Sudden Death!",
        "battle.suddenDeathAnnounceSub": "Ihr verliert jetzt beide automatisch 1 Leben.",
        "battle.go": "Los!",
        "battle.rematchButton": "🔄 Noch ein Match",
        "battle.rematchOpponentWants": "{name} möchte noch ein Match!",
        "battle.opponentLeft": "Dein Gegner hat das Duell verlassen.",
        "battle.savingResult": "Ergebnis wird gespeichert …",
        "battle.preparingRound": "Runde wird vorbereitet …",
        "battle.startStuck": "⚠️ Der Rundenstart dauert ungewöhnlich lange. Prüfe eure Internetverbindung.",
        "battle.startRetry": "🔄 Erneut versuchen",

        "hub.heading": "🏆 Bestenliste",
        "hub.tabStandard": "🧭 Entdecker-Modus",
        "hub.tabLadder": "⛰️ Gipfelsturm",
        "hub.tabBattle": "⚔️ Battle",
        "hub.pickerHint": "Wähle eine Kombination, um die passende Bestenliste zu sehen — startet mit deinen zuletzt gespielten Einstellungen.",
        "hub.noneForCombo": "Noch kein Highscore für diese Kombination",

        "stats.explanation": "Oben siehst du, wie viele Flaggen du insgesamt beantwortet hast und wie hoch deine Trefferquote ist. Darunter stehen die Länder, bei denen du dich am häufigsten vertust — als \"X von Y richtig\" (Y = wie oft dir das Land gezeigt wurde, X = wie oft davon richtig). Gelistet werden nur Länder, die du mindestens zweimal gesehen hast, damit ein einzelner Zufallstreffer die Auswertung nicht verzerrt.",
        "stats.noData": "Noch keine Daten — spiel ein paar Runden, dann siehst du hier deine Lernstatistik!",
        "stats.totalAnswered": "Insgesamt beantwortet",
        "stats.correctWord": "richtig",
        "stats.bestStreak": "Höchste Siegesserie",
        "stats.ladderProgress": "Gipfelsturm-Fortschritt",
        "stats.practiceHeading": "Zum Üben — hier häufen sich Fehler:",
        "stats.of": "von",
        "stats.noWeaknesses": "Bisher keine Schwächen erkennbar — alle mehrfach gezeigten Länder wurden immer richtig beantwortet. Stark! 🎉",
        "stats.notEnoughData": "Noch nicht genug Daten für eine Schwachstellen-Auswertung — spiel weiter!",
        "stats.resetButton": "Statistik zurücksetzen",
        "stats.confirmReset": "Deine persönliche Lernstatistik wirklich löschen? Das betrifft nur diesen Browser, nicht die zentrale Bestenliste.",
        "mainMenu.stats.title2": "📊 Meine Statistik",

        "achievements.pageHeading": "🎖️ Erfolge",
        "achievements.namePreviewHint": "So erscheint dein Name bei anderen Spieler:innen:",
        "achievements.titleSelectLabel": "Aktiver Titel",
        "achievements.noTitle": "Kein Titel",
        "achievements.categoryContinent": "🌍 Kontinent-Erfolge",
        "achievements.categoryMeta": "🌐 Meta-Erfolg",
        "achievements.categoryMilestone": "⛰️ Gipfelsturm-Meilensteine",
        "achievements.categoryStreak": "🔥 Siegesserien",
        "achievements.unlockedBadge": "✅ Freigeschaltet",
        "achievements.desc.continentBase": "Jedes Land {continent}s mindestens einmal richtig beantwortet.",
        "achievements.desc.continentProfi": "Jedes Land {continent}s mindestens einmal im Profimodus richtig beantwortet.",
        "achievements.desc.continentSpeed": "Jedes Land {continent}s mindestens einmal im Speedmodus richtig beantwortet.",
        "achievements.desc.continentBoth": "Jedes Land {continent}s mindestens einmal mit Profi- UND Speedmodus gleichzeitig richtig beantwortet.",
        "achievements.desc.meta": "Alle sechs Kontinent-Erfolge (Basisversion) erreicht.",
        "achievements.desc.milestone": "Im Gipfelsturm insgesamt {n} unterschiedliche Länder erreicht.",
        "achievements.desc.streak": "Eine Siegesserie von {n} richtigen Antworten in Folge erreicht.",
        "achievements.progressCountries": "{current} / {total} Länder",
        "achievements.progressContinents": "{current} / {total} Kontinente",
        "achievements.progressFlags": "{current} / {total} Flaggen",
        "achievements.progressStreakLine": "Beste Serie: {current} / {total}",
        "achievements.categoryBattle": "⚔️ Battle-Erfolge",
        "achievements.desc.battle": "Insgesamt {n} Battles gewonnen.",
        "achievements.progressWins": "{current} / {total} Siege",
        "achievements.scrollToTop": "⬆️ Nach oben",
        "achievements.detailShow": "🔎 Details anzeigen",
        "achievements.detailHide": "🔼 Details ausblenden",
        "achievements.detailOpenLabel": "Noch offen ({n})",
        "achievements.detailDoneLabel": "Geschafft ({n})",
        "achievements.detailAllDone": "Alle Länder geschafft 🎉",
        "achievements.detailNoneDone": "Noch kein Land geschafft.",
        "achievements.detailAllContinentsDone": "Alle Kontinente geschafft 🎉",
        "achievements.detailContinentRemaining": "noch {n} von {total}",
        "achievements.detailContinentDone": "alle {total} geschafft",
        "achievements.toastTitle": "🎖️ Neuer Erfolg freigeschaltet!",
        "achievements.toastSub": "Titel jetzt unter „Erfolge“ wählbar",

        "group.tileTitle": "Gruppenquiz",
        "group.tileSub": "Leiten oder beitreten",
        "group.entryHeading": "🏫 Gruppenquiz",
        "group.entryDescription": "Spielt gemeinsam als Gruppe oder Schulklasse: eine Person leitet mit zentral vorgegebenen Einstellungen, alle anderen treten per Code oder QR-Code bei.",
        "group.leadTitle": "Gruppenspiel leiten",
        "group.leadSub": "Code erstellen, Klasse einladen",
        "group.joinTitle": "Gruppenspiel beitreten",
        "group.joinSub": "Code oder QR von der Leitung eingeben",
        "group.joinModalHeading": "🔗 Gruppenquiz beitreten",
        "group.highscoreModalHeading": "🏆 Gruppen-Bestenliste",
        "group.noEntries": "Noch keine Einträge.",
        "group.thisRound": "🚩 Diese Runde (Runde {n})",
        "group.overallScore": "🏆 Gesamtwertung (alle Runden)",
        "group.highscoreLoading": "Gruppen-Bestenliste wird geladen …",
        "group.highscoreUnavailable": "Gruppen-Bestenliste momentan nicht erreichbar.",
        "group.rosterEmpty": "👥 Noch niemand beigetreten. Code oder QR-Code teilen, um Mitspieler:innen einzuladen.",
        "group.rosterSummary": "👥 {joined} beigetreten · ✅ {finished} fertig (Runde {round})",
        "group.loadingParticipants": "Lade Teilnehmer:innen …",
        "group.rosterUnavailable": "⚠️ Teilnehmerliste momentan nicht erreichbar.",
        "group.alreadyActiveShort": "Bereits in einem Gruppenquiz aktiv — zuerst verlassen bzw. schließen",
        "group.alreadyActiveLong": "Bereits in einem Gruppenquiz aktiv — zuerst über \"Zurück\" auf der Einstellungsseite verlassen bzw. schließen",
        "group.start": "Start",
        "group.startWaitingRound": "Warte auf nächste Runde …",
        "group.startWaitingRelease": "Warte auf Freigabe …",
        "group.readyTitle": "🎉 Los geht's!",
        "group.joinedTitle": "🚩 Du bist beigetreten",
        "group.readyText": "Die Gruppenleitung hat das Spiel freigegeben. Tippe unten auf „Start\", sobald du bereit bist.",
        "group.waitingText": "Deine Gruppenleitung stellt die Einstellungen ein. Bitte warten, bis das Spiel freigegeben wird …",
        "group.leaveLink": "Gruppe verlassen",
        "group.closedAlert": "Die Gruppe wurde beendet oder ist abgelaufen. Du spielst jetzt wieder mit deinen eigenen Einstellungen.",
        "group.learningModeLockedTitle": "Im Gruppenquiz deaktiviert — sonst gäbe es keine Gruppen-Bestenliste",
        "group.leaderDataLoading": "Gruppendaten werden geladen …",
        "group.nextRoundLabel": "🔄 Nächste Runde (Runde {n})",
        "group.releaseLabel": "▶️ Spiel freigeben",
        "group.leaderTitle": "Du leitest ein Gruppenquiz",
        "group.showQr": "📱 QR anzeigen",
        "group.settingsLiveHint": "Einstellungen unten werden live übertragen",
        "group.tabWaitroom": "👥 Warteraum",
        "group.tabLiveResults": "🏆 Live-Ergebnisse",
        "group.endGroupButton": "🚪 Gruppenspiel beenden",
        "group.startingRound": "Wird gestartet …",
        "group.releasing": "Wird freigegeben …",
        "group.confirmClose": "Gruppe wirklich schließen? Alle Mitspieler:innen werden auf ihre eigenen Einstellungen zurückgesetzt.",
        "group.gateHint": "⏳ {finished} von {total} fertig — oder noch {secs} Sek. warten",
        "group.releaseFailedAlert": "Freigabe fehlgeschlagen — bitte Internetverbindung prüfen und erneut versuchen.",
        "group.nextRoundFailedAlert": "Neue Runde konnte nicht gestartet werden — bitte Internetverbindung prüfen.",
        "group.createModalActiveText": "Deine Gruppe ist aktiv. Code an die Mitspieler:innen weitergeben oder den QR-Code scannen lassen:",
        "group.createModalIntro": "Starte ein Gruppenquiz für deine Klasse oder Gruppe. Du erhältst einen Code, mit dem die Mitspieler:innen beitreten können.",
        "group.createButton": "Gruppe erstellen",
        "group.creatingGroup": "Wird erstellt…",
        "group.createNeedsOnline": "Für ein Gruppenquiz wird eine Internetverbindung benötigt.",
        "group.joinModalIntro": "Code von deiner Lehrkraft bzw. Gruppenleitung eingeben:",
        "group.joinButton": "Beitreten",
        "group.checkingCode": "Prüfe Code…",
        "group.codeNotFoundOrClosed": "Code nicht gefunden oder Gruppe bereits geschlossen.",
        "group.joinNeedsOnline": "Für den Beitritt wird eine Internetverbindung benötigt.",
        "group.enterFullCode": "Bitte den 5-stelligen Code vollständig eingeben.",
        "group.confirmLeave": "Gruppenquiz wirklich verlassen? Du spielst danach wieder mit deinen eigenen Einstellungen.",
        "nickname.confirmChange": "Achtung: Bereits eingetragene Bestenlisten-Einträge werden nicht auf den neuen Namen angepasst. Namen wirklich ändern?",
        "nickname.blockedReplaced": "Dieser Name war nicht erlaubt und wurde ersetzt.",

        "help.pageHeading": "❓ Hilfe",
        "help.toc.title": "Inhaltsverzeichnis",
        "help.toc.single": "🎮 Einzelspieler",
        "help.toc.multi": "👥 Mehrspieler",
        "help.toc.modes": "🎲 Spielmodi & Einstellungen",
        "help.toc.points": "⭐ Punkte",
        "help.toc.highscore": "🏆 Bestenliste & Krone",
        "help.backToToc": "Nach oben zum Inhaltsverzeichnis",
        "help.single.explorer": "<strong>🧭 Entdecker-Modus</strong><br>Hier bestimmst du alles selbst: welche Kontinente, wie viele Flaggen, welcher Antwortmodus. Gut zum Üben oder für eine entspannte Runde.",
        "help.single.ladder": "<strong>⛰️ Gipfelsturm</strong><br>Du spielst automatisch alle 197 Flaggen der Welt durch — zuerst die, die du schon gut kennst, dann die schwereren. Du hast 5 Leben. Alle 50 richtigen Antworten bekommst du ein Leben zurück (maximal 5). Schaffst du alle 197 Flaggen, gewinnst du eine Krone 👑!",
        "help.multi.group": "<strong>🏫 Gruppenquiz</strong><br>Ideal für eine Schulklasse oder eine Gruppe Freund:innen. Eine Person leitet die Gruppe und legt die Einstellungen für alle fest — die Leitung spielt dabei selbst nicht mit. Alle anderen treten mit einem Code oder QR-Code bei. Der Start-Button bleibt gesperrt, bis die Leitung das Spiel freigibt. Nach jeder Runde gibt es eine eigene Bestenliste nur für eure Gruppe — für diese Runde und als Gesamtwertung über alle Runden.",
        "help.multi.battle": "<strong>⚔️ 1-gegen-1 Duell</strong><br>Du forderst eine andere Person zum Duell heraus. Ihr bekommt dieselben Flaggen, jede:r hat 5 Leben. Vorher dürft ihr euch gegenseitig 3 geheime 🪤 Fallen-Flaggen unterjubeln — schwerere Flaggen, die die andere Person nicht erwartet. Wer zuerst alle Leben verliert, hat das Duell verloren.",
        "help.modes.answerMode": "<strong>Antwortmodus</strong><br>• <em>Multiple Choice</em>: Du siehst eine Flagge und wählst den richtigen Namen aus 4 Möglichkeiten.<br>• <em>Umkehr Multiple Choice</em>: Du siehst einen Namen und wählst die richtige Flagge aus 4 Möglichkeiten.<br>• <em>Text eingeben</em> (schwer): Du siehst eine Flagge und tippst den Namen selbst.<br>• <em>🔀 Mixed</em>: Bei jeder Frage wird zufällig einer der drei Modi benutzt.",
        "help.modes.learning": "<strong>🎓 Lernmodus</strong><br>Kein Zeitdruck, keine Punkte. Perfekt zum entspannten Üben.",
        "help.modes.pro": "<strong>🎯 Profimodus</strong><br>Macht es schwerer: Tippfehler werden strenger bewertet, und die falschen Antworten bei Multiple Choice kommen öfter aus deinen gewählten Kontinenten.",
        "help.modes.speed": "<strong>⚡ Speedmodus</strong><br>Die Zeit läuft doppelt so schnell. Läuft sie ab, ohne dass du geantwortet hast, zählt das automatisch als falsch.",
        "help.points.base": "<strong>Grundpunkte</strong><br>Für jede richtige Antwort gibt es 20 Punkte.",
        "help.points.tip": "<strong>💡 Tipp</strong><br>Nutzt du einen Tipp, gibt es weniger Punkte (10 statt 20). Beim zweiten Tipp sind es nur noch 5.",
        "help.points.time": "<strong>⏱️ Zeitbonus</strong><br>Je schneller deine richtige Antwort, desto mehr Extra-Punkte — bis zu 10 zusätzliche Punkte. Im Lernmodus gibt es keinen Zeitbonus.",
        "help.points.streak": "<strong>🔥 Serie</strong><br>Antwortest du mehrmals hintereinander richtig (ohne Tipp), bekommst du ab der 3. richtigen Antwort in Folge eine Extra-Punkte-Serie. Ein Tipp oder eine falsche Antwort unterbricht die Serie — sie beginnt danach wieder bei 0.",
        "help.highscore.intro": "Für jede Kombination aus Kontinenten, Anzahl Flaggen, Antwortmodus, Profi- und Speedmodus gibt es eine eigene Bestenliste. Es zählt immer nur dein bester Versuch.",
        "help.highscore.prestige": "<strong>💎 Prestige</strong><br>Erreichst du deinen bisherigen Bestwert noch einmal ganz genau, zählt ein Prestige-Punkt dazu (💎) — dein Platz in der Liste bleibt dabei erhalten.",
        "help.highscore.crown": "<strong>👑 Krone</strong><br>Wer im Gipfelsturm alle 197 Flaggen schafft, bekommt eine Krone. Sie wird danach überall neben deinem Namen angezeigt — in jeder Bestenliste, im Gruppenquiz und im Battle. Das ist das ultimative Symbol, das jedem anderen Mitspieler zeigt: Du beherrschst die Flaggen!",

        "privacy.heading": "🔒 Datenschutz",
        "privacy.text": "Wenn du eine Runde beendest, werden dein eingetragener <strong>Spielername</strong> und deine erreichte <strong>Punktzahl</strong> in der zentralen, für alle Spieler:innen sichtbaren Bestenliste gespeichert. Im Gipfelsturm-Modus gilt das Gleiche für deinen Namen und die <strong>erreichte Anzahl Flaggen</strong>. Außerdem wird pro Land ein rein zahlenmäßiger, anonymer Zähler geführt (wie oft eine Flagge gezeigt und wie oft sie richtig erkannt wurde) — ohne Bezug zu einzelnen Spieler:innen. Weitere personenbezogene Daten werden nicht erhoben. Alle übrigen Angaben (z. B. bevorzugte Einstellungen oder deine persönliche Lernstatistik) bleiben ausschließlich auf deinem eigenen Gerät gespeichert und werden nicht übertragen.",

        "settings.continentAll": "Alle",
        "settings.continentPleaseChoose": "Bitte Kontinent wählen",
        "settings.continentAllExcept": "Alle außer",
        "settings.continentAnd": "und",
        "settings.flags": "Flaggen",
        "settings.standard": "Standard",
        "settings.on": "An",
        "settings.off": "Aus",
        "settings.lengthHint": "Hinweis: Bei dieser Kontinent-Auswahl gibt es nur {n} Flaggen — die Runde wird entsprechend kürzer.",

        "mode.mc": "Multiple Choice",
        "mode.reverseMc": "Umkehr Multiple Choice",
        "mode.mixed": "Mixed (zufällig gemischt)",
        "mode.text": "Texteingabe",
        "mode.learning": "Lernmodus",
        "mode.pro": "Profimodus",
        "mode.speed": "Speedmodus",

        "singlePlayerMenu.heading": "🎮 Einzelspieler",
        "singlePlayerMenu.explorer.title": "Entdecker-Modus",
        "singlePlayerMenu.explorer.sub": "Kontinent, Länge, Modus frei wählbar",
        "singlePlayerMenu.ladder.title": "Gipfelsturm",
        "singlePlayerMenu.ladder.sub": "Alle 197 Flaggen, von bekannt nach unbekannt",
        "singlePlayerMenu.comingSoon.title": "Ein neuer Modus kommt demnächst",
        "singlePlayerMenu.comingSoon.sub": "Du musst dich leider noch etwas gedulden",

        "ladderPlaceholder.heading": "⛰️ Gipfelsturm",
        "ladderPlaceholder.description": "Du durchläufst alle 197 Flaggen, sortiert von bekannt nach unbekannt. 5 Leben, Multiple Choice — keine Kontinent- oder Modus-Auswahl.",
        "ladderPlaceholder.start": "🚀 Start",
        "ladderPlaceholder.viewHighscore": "🏆 Gipfelsturm-Bestenliste ansehen",

        "settings.explorerHeading": "🧭 Entdecker-Modus",
        "settings.groupHeading": "🏫 Gruppenquiz",
        "settings.continentsLabel": "Kontinente",
        "settings.lengthLabel": "Anzahl Flaggen",
        "settings.modeLabel": "Antwortmodus",
        "settings.specialLabel": "Zusatzmodi",
        "settings.startButton": "🚀 Start"
    },
    en: {
        appTitle: "Fun with Flags",
        subtitle: "Guess flags, gather knowledge!",
        offlineWarning: "⚠️ No or poor internet connection — the leaderboard and multiplayer features may be limited.",
        nicknameEditHint: "Change name",
        nicknameFallback: "Your name",

        "mainMenu.singlePlayer.title": "Single Player",
        "mainMenu.singlePlayer.sub": "Explorer Mode or Summit Climb — play solo",
        "mainMenu.multiPlayer.title": "Multiplayer",
        "mainMenu.multiPlayer.sub": "Group Quiz or 1vs1 Battle",
        "mainMenu.settingsTile.title": "Settings",
        "mainMenu.settingsTile.sub": "Sound, language and more",
        "mainMenu.stats.title": "My Stats",
        "mainMenu.stats.sub": "Your personal learning overview",
        "mainMenu.achievements.title": "Achievements",
        "mainMenu.achievements.sub": "Unlock and display titles",
        "mainMenu.highscoreHub.title": "Leaderboard",
        "mainMenu.highscoreHub.sub": "All rankings in one place",

        "footer.help": "❓ Help",
        "footer.privacy": "🔒 Privacy",
        "footer.flagCredit": "Flag images:",

        "settings.back": "⬅️ Back",
        "settings.heading": "⚙️ Settings",
        "settings.nameLabel": "Your name",
        "settings.namePlaceholder": "e.g. Max",
        "settings.nameHint": "Shown on the leaderboard when you finish a round.",
        "settings.muteOn": "🔊 Sound: ON",
        "settings.muteOff": "🔇 Sound: OFF",
        "settings.muteTitleWhenMuted": "Turn sound on",
        "settings.muteTitleWhenUnmuted": "Turn sound off",
        "settings.languageButton": "Language: EN",

        "common.anonymous": "Anonymous",
        "common.back": "⬅️ Back",
        "common.mainMenuBack": "⬅️ Main Menu",
        "common.backToModeMenu": "⬅️ Back to mode menu",
        "common.continue": "Continue ➜",
        "common.online": "🌐 shared leaderboard",
        "common.offline": "📴 offline (local only)",
        "common.loading": "Loading leaderboard …",

        "multiPlayerMenu.heading": "👥 Multiplayer",
        "multiPlayerMenu.battle.title": "1vs1 Battle",
        "multiPlayerMenu.battle.sub": "Duel with trap flags — who survives longer?",

        "common.flagLoadError": "Flag could not be loaded",
        "common.onlineTitle": "Shared, central leaderboard",
        "common.offlineTitle": "No connection to the shared leaderboard — showing your local standing",
        "common.beTheFirst": "Be the first!",
        "common.loadingShort": "Loading …",
        "common.localOnlyNote": " (saved locally only, no connection to the shared list)",

        "ladder.tierCap": "Cap",
        "ladder.tierGrad": "Graduation Cap",
        "ladder.tierTopHat": "Top Hat",
        "ladder.tierCrown": "Crown",
        "ladder.flagOf": "Flag {a} of {b}",
        "ladder.milestoneTitle": "Life refilled! ❤️",
        "ladder.milestoneBadgeEarned": "You've earned a new badge:",
        "ladder.minusOneLife": "-1 life",
        "ladder.confirmEnd": "Do you really want to end Summit Climb? Your progress in this round will be lost.",
        "ladder.wonTitle": "You made it — you now wear the crown!",
        "ladder.wonSub": "All {n} flags completed. 👑",
        "ladder.lostTitle": "Round over",
        "ladder.lostSub": "{reached} of {total} flags completed.",
        "ladder.noRankInTop50": "No place in the Summit Climb top 50 leaderboard.",
        "ladder.rankLine": "Rank {rank} on the Summit Climb leaderboard (out of {total}).",
        "ladder.noResultsYet": "No Summit Climb results yet",

        "settings.continentsLabel2": "🌍 Continent",
        "settings.lengthLabel2": "🔢 Number of flags",
        "settings.modeLabel2": "🎮 Answer mode",
        "settings.continentMultiHint": "Multiple selection possible",
        "modeButtons.mc": "🔤 Multiple Choice",
        "modeButtons.reverseMc": "🏳️ Reverse Multiple Choice",
        "modeButtons.text": "⌨️ Type the answer",
        "modeButtons.mixed": "🔀 Mixed",
        "settings.extraModeLabel": "⚙️ Game mode",
        "settings.learningModeHint": "No time pressure and no leaderboard entry — just for practice.",
        "settings.proModeHint": "Typos are judged more strictly, and in Multiple Choice wrong answers only come from the chosen continents.",
        "settings.speedModeHint": "Time runs twice as fast (time-bonus window halved to 5 sec.). If time runs out, the question automatically counts as unanswered. Speed Mode and Learning Mode are mutually exclusive.",
        "settings.viewHighscore": "🏆 View leaderboard",

        "highscore.noneYet": "No highscore yet",
        "highscore.prestigeTitle": "Prestige: ",
        "highscore.points": "pts.",
        "highscore.allContinents": "all continents",

        "game.answerPlaceholder": "Enter country",
        "game.showTip": "💡 Show hint",
        "game.solve": "Solve",
        "game.next": "Next ➡️",
        "game.roundOver": "Round over!",
        "game.points": "Points",
        "game.flagOf": "Flag {a} of {b}",
        "game.learningModeNote": "🎓 Learning Mode — no time pressure, no leaderboard entry",
        "game.loadingFlags": "⏳ Loading flags…",
        "game.flagsLoadError": "⚠️ Flags could not be loaded.",
        "game.tipWrongRemoved1": "One wrong answer was removed.",
        "game.tipWrongRemoved2": "Another wrong answer was removed.",
        "game.tipLetterCount": "Number of letters: ",
        "game.tipContinent": "Continent: ",
        "game.tipFirstLetter": "First letter: ",
        "game.correctFuzzy": "Correct (small typo tolerated)!",
        "game.correct": "Correct!",
        "game.streakSuffix": " in a row)",
        "game.correctAnswerWas": "Correct answer: ",
        "game.noAnswer": "(no answer)",
        "game.learningRoundDone": "🎓 Practice round complete!",
        "game.learningNoScoreNote": "In Learning Mode no points are counted and no leaderboard entry is saved — just for practice.",
        "game.scoreReached": "You scored {score} points!",
        "game.groupScoreNote": "🚩 Your points count towards the group leaderboard below.",
        "game.highscoreUpdating": "Updating leaderboard …",
        "game.noTop50": "No place in the top 50.",
        "game.previousBestStillBetter": "Your previous best (rank {rank}, {score} points) is already at least as good — entry stays unchanged.",
        "game.prestigeAgain": "Rank {rank} with {score} points reached again!",
        "game.newHighscore": "🥇 New highscore — rank 1!",
        "game.newHighscoreBadge": "Top!",
        "game.rank2": "🥈 Nice! Rank 2 on the leaderboard.",
        "game.rank3": "🥉 Rank 3 on the leaderboard!",
        "game.rankOther": "🏅 Rank {rank} of {total} on the leaderboard!",
        "game.closeToTop50": "Just missed the top 50 — rank 50 is at {score} points.",
        "game.allCorrect": "All correct — great job! 🎉",
        "game.practiceWrongList": "To practice — these countries were wrong:",
        "game.yourAnswer": "your answer: ",
        "game.confirmEnd": "Do you really want to end the quiz? Your current progress in this round will be lost.",
        "game.newPrestige": "💎 New prestige reached! (now {level}× {score} points)",
        "game.newBestStreak": "🔥 New personal best streak: {n} in a row!",
        "nickname.collision": "Name already taken – please choose a different name.",

        "battle.heading": "⚔️ 1vs1 Battle",
        "battle.entryDescription": "Challenge someone to a duel: jointly chosen continent, secret trap flags for your opponent, 5 lives — whoever lasts longer wins.",
        "battle.createButton": "⚔️ Create battle",
        "battle.joinButton": "🔗 Join battle",
        "battle.codePlaceholder": "e.g. A7K3M",
        "battle.joinConfirm": "Join",
        "battle.viewHighscore": "🏆 View battle leaderboard",
        "battle.leave": "🚪 Leave battle",
        "battle.leaveShort": "🚪 leave",
        "battle.continentChooseHeading": "🌍 Together, choose 2 of 3 continents",
        "battle.continentSecretHint": "Your choice stays secret until your opponent has also chosen.",
        "battle.confirm": "Confirm",
        "battle.poisonChooseHeading": "🪤 Choose 3 trap flags for your opponent",
        "battle.poisonSecretHint": "Your opponent gets these flags mixed in — your choice stays secret.",
        "battle.creatingCode": "Creating…",
        "battle.checkingCode": "Checking code…",
        "battle.codeNotFound": "Code not found, or battle already taken/expired.",
        "battle.needsOnlineJoin": "An internet connection is needed to join.",
        "battle.needsOnlineCreate": "An internet connection is needed for a battle.",
        "battle.enterFullCode": "Please enter the full 5-character code.",
        "battle.couldNotCreate": "Battle could not be created.",
        "battle.notExistsAnymore": "This battle no longer exists (expired or cancelled).",
        "battle.shareCode": "Share the code with your opponent, or have them scan the QR code:",
        "battle.waitingForOpponent": "Waiting for opponent …",
        "battle.opponentJoined": "Opponent joined ✅ — ",
        "battle.waitingFor": "Waiting for {name} …",
        "battle.round": "Round {n} of 12",
        "battle.suddenDeathRound": "Sudden death — round {n}",
        "battle.trapFrom": "🪤 Trap from {name}!",
        "battle.connectionMaybeLost": "⚠️ Connection to {name} might be interrupted — hang on a moment …",
        "battle.connectionLost": "⚠️ Connection to {name} appears to be lost.",
        "battle.claimWin": "🏆 Claim battle for yourself",
        "battle.confirmLeaveEntry": "Really cancel the battle?",
        "battle.confirmForfeit": "Really leave the battle? This counts as a loss for you.",
        "battle.drawTitle": "Draw!",
        "battle.drawSub": "Both lives ran out at the same time.",
        "battle.winTitle": "Won!",
        "battle.winSub": "You won the duel.",
        "battle.loseTitle": "Lost",
        "battle.loseSub": "Your opponent won this time.",
        "battle.noResultsYet": "No battle won yet — be the first!",
        "battle.wins": "win",
        "battle.winsPlural": "wins",
        "battle.you": "You",
        "battle.opponent": "Opponent",
        "battle.chosenOf3": " / 3 chosen",
        "battle.continentsChosenNote": "Chosen continent: {continents}. Please choose 3 trap flags.",
        "battle.suddenDeathAnnounceTitle": "⚔️ Sudden Death!",
        "battle.suddenDeathAnnounceSub": "You both automatically lose 1 life now.",
        "battle.go": "Go!",
        "battle.rematchButton": "🔄 One more match",
        "battle.rematchOpponentWants": "{name} wants another match!",
        "battle.opponentLeft": "Your opponent has left the duel.",
        "battle.savingResult": "Saving result …",
        "battle.preparingRound": "Preparing round …",
        "battle.startStuck": "⚠️ Starting the round is taking unusually long. Please check your internet connection.",
        "battle.startRetry": "🔄 Try again",

        "hub.heading": "🏆 Leaderboard",
        "hub.tabStandard": "🧭 Explorer Mode",
        "hub.tabLadder": "⛰️ Summit Climb",
        "hub.tabBattle": "⚔️ Battle",
        "hub.pickerHint": "Choose a combination to see the matching leaderboard — starts with your most recently played settings.",
        "hub.noneForCombo": "No highscore for this combination yet",

        "stats.explanation": "Above you can see how many flags you've answered in total and how high your accuracy is. Below are the countries you get wrong most often — as \"X of Y correct\" (Y = how often you've been shown the country, X = how often you got it right). Only countries you've seen at least twice are listed, so a single lucky guess doesn't skew the evaluation.",
        "stats.noData": "No data yet — play a few rounds, then you'll see your learning stats here!",
        "stats.totalAnswered": "Total answered",
        "stats.correctWord": "correct",
        "stats.bestStreak": "Best win streak",
        "stats.ladderProgress": "Summit Climb progress",
        "stats.practiceHeading": "To practice — these come up most often:",
        "stats.of": "of",
        "stats.noWeaknesses": "No weaknesses so far — every country you've seen multiple times was always answered correctly. Great job! 🎉",
        "stats.notEnoughData": "Not enough data yet for a weakness analysis — keep playing!",
        "stats.resetButton": "Reset statistics",
        "stats.confirmReset": "Really delete your personal learning statistics? This only affects this browser, not the shared leaderboard.",
        "mainMenu.stats.title2": "📊 My Stats",

        "achievements.pageHeading": "🎖️ Achievements",
        "achievements.namePreviewHint": "This is how your name appears to other players:",
        "achievements.titleSelectLabel": "Active title",
        "achievements.noTitle": "No title",
        "achievements.categoryContinent": "🌍 Continent Achievements",
        "achievements.categoryMeta": "🌐 Meta Achievement",
        "achievements.categoryMilestone": "⛰️ Summit Climb Milestones",
        "achievements.categoryStreak": "🔥 Win Streaks",
        "achievements.unlockedBadge": "✅ Unlocked",
        "achievements.desc.continentBase": "Answered every country in {continent} correctly at least once.",
        "achievements.desc.continentProfi": "Answered every country in {continent} correctly at least once in Pro mode.",
        "achievements.desc.continentSpeed": "Answered every country in {continent} correctly at least once in Speed mode.",
        "achievements.desc.continentBoth": "Answered every country in {continent} correctly at least once with Pro AND Speed mode active at the same time.",
        "achievements.desc.meta": "Reached all six continent achievements (base version).",
        "achievements.desc.milestone": "Reached {n} different countries total in Summit Climb.",
        "achievements.desc.streak": "Reached a win streak of {n} correct answers in a row.",
        "achievements.progressCountries": "{current} / {total} countries",
        "achievements.progressContinents": "{current} / {total} continents",
        "achievements.progressFlags": "{current} / {total} flags",
        "achievements.progressStreakLine": "Best streak: {current} / {total}",
        "achievements.categoryBattle": "⚔️ Battle Achievements",
        "achievements.desc.battle": "Won {n} battles in total.",
        "achievements.progressWins": "{current} / {total} wins",
        "achievements.scrollToTop": "⬆️ Back to top",
        "achievements.detailShow": "🔎 Show details",
        "achievements.detailHide": "🔼 Hide details",
        "achievements.detailOpenLabel": "Still open ({n})",
        "achievements.detailDoneLabel": "Done ({n})",
        "achievements.detailAllDone": "All countries done 🎉",
        "achievements.detailNoneDone": "No country done yet.",
        "achievements.detailAllContinentsDone": "All continents done 🎉",
        "achievements.detailContinentRemaining": "{n} of {total} to go",
        "achievements.detailContinentDone": "all {total} done",
        "achievements.toastTitle": "🎖️ New achievement unlocked!",
        "achievements.toastSub": "Title now selectable under “Achievements”",

        "group.tileTitle": "Group Quiz",
        "group.tileSub": "Host or join",
        "group.entryHeading": "🏫 Group Quiz",
        "group.entryDescription": "Play together as a group or class: one person hosts with centrally set options, everyone else joins via code or QR code.",
        "group.leadTitle": "Host a group game",
        "group.leadSub": "Create a code, invite your class",
        "group.joinTitle": "Join a group game",
        "group.joinSub": "Enter the code or QR from the host",
        "group.joinModalHeading": "🔗 Join Group Quiz",
        "group.highscoreModalHeading": "🏆 Group Leaderboard",
        "group.noEntries": "No entries yet.",
        "group.thisRound": "🚩 This round (round {n})",
        "group.overallScore": "🏆 Overall score (all rounds)",
        "group.highscoreLoading": "Loading group leaderboard …",
        "group.highscoreUnavailable": "Group leaderboard currently unavailable.",
        "group.rosterEmpty": "👥 No one has joined yet. Share the code or QR code to invite players.",
        "group.rosterSummary": "👥 {joined} joined · ✅ {finished} done (round {round})",
        "group.loadingParticipants": "Loading participants …",
        "group.rosterUnavailable": "⚠️ Participant list currently unavailable.",
        "group.alreadyActiveShort": "Already active in a group quiz — leave or close it first",
        "group.alreadyActiveLong": "Already active in a group quiz — leave or close it first via \"Back\" on the settings page",
        "group.start": "Start",
        "group.startWaitingRound": "Waiting for next round …",
        "group.startWaitingRelease": "Waiting for release …",
        "group.readyTitle": "🎉 Let's go!",
        "group.joinedTitle": "🚩 You've joined",
        "group.readyText": "The host has released the game. Tap \"Start\" below once you're ready.",
        "group.waitingText": "Your host is setting up the options. Please wait until the game is released …",
        "group.leaveLink": "Leave group",
        "group.closedAlert": "The group has ended or expired. You're now playing with your own settings again.",
        "group.learningModeLockedTitle": "Disabled in Group Quiz — otherwise there would be no group leaderboard",
        "group.leaderDataLoading": "Loading group data …",
        "group.nextRoundLabel": "🔄 Next round (round {n})",
        "group.releaseLabel": "▶️ Release game",
        "group.leaderTitle": "You're hosting a group quiz",
        "group.showQr": "📱 Show QR",
        "group.settingsLiveHint": "Settings below are transmitted live",
        "group.tabWaitroom": "👥 Waiting room",
        "group.tabLiveResults": "🏆 Live results",
        "group.endGroupButton": "🚪 End group game",
        "group.startingRound": "Starting …",
        "group.releasing": "Releasing …",
        "group.confirmClose": "Really close the group? All players will be reset to their own settings.",
        "group.gateHint": "⏳ {finished} of {total} done — or wait {secs} more sec.",
        "group.releaseFailedAlert": "Release failed — please check your internet connection and try again.",
        "group.nextRoundFailedAlert": "Could not start the new round — please check your internet connection.",
        "group.createModalActiveText": "Your group is active. Share the code with players, or have them scan the QR code:",
        "group.createModalIntro": "Start a group quiz for your class or group. You'll get a code players can use to join.",
        "group.createButton": "Create group",
        "group.creatingGroup": "Creating…",
        "group.createNeedsOnline": "An internet connection is needed for a group quiz.",
        "group.joinModalIntro": "Enter the code from your teacher or group host:",
        "group.joinButton": "Join",
        "group.checkingCode": "Checking code…",
        "group.codeNotFoundOrClosed": "Code not found, or the group is already closed.",
        "group.joinNeedsOnline": "An internet connection is needed to join.",
        "group.enterFullCode": "Please enter the full 5-character code.",
        "group.confirmLeave": "Really leave the group quiz? You'll then play with your own settings again.",
        "nickname.confirmChange": "Note: Existing leaderboard entries won't be updated to the new name. Really change your name?",
        "nickname.blockedReplaced": "That name wasn't allowed and was replaced.",

        "help.pageHeading": "❓ Help",
        "help.toc.title": "Table of Contents",
        "help.toc.single": "🎮 Single Player",
        "help.toc.multi": "👥 Multiplayer",
        "help.toc.modes": "🎲 Game Modes & Settings",
        "help.toc.points": "⭐ Points",
        "help.toc.highscore": "🏆 Leaderboard & Crown",
        "help.backToToc": "Back up to the table of contents",
        "help.single.explorer": "<strong>🧭 Explorer Mode</strong><br>Here you decide everything yourself: which continents, how many flags, which answer mode. Good for practicing or a relaxed round.",
        "help.single.ladder": "<strong>⛰️ Summit Climb</strong><br>You automatically work through all 197 flags of the world — first the ones you already know well, then the harder ones. You have 5 lives. Every 50 correct answers you get a life back (maximum 5). Complete all 197 flags and you win a crown 👑!",
        "help.multi.group": "<strong>🏫 Group Quiz</strong><br>Ideal for a school class or a group of friends. One person hosts the group and sets the options for everyone — the host doesn't play along. Everyone else joins with a code or QR code. The start button stays locked until the host releases the game. After each round there's a separate leaderboard just for your group — for that round and as an overall score across all rounds.",
        "help.multi.battle": "<strong>⚔️ 1vs1 Battle</strong><br>You challenge someone else to a duel. You both get the same flags, each with 5 lives. Beforehand you can secretly slip each other 3 🪤 trap flags — harder flags the other person doesn't expect. Whoever loses all lives first has lost the duel.",
        "help.modes.answerMode": "<strong>Answer mode</strong><br>• <em>Multiple Choice</em>: You see a flag and pick the right name from 4 options.<br>• <em>Reverse Multiple Choice</em>: You see a name and pick the right flag from 4 options.<br>• <em>Type the answer</em> (hard): You see a flag and type the name yourself.<br>• <em>🔀 Mixed</em>: Each question randomly uses one of the three modes.",
        "help.modes.learning": "<strong>🎓 Learning Mode</strong><br>No time pressure, no points. Perfect for relaxed practice.",
        "help.modes.pro": "<strong>🎯 Pro Mode</strong><br>Makes it harder: typos are judged more strictly, and wrong Multiple Choice answers come more often from your chosen continents.",
        "help.modes.speed": "<strong>⚡ Speed Mode</strong><br>Time runs twice as fast. If it runs out before you've answered, that automatically counts as wrong.",
        "help.points.base": "<strong>Base points</strong><br>Every correct answer is worth 20 points.",
        "help.points.tip": "<strong>💡 Hint</strong><br>Using a hint reduces your points (10 instead of 20). A second hint brings it down to just 5.",
        "help.points.time": "<strong>⏱️ Time bonus</strong><br>The faster your correct answer, the more extra points — up to 10 additional points. There's no time bonus in Learning Mode.",
        "help.points.streak": "<strong>🔥 Streak</strong><br>Answer correctly several times in a row (without a hint) and from the 3rd correct answer in a row you get an extra points streak. A hint or a wrong answer breaks the streak — it then starts again at 0.",
        "help.highscore.intro": "There's a separate leaderboard for every combination of continents, number of flags, answer mode, Pro and Speed Mode. Only your best attempt ever counts.",
        "help.highscore.prestige": "<strong>💎 Prestige</strong><br>If you match your previous best score exactly again, you get an extra prestige point (💎) — your rank on the list stays the same.",
        "help.highscore.crown": "<strong>👑 Crown</strong><br>Anyone who completes all 197 flags in Summit Climb gets a crown. It's then shown next to your name everywhere — on every leaderboard, in Group Quiz and in Battle. It's the ultimate symbol showing every other player: you've mastered the flags!",

        "privacy.heading": "🔒 Privacy",
        "privacy.text": "When you finish a round, your entered <strong>player name</strong> and your achieved <strong>score</strong> are saved in the central leaderboard visible to all players. In Summit Climb mode, the same applies to your name and the <strong>number of flags reached</strong>. A purely numeric, anonymous counter is also kept per country (how often a flag was shown and how often it was correctly identified) — with no link to individual players. No further personal data is collected. All other settings (e.g. your preferred options or your personal learning statistics) stay exclusively on your own device and are never transmitted.",

        "settings.continentAll": "All",
        "settings.continentPleaseChoose": "Please choose a continent",
        "settings.continentAllExcept": "All except",
        "settings.continentAnd": "and",
        "settings.flags": "flags",
        "settings.standard": "Standard",
        "settings.on": "On",
        "settings.off": "Off",
        "settings.lengthHint": "Note: this continent selection only has {n} flags — the round will be shorter accordingly.",

        "mode.mc": "Multiple Choice",
        "mode.reverseMc": "Reverse Multiple Choice",
        "mode.mixed": "Mixed (randomly shuffled)",
        "mode.text": "Text Input",
        "mode.learning": "Learning Mode",
        "mode.pro": "Pro Mode",
        "mode.speed": "Speed Mode",

        "singlePlayerMenu.heading": "🎮 Single Player",
        "singlePlayerMenu.explorer.title": "Explorer Mode",
        "singlePlayerMenu.explorer.sub": "Continent, length, mode — your choice",
        "singlePlayerMenu.ladder.title": "Summit Climb",
        "singlePlayerMenu.ladder.sub": "All 197 flags, from well-known to obscure",
        "singlePlayerMenu.comingSoon.title": "A new mode is coming soon",
        "singlePlayerMenu.comingSoon.sub": "You'll have to wait a little longer",

        "ladderPlaceholder.heading": "⛰️ Summit Climb",
        "ladderPlaceholder.description": "You'll work through all 197 flags, sorted from well-known to obscure. 5 lives, Multiple Choice — no continent or mode selection.",
        "ladderPlaceholder.start": "🚀 Start",
        "ladderPlaceholder.viewHighscore": "🏆 View Summit Climb leaderboard",

        "settings.explorerHeading": "🧭 Explorer Mode",
        "settings.groupHeading": "🏫 Group Quiz",
        "settings.continentsLabel": "Continents",
        "settings.lengthLabel": "Number of flags",
        "settings.modeLabel": "Answer mode",
        "settings.specialLabel": "Extra modes",
        "settings.startButton": "🚀 Start"
    }
};

// Fällt bei fehlendem Key in der aktiven Sprache auf Deutsch zurück, und bei komplett fehlendem
// Key auf den Key selbst (auffälliger Platzhalter statt eines leeren Strings/Absturzes) -- so
// bleiben Bereiche, die in späteren Phasen erst noch übersetzt werden, nicht kaputt.
function t(key) {
    return (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key]) || TRANSLATIONS.de[key] || key;
}

// Kontinent-Namen: die eigentlichen Werte in data-countries.js (c.continent) bleiben immer Deutsch
// (werden intern zum Filtern/Vergleichen genutzt) -- hier nur die ANZEIGE übersetzen.
const CONTINENT_NAMES_EN = {
    "Europa": "Europe",
    "Asien": "Asia",
    "Afrika": "Africa",
    "Nordamerika": "North America",
    "Südamerika": "South America",
    "Ozeanien": "Oceania"
};
// Absichtlich NICHT "continentLabel" genannt -- dieser Name ist bereits als anderweitige
// Funktion (kontinentübergreifende Kurzfassung der Einstellungen) in
// js/highscore-ladder-stats.js vergeben; eine Namenskollision im globalen Scope würde je nach
// Skript-Ladereihenfolge eine der beiden Funktionen überschreiben.
function continentDisplayName(cont) {
    return currentLang === "en" ? (CONTINENT_NAMES_EN[cont] || cont) : cont;
}

// Länder-Statistik (js/group-quiz.js, STATS_KEY) speichert Länder unter ihrem DEUTSCHEN Namen als
// Schlüssel (unabhängig von der UI-Sprache) -- hier nur für die ANZEIGE auf den englischen Namen
// aus data-countries.js (c.nameEn) umlegen, falls vorhanden.
// Liefert den Anzeigenamen eines Landes für Multiple-Choice-/Umkehr-Multiple-Choice-Antworten,
// abhängig von der aktuellen UI-Sprache. Schlägt IMMER frisch im globalen `countries`-Array
// (data-countries.js) über den ISO-Code nach, statt einem evtl. übergebenen Objekt zu vertrauen --
// einige lokale Kopien (z. B. die Gipfelsturm-Reihenfolge, vorab in Firestore gespeicherte Battle-
// Sequenzen) führen nur `name`/`iso`, aber kein `nameEn`.
function quizCountryNameByIso(iso) {
    if (typeof countries === "undefined") return iso;
    const c = countries.find(cc => cc.iso === iso);
    if (!c) return iso;
    return (currentLang === "en" && c.nameEn) ? c.nameEn : c.name;
}

function countryDisplayName(deName) {
    if (currentLang !== "en" || typeof countries === "undefined") return deName;
    const c = countries.find(c => c.name === deName);
    return (c && c.nameEn) ? c.nameEn : deName;
}

// ---------- Erfolgs-/Titel-System: Titeltexte (siehe js/achievements.js für die Freischaltlogik) ----------
// Jede Basis-ID liefert je Sprache eine männliche ("m"), weibliche ("w") und/oder neutrale ("n")
// Variante -- geschlechtsneutrale Titel führen nur "n". Die eigentliche ID (z. B. "continent_africa")
// bleibt unabhängig von Sprache/Variante immer gleich und wird gespeichert/übertragen (Konzept Punkt 1).
const ACHIEVEMENT_TITLES = {
    continent_europe: { m: { de: "Herrscher von Europa", en: "Ruler of Europe" }, w: { de: "Herrscherin von Europa", en: "Ruler of Europe" } },
    continent_africa: { m: { de: "König der Savanne", en: "King of the Savanna" }, w: { de: "Königin der Savanne", en: "Queen of the Savanna" } },
    continent_asia: { m: { de: "Meister des Ostens", en: "Master of the East" }, w: { de: "Meisterin des Ostens", en: "Mistress of the East" } },
    continent_northamerica: { m: { de: "Herr der Prärie", en: "Lord of the Prairie" }, w: { de: "Herrin der Prärie", en: "Lady of the Prairie" } },
    continent_southamerica: { n: { de: "Legende der Anden", en: "Legend of the Andes" } },
    continent_oceania: { n: { de: "Kapitän der Südsee", en: "Captain of the South Seas" } },
    meta_world: { m: { de: "Weltenbezwinger", en: "World Conqueror" }, w: { de: "Weltenbezwingerin", en: "World Conqueror" } },
    milestone_25: { m: { de: "Späher", en: "Scout" }, w: { de: "Späherin", en: "Scout" } },
    milestone_50: { m: { de: "Entdecker", en: "Explorer" }, w: { de: "Entdeckerin", en: "Explorer" } },
    milestone_100: { m: { de: "Weltenwanderer", en: "Globetrotter" }, w: { de: "Weltenwanderin", en: "Globetrotter" } },
    milestone_150: { m: { de: "Kartograph", en: "Cartographer" }, w: { de: "Kartographin", en: "Cartographer" } },
    milestone_all: { m: { de: "Flaggenkenner", en: "Flag Sage" }, w: { de: "Flaggenkennerin", en: "Flag Sage" } },
    streak_10: { m: { de: "Serienstarter", en: "Streak Starter" }, w: { de: "Serienstarterin", en: "Streak Starter" } },
    streak_20: { m: { de: "Serientäter", en: "Streak Master" }, w: { de: "Serientäterin", en: "Streak Master" } },
    streak_50: { n: { de: "Unaufhaltsam", en: "Unstoppable" } },
    battle_10: { n: { de: "ist kampfbereit", en: "is battle-ready" } },
    battle_25: { n: { de: "ist zielsicher", en: "is unerring" } },
    battle_50: { n: { de: "ist unbezwingbar", en: "is unbeatable" } },
    battle_100: { n: { de: "ist legendär", en: "is legendary" } }
};

// Modus-Modifier (nur Kontinent-Erfolge, siehe Konzept Punkt 3): wird dem Basistitel vorangestellt.
// Reihenfolge bei beiden aktiven Modi: erst Speed-, dann Profi-Modifier ("Flinker gelehrter …").
const MODE_MODIFIER_WORDS = {
    // Kleingeschrieben: der Titel steht (seit Punkt 2/3 des Feedbacks) hinter dem Namen, das
    // Modifier-Wort ist damit kein Satzanfang mehr, sondern eine Beifügung zum Basistitel.
    speed: { m: { de: "flinker", en: "swift" }, w: { de: "flinke", en: "swift" }, n: { de: "flinker", en: "swift" } },
    profi: { m: { de: "gelehrter", en: "scholarly" }, w: { de: "gelehrte", en: "scholarly" }, n: { de: "gelehrter", en: "scholarly" } }
};

// Löst eine Erfolgs-ID (inkl. optionalem "_profi"/"_speed"/"_profi_speed"-Suffix bei Kontinent-Erfolgen)
// zusammen mit der gewählten Variante (m/w/n) in den fertigen Anzeigetext auf. Liefert bei
// unbekannter/fehlender ID den Fallback-Text (Konzept Punkt 1, letzter Absatz).
function achievementTitleText(id, variant, lang) {
    const useLang = (lang === "en") ? "en" : "de";
    if (!id) return useLang === "en" ? "Achievement" : "Erfolg";
    let baseId = id, hasSpeed = false, hasProfi = false;
    if (baseId.endsWith("_profi_speed")) { hasSpeed = true; hasProfi = true; baseId = baseId.slice(0, -"_profi_speed".length); }
    else if (baseId.endsWith("_speed")) { hasSpeed = true; baseId = baseId.slice(0, -"_speed".length); }
    else if (baseId.endsWith("_profi")) { hasProfi = true; baseId = baseId.slice(0, -"_profi".length); }

    const titleEntry = ACHIEVEMENT_TITLES[baseId];
    if (!titleEntry) return useLang === "en" ? "Achievement" : "Erfolg";
    const useVariant = (variant && titleEntry[variant]) ? variant : (titleEntry.n ? "n" : (titleEntry.m ? "m" : "w"));
    const baseText = (titleEntry[useVariant] && titleEntry[useVariant][useLang]) || (useLang === "en" ? "Achievement" : "Erfolg");

    const modifierParts = [];
    if (hasSpeed) modifierParts.push(MODE_MODIFIER_WORDS.speed[useVariant] ? MODE_MODIFIER_WORDS.speed[useVariant][useLang] : MODE_MODIFIER_WORDS.speed.n[useLang]);
    if (hasProfi) modifierParts.push(MODE_MODIFIER_WORDS.profi[useVariant] ? MODE_MODIFIER_WORDS.profi[useVariant][useLang] : MODE_MODIFIER_WORDS.profi.n[useLang]);
    return modifierParts.length ? (modifierParts.join(" ") + " " + baseText) : baseText;
}

// Liefert alle Varianten (m/w/n, je nach Definition) einer Erfolgs-ID als Array {variant, text} --
// für das Titel-Auswahl-Dropdown (js/achievements.js), das bei Erfolgen mit zwei Formen beide
// einzeln zur Auswahl anbietet (Konzept Punkt 4).
function achievementTitleVariants(id, lang) {
    const useLang = (lang === "en") ? "en" : "de";
    let baseId = id;
    if (baseId.endsWith("_profi_speed")) baseId = baseId.slice(0, -"_profi_speed".length);
    else if (baseId.endsWith("_speed")) baseId = baseId.slice(0, -"_speed".length);
    else if (baseId.endsWith("_profi")) baseId = baseId.slice(0, -"_profi".length);
    const titleEntry = ACHIEVEMENT_TITLES[baseId];
    if (!titleEntry) return [];
    if (titleEntry.n) return [{ variant: "n", text: achievementTitleText(id, "n", useLang) }];
    const variants = [];
    if (titleEntry.m) variants.push({ variant: "m", text: achievementTitleText(id, "m", useLang) });
    if (titleEntry.w) variants.push({ variant: "w", text: achievementTitleText(id, "w", useLang) });
    return variants;
}

// Nutzt bewusst die lokalen Flaggenbilder (flags/de.svg, flags/gb.svg) statt der Unicode-Flaggen-
// Emoji (🇩🇪/🇬🇧): Windows zeigt Flaggen-Emoji-Sequenzen je nach Font/Version oft nur als reinen
// Buchstaben-Code ("DE"/"GB") statt als echte Flagge an -- die lokalen Bilder sehen dagegen
// plattformunabhängig immer gleich aus.
function updateLanguageButton() {
    const btn = document.getElementById("languageToggle");
    if (!btn) return;
    const flagIso = currentLang === "en" ? "gb" : "de";
    btn.innerHTML = t("settings.languageButton") +
        ' <img src="' + flagImageUrl(flagIso) + '" alt="" style="height:1em;vertical-align:-0.15em;margin-left:4px;border-radius:2px;">';
}

// Wendet die aktuelle Sprache auf alle statisch per data-i18n(-placeholder/-title) markierten
// Elemente an und stößt danach die JS-seitig dynamisch gerenderten Texte (Mute-Button, Namens-
// anzeige) neu an, damit auch ein Sprachwechsel WÄHREND der Nutzung sofort überall greift.
function applyTranslations() {
    document.documentElement.lang = currentLang;
    document.title = t("appTitle");
    document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.getAttribute("data-i18n")); });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => { el.placeholder = t(el.getAttribute("data-i18n-placeholder")); });
    document.querySelectorAll("[data-i18n-title]").forEach(el => { el.title = t(el.getAttribute("data-i18n-title")); });
    // data-i18n-html: wie data-i18n, aber setzt innerHTML statt textContent -- für Textblöcke mit
    // eingebetteter Formatierung (<strong>/<br>/<em>), z. B. im Hilfe-Screen. Der Übersetzungswert
    // selbst enthält dann das HTML-Markup.
    document.querySelectorAll("[data-i18n-html]").forEach(el => { el.innerHTML = t(el.getAttribute("data-i18n-html")); });
    updateLanguageButton();
    if (typeof updateMuteButton === "function") updateMuteButton();
    if (typeof renderNicknameDisplay === "function") renderNicknameDisplay();
    // Entdecker-Einstellungen: Kontinent-/Modus-Buttons, Zusammenfassungen und Zusatzmodus-Toggles
    // werden von JS gerendert (nicht per data-i18n), müssen bei einem Sprachwechsel WÄHREND der
    // Nutzung also explizit neu aufgebaut werden, sonst bleiben sie bis zum nächsten Navigations-
    // wechsel in der alten Sprache stehen.
    if (typeof buildSettingsScreen === "function") buildSettingsScreen(); // ruft intern auch updateHighscoreDisplay() etc. auf
    // Bestenlisten-Hub: nur neu aufbauen, wenn er schon einmal initialisiert wurde (hubBrowseSettings
    // gesetzt) -- sonst würde ein Sprachwechsel VOR dem ersten Besuch dort unnötig Arbeit anstoßen.
    if (typeof buildHubContinentButtons === "function" && typeof hubBrowseSettings !== "undefined" && hubBrowseSettings) {
        buildHubContinentButtons();
        buildHubLengthButtons();
        buildHubModeButtons();
        updateHubStandardHighscoreDisplay();
    }
    // Erfolge-Screen: nur neu rendern, wenn er gerade sichtbar ist (Titeltexte/Modifier-Wörter
    // sind sprachabhängig).
    const achievementsScreenEl = document.getElementById("achievementsScreen");
    if (achievementsScreenEl && achievementsScreenEl.style.display === "block" && typeof renderAchievementsScreen === "function") {
        renderAchievementsScreen();
    }
    // Gruppenquiz: laufende Leiter-/Mitspieler-Banner ebenfalls neu rendern, falls gerade aktiv.
    if (typeof renderGroupLeaderBanner === "function" && typeof getLeaderSession === "function" && getLeaderSession()) {
        renderGroupLeaderBanner();
    }
    if (typeof renderGroupPlayerBanner === "function" && typeof isGroupPlayer !== "undefined" && isGroupPlayer &&
        typeof getPlayerGroupSession === "function" && getPlayerGroupSession() && typeof lastKnownGroupStatus !== "undefined") {
        renderGroupPlayerBanner(getPlayerGroupSession().code, lastKnownGroupStatus);
    }
}

function setLanguage(lang) {
    currentLang = (lang === "en") ? "en" : "de";
    localStorage.setItem(LANG_STORAGE_KEY, currentLang);
    // Name nur neu würfeln, wenn er bisher automatisch generiert wurde (nie von Hand geändert) --
    // siehe NICKNAME_SOURCE_KEY in js/utils.js. So bekommen neue Spieler:innen beim Sprachwechsel
    // einen zur Sprache passenden Namen, ohne je einen selbst gewählten Namen zu überschreiben.
    try {
        if (typeof nicknameInput !== "undefined" && nicknameInput &&
            localStorage.getItem(NICKNAME_SOURCE_KEY) === "generated") {
            const newName = generateFantasyName();
            nicknameInput.value = newName;
            localStorage.setItem("flagquiz_nickname", newName);
        }
    } catch (e) { /* ignorieren */ }
    applyTranslations();
}

const languageToggle = document.getElementById("languageToggle");
if (languageToggle) {
    languageToggle.onclick = function () {
        setLanguage(currentLang === "de" ? "en" : "de");
    };
}
