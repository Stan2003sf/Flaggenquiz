// ---------- Neue Menüstruktur: Navigation zwischen den Ebenen ----------
// originMenu merkt sich, über welches Ebene-2-Untermenü die aktuelle Standard-/Gruppenrunde
// gestartet wurde ("single" = Einzelspieler > Standard, "multi" = Mehrspieler > Gruppe).
// Wird für den "Zurück zum Modus-Menü"-Link am Rundenende sowie den Abbruch-Button im Spiel benötigt.
let originMenu = "single";

function hideAllScreens() {
    mainMenu.style.display = "none";
    singlePlayerMenu.style.display = "none";
    multiPlayerMenu.style.display = "none";
    document.getElementById("groupEntryScreen").style.display = "none";
    ladderPlaceholder.style.display = "none";
    document.getElementById("ladderGame").style.display = "none";
    document.getElementById("ladderEndScreen").style.display = "none";
    document.getElementById("ladderMilestoneScreen").style.display = "none";
    document.getElementById("battleEntryScreen").style.display = "none";
    document.getElementById("battleContinentScreen").style.display = "none";
    document.getElementById("battlePoisonScreen").style.display = "none";
    document.getElementById("battleGameScreen").style.display = "none";
    document.getElementById("battleEndScreen").style.display = "none";
    document.getElementById("settingsMenuScreen").style.display = "none";
    document.getElementById("statsScreen").style.display = "none";
    document.getElementById("highscoreHubScreen").style.display = "none";
    document.getElementById("helpScreen").style.display = "none";
    settingsDiv.style.display = "none";
    document.getElementById("game").style.display = "none";
    document.getElementById("endScreen").style.display = "none";
}
// (game/endScreen werden hier bewusst per getElementById geholt, da die entsprechenden
// const-Deklarationen an dieser Stelle im Skript noch nicht ausgeführt wurden — hideAllScreens
// selbst wird aber erst zur Laufzeit nach vollständigem Skriptdurchlauf aufgerufen.)

// Titelleiste/Fußzeile (Statistik/Hilfe/Datenschutz) sind auf allen Menü-Ebenen sichtbar,
// nur während der eigentlichen Spielrunde (Ebene 3) ausgeblendet.
function setChromeVisible(visible) {
    titleBlock.style.display = visible ? "flex" : "none";
    ebene0Bar.style.display = visible ? "block" : "none";
    // Die Namens-Card wird grundsätzlich IMMER ausgeblendet (Whitelist statt Blacklist), unabhängig
    // vom übrigen Chrome-Status -- sie soll ausschließlich auf Ebene 0 (Hauptmenü) erscheinen.
    // goToMainMenu() blendet sie danach gezielt wieder ein. Würde sie hier nur beim Ausblenden mit
    // ausgeblendet, bliebe sie beim Wechsel zwischen zwei Bildschirmen mit sichtbarer Chrome (z. B.
    // Hauptmenü -> Einzelspieler-Menü) fälschlich sichtbar, da setChromeVisible(true) sie dann nie
    // aktiv abschaltet.
    setNicknameCardVisible(false);
}

function setNicknameCardVisible(visible) {
    document.getElementById("nicknameBlock").style.display = visible ? "block" : "none";
}

function goToMainMenu() {
    stopGroupHighscoreLive();
    hideAllScreens();
    setChromeVisible(true);
    setNicknameCardVisible(true); // Namens-Card erscheint ausschließlich auf Ebene 0
    mainMenu.style.display = "block";
}

function goToSinglePlayerMenu() {
    hideAllScreens();
    setChromeVisible(true);
    singlePlayerMenu.style.display = "block";
}

function goToMultiPlayerMenu() {
    hideAllScreens();
    setChromeVisible(true);
    updateGroupEntryLinksState();
    multiPlayerMenu.style.display = "block";
}

function goToLadderPlaceholder() {
    hideAllScreens();
    setChromeVisible(true);
    ladderPlaceholder.style.display = "block";
}

// Zeigt die (bisherige) Standard-Einstellungsseite — dient sowohl dem Standard-Einzelspiel
// als auch weiterhin (unverändert) dem gesamten Gruppenquiz-Ablauf (Leitung & Mitspieler:innen).
// Überschrift hängt vom Ursprung ab, da beide Abläufe denselben Bildschirm teilen (Punkt 15).
function goToStandardSettings(origin) {
    originMenu = origin;
    hideAllScreens();
    setChromeVisible(true);
    settingsDiv.style.display = "block";
    document.querySelector("#settings .screen-heading").textContent =
        origin === "multi" ? t("settings.groupHeading") : t("settings.explorerHeading");
    updateLengthHint();
    updateHighscoreDisplay();
    updateGroupStartButtonUI();
    checkConnection();
}

