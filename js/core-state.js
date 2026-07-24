// ---------- State ----------

const continents = [...new Set(countries.map(c => c.continent))];

let settings = { continents: [...continents], length: 20, mode: "mc", learningMode: false, proMode: false, speedMode: false };
let list = [];
let index = 0;
let score = 0;
let roundBaseSum = 0;
let roundTimeBonusSum = 0;
let roundStreakSum = 0;
let roundNewBestStreakValue = null; // gesetzt, wenn in dieser Runde eine neue persönliche Bestserie erreicht wurde
let tipCount = 0;
let maxFlags = 20;
let wrongAnswers = [];
let flagStartTime = 0;
let flagLoadToken = 0; // verhindert, dass der Timer nachträglich startet, wenn die Frage schon gewechselt wurde
let currentStreak = 0; // Anzahl richtiger Antworten ohne Tipp in Folge
let currentMode = "mc"; // effektiver Modus der aktuellen Frage (bei Mixed pro Frage neu bestimmt)
let mixedBag = []; // Ziehungs-"Tüte" für einen ausgeglichenen Mixed-Modus
// Vorab berechneter "Fahrplan" der ganzen Runde: pro Flagge Modus + fertige Antwortoptionen
// (bei mc/reverse-mc). So lässt sich für jede kommende Frage genau vorausbestimmen, welche
// Flaggenbilder gebraucht werden — und diese gezielt im Voraus laden (siehe prefetchUpcomingFlags).
let questionPlan = [];
const loadingInfo = document.getElementById("loadingInfo");

const BEST_STREAK_KEY = "flagquiz_best_streak";

function getBestStreak() {
    const v = parseInt(localStorage.getItem(BEST_STREAK_KEY), 10);
    return isNaN(v) ? 0 : v;
}

function updateBestStreak(value) {
    if (value > getBestStreak()) {
        try { localStorage.setItem(BEST_STREAK_KEY, String(value)); } catch (e) { /* ignorieren */ }
    }
}

// ---------- Elemente ----------

const settingsDiv = document.getElementById("settings");
const titleBlock = document.getElementById("titleBlock");
const ebene0Bar = document.getElementById("ebene0Bar");
const mainMenu = document.getElementById("mainMenu");
const singlePlayerMenu = document.getElementById("singlePlayerMenu");
const multiPlayerMenu = document.getElementById("multiPlayerMenu");
const ladderPlaceholder = document.getElementById("ladderPlaceholder");