// Zurück-Navigation von Spielrunde (Ebene 3) bzw. Rundenende zum passenden Modus-Menü.
// Solange eine Gruppe geleitet wird oder das Gerät Gruppen-Mitspieler ist, bleibt das Verhalten
// wie bisher (zurück zur gemeinsamen Einstellungsseite) — das ist technisch weiterhin Ebene 2b.
//
// HINWEIS: Der Zurück-Pfeil auf der Standard-Einstellungsseite wurde früher bei aktiver Gruppe
// unsichtbar/inaktiv geschaltet. Problem dabei: Wurde die Gruppe im Hintergrund automatisch
// beendet (Ablauf, Schließung durch die Leitung), blieb der Pfeil trotzdem gesperrt, obwohl der
// Bildschirm wieder wie eine normale Standard-Runde aussah — ein toter Button ohne Ausweg.
// Jetzt bleibt der Pfeil immer sichtbar UND klickbar; die eigentliche Logik (Gruppe ggf. sauber
// verlassen/schließen, bevor navigiert wird) steckt im Klick-Handler weiter unten.
function updateStandardBackArrowVisibility() { /* bewusst leer gelassen, siehe Hinweis oben */ }

function backToModeMenu() {
    if (getLeaderSession() || isGroupPlayer) {
        goToStandardSettings("multi");
        return;
    }
    if (originMenu === "multi") {
        goToMultiPlayerMenu();
    } else {
        // Zurück zum Entdecker-Einstiegsbildschirm selbst (nicht zum übergeordneten Einzelspieler-
        // Menü) — konsistent zum Gipfelsturm, der ebenfalls zu seinem eigenen Einstieg zurückführt.
        goToStandardSettings("single");
    }
}
const nicknameInput = document.getElementById("nickname");
const nicknameHint = document.getElementById("nicknameHint");
const highscoreDisplay = document.getElementById("highscoreDisplay");
const continentButtons = document.getElementById("continentButtons");
const lengthButtons = document.getElementById("lengthButtons");
const lengthHint = document.getElementById("lengthHint");
const continentSummary = document.getElementById("continentSummary");
const modeButtons = document.getElementById("modeButtons");
const learningModeToggle = document.getElementById("learningModeToggle");
const proModeToggle = document.getElementById("proModeToggle");
const speedModeToggle = document.getElementById("speedModeToggle");
const statsContent = document.getElementById("statsContent");
const statsResetBtn = document.getElementById("statsResetBtn");
const privacyLink = document.getElementById("privacyLink");
const privacyModal = document.getElementById("privacyModal");
const privacyCloseBtn = document.getElementById("privacyCloseBtn");
const helpLink = document.getElementById("helpLink");
const muteBtn = document.getElementById("muteBtn");
const startBtn = document.getElementById("startBtn");

const game = document.getElementById("game");
const flagDiv = document.getElementById("flag");
const answer = document.getElementById("answer");
const textInputArea = document.getElementById("textInputArea");
const mcOptionsDiv = document.getElementById("mcOptions");
const reverseMcOptionsDiv = document.getElementById("reverseMcOptions");
const countryNamePrompt = document.getElementById("countryNamePrompt");
const tipBtn = document.getElementById("tipBtn");
const tipDiv = document.getElementById("tip");
const solveBtn = document.getElementById("solveBtn");
const nextBtn = document.getElementById("nextBtn");
const scoreDiv = document.getElementById("score");
const emojiDiv = document.getElementById("emoji");
const solutionDiv = document.getElementById("solution");
const pointsDiv = document.getElementById("points");
const tipCostChips = document.getElementById("tipCostChips");
const pointsChips = document.getElementById("pointsChips");
const timeBonusBarInner = document.getElementById("timeBonusBarInner");
const speedBonusIndicator = document.getElementById("speedBonusIndicator");
const counterDiv = document.getElementById("counter");
const progressBarInner = document.getElementById("progressBarInner");
const endBtn = document.getElementById("endBtn");

const endScreen = document.getElementById("endScreen");
const finalScoreLine = document.getElementById("finalScoreLine");
const scoreBreakdownLine = document.getElementById("scoreBreakdownLine");
const highscoreLine = document.getElementById("highscoreLine");
const groupHighscoreBox = document.getElementById("groupHighscoreBox");
const wrongListTitle = document.getElementById("wrongListTitle");
const wrongListDiv = document.getElementById("wrongList");
const restartBtn = document.getElementById("restartBtn");

