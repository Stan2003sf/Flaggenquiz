// ---------- Settings-Screen aufbauen ----------

// ---------- Einstellungen dauerhaft merken ----------
const SETTINGS_STORAGE_KEY = "flagquiz_settings";

function saveSettingsToStorage() {
    try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            continents: settings.continents,
            length: settings.length,
            mode: settings.mode,
            learningMode: settings.learningMode,
            proMode: settings.proMode,
            speedMode: settings.speedMode
        }));
    } catch (e) { /* localStorage evtl. nicht verfügbar, ignorieren */ }
    updateAllSummaries();
    syncGroupSettingsIfLeader();
}

function loadSettingsFromStorage() {
    try {
        const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.continents)) {
            const valid = parsed.continents.filter(c => continents.includes(c));
            if (valid.length > 0) settings.continents = valid;
        }
        if (typeof parsed.length === "number" && [10, 20, 30, 50].includes(parsed.length)) {
            settings.length = parsed.length;
        }
        if (parsed.mode === "text" || parsed.mode === "mc" || parsed.mode === "reverse-mc" || parsed.mode === "mixed") {
            settings.mode = parsed.mode;
        }
        if (typeof parsed.learningMode === "boolean") {
            settings.learningMode = parsed.learningMode;
        }
        if (typeof parsed.proMode === "boolean") {
            settings.proMode = parsed.proMode;
        }
        if (typeof parsed.speedMode === "boolean") {
            settings.speedMode = parsed.speedMode;
        }
        // Sicherheitsnetz: falls je beide gleichzeitig gespeichert wurden, hat der Lernmodus Vorrang
        if (settings.learningMode && settings.speedMode) {
            settings.speedMode = false;
        }
    } catch (e) { /* fehlerhafte/ fehlende Daten -> Standardwerte bleiben */ }
}

function modeLabel() {
    if (settings.mode === "mc") return t("mode.mc");
    if (settings.mode === "reverse-mc") return t("mode.reverseMc");
    if (settings.mode === "mixed") return t("mode.mixed");
    return t("mode.text");
}

// Zieht per Frage zufällig einen der 3 Basis-Modi, aber ausgeglichen:
// eine "Tüte" mit je einem Text-/MC-/Reverse-MC-Los wird gemischt und nacheinander geleert.
function pickMixedSubMode() {
    if (mixedBag.length === 0) {
        mixedBag = shuffle(["text", "mc", "reverse-mc"], isGroupPlayer ? groupRng : null);
    }
    return mixedBag.pop();
}


function updateContinentSummary() {
    const total = continents.length;
    const sel = continents.filter(c => settings.continents.includes(c)); // in fester Reihenfolge

    let text;
    if (sel.length === 0) {
        text = t("settings.continentPleaseChoose");
    } else if (sel.length === total) {
        text = t("settings.continentAll");
    } else if (sel.length === total - 1) {
        const missing = continents.find(c => !sel.includes(c));
        text = t("settings.continentAllExcept") + " " + continentDisplayName(missing);
    } else if (sel.length === 1) {
        text = continentDisplayName(sel[0]);
    } else {
        text = sel.slice(0, -1).map(continentDisplayName).join(", ") + " " + t("settings.continentAnd") + " " + continentDisplayName(sel[sel.length - 1]);
    }
    continentSummary.textContent = text;
    continentSummary.style.color = sel.length === 0 ? "var(--color-danger)" : "";
    continentSummary.style.fontWeight = sel.length === 0 ? "700" : "";
}

// Sperrt den Start-Button, solange kein Kontinent ausgewählt ist (Punkt 7).
function updateStartButtonContinentGate() {
    if (settings.continents.length === 0) {
        startBtn.disabled = true;
        startBtn.dataset.continentGated = "1";
    } else if (startBtn.dataset.continentGated === "1") {
        startBtn.disabled = false;
        delete startBtn.dataset.continentGated;
    }
}

// Aktualisiert die Kurz-Zusammenfassungen in den Accordion-Kopfzeilen der Einstellungen.
function updateAllSummaries() {
    updateContinentSummary();
    const lengthSummaryEl = document.getElementById("lengthSummary");
    if (lengthSummaryEl) lengthSummaryEl.textContent = settings.length + " " + t("settings.flags");
    const modeSummaryEl = document.getElementById("modeSummary");
    if (modeSummaryEl) modeSummaryEl.textContent = modeLabel();
    const specialSummaryEl = document.getElementById("specialModeSummary");
    if (specialSummaryEl) {
        const parts = [];
        if (settings.learningMode) parts.push("🎓 " + t("mode.learning"));
        if (settings.proMode) parts.push("🎯 " + t("mode.pro"));
        if (settings.speedMode) parts.push("⚡ " + t("mode.speed"));
        specialSummaryEl.textContent = parts.length ? parts.join(" · ") : t("settings.standard");
    }
}

const CONTINENT_ICONS = {
    "Europa": "🏰",
    "Asien": "🏯",
    "Afrika": "🦁",
    "Nordamerika": "🗽",
    "Südamerika": "🗿",
    "Ozeanien": "🦘"
};

function buildSettingsScreen() {
    continentButtons.innerHTML = "";
    const allBtn = document.createElement("button");
    allBtn.className = "option-btn";
    allBtn.textContent = "🌍 " + t("settings.continentAll");
    allBtn.dataset.continent = "all";
    continentButtons.appendChild(allBtn);

    continents.forEach(cont => {
        const btn = document.createElement("button");
        btn.className = "option-btn";
        btn.textContent = (CONTINENT_ICONS[cont] || "🌐") + " " + continentDisplayName(cont);
        btn.dataset.continent = cont;
        continentButtons.appendChild(btn);
    });

    function refreshContinentButtonStyles() {
        continentButtons.querySelectorAll(".option-btn[data-continent]:not([data-continent='all'])").forEach(b => {
            b.classList.toggle("selected", settings.continents.includes(b.dataset.continent));
        });
        allBtn.classList.toggle("selected", settings.continents.length === continents.length);
        updateContinentSummary();
    }

    allBtn.onclick = () => {
        // War "Alle" bereits aktiv, wählt ein erneuter Klick alles ab (schnelleres Wechseln
        // auf nur einen Kontinent, statt jeden einzeln abzuwählen). Sonst wählt er alles an.
        settings.continents = (settings.continents.length === continents.length) ? [] : [...continents];
        refreshContinentButtonStyles();
        updateLengthHint();
        updateHighscoreDisplay();
        updateStartButtonContinentGate();
        saveSettingsToStorage();
    };

    continentButtons.querySelectorAll(".option-btn[data-continent]:not([data-continent='all'])").forEach(btn => {
        btn.onclick = () => {
            const cont = btn.dataset.continent;
            if (settings.continents.includes(cont)) {
                settings.continents = settings.continents.filter(c => c !== cont);
            } else {
                settings.continents = [...settings.continents, cont];
            }
            refreshContinentButtonStyles();
            updateLengthHint();
            updateHighscoreDisplay();
            updateStartButtonContinentGate();
            saveSettingsToStorage();
        };
    });

    refreshContinentButtonStyles();
    updateStartButtonContinentGate();

    lengthButtons.innerHTML = "";
    [10, 20, 30, 50].forEach((n) => {
        const btn = document.createElement("button");
        btn.className = "option-btn" + (n === settings.length ? " selected" : "");
        btn.textContent = "🚩 " + n;
        btn.dataset.length = n;
        btn.onclick = () => {
            lengthButtons.querySelectorAll(".option-btn").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");
            settings.length = n;
            updateLengthHint();
            updateHighscoreDisplay();
            saveSettingsToStorage();
        };
        lengthButtons.appendChild(btn);
    });

    modeButtons.querySelectorAll(".option-btn").forEach(btn => {
        btn.classList.toggle("selected", btn.dataset.mode === settings.mode);
        btn.onclick = () => {
            modeButtons.querySelectorAll(".option-btn").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");
            settings.mode = btn.dataset.mode;
            updateHighscoreDisplay();
            saveSettingsToStorage();
        };
    });

    function refreshLearningModeButton() {
        learningModeToggle.classList.toggle("selected", settings.learningMode);
        learningModeToggle.textContent = "🎓 " + t("mode.learning") + ": " + (settings.learningMode ? t("settings.on") : t("settings.off"));
    }
    refreshLearningModeButton();
    learningModeToggle.onclick = () => {
        settings.learningMode = !settings.learningMode;
        if (settings.learningMode) {
            settings.speedMode = false; // schließen sich gegenseitig aus
            refreshSpeedModeButton();
        }
        refreshLearningModeButton();
        saveSettingsToStorage();
    };

    function refreshProModeButton() {
        proModeToggle.classList.toggle("selected", settings.proMode);
        proModeToggle.textContent = "🎯 " + t("mode.pro") + ": " + (settings.proMode ? t("settings.on") : t("settings.off"));
    }
    refreshProModeButton();
    proModeToggle.onclick = () => {
        settings.proMode = !settings.proMode;
        refreshProModeButton();
        saveSettingsToStorage();
    };

    function refreshSpeedModeButton() {
        speedModeToggle.classList.toggle("selected", settings.speedMode);
        speedModeToggle.textContent = "⚡ " + t("mode.speed") + ": " + (settings.speedMode ? t("settings.on") : t("settings.off"));
    }
    refreshSpeedModeButton();
    speedModeToggle.onclick = () => {
        settings.speedMode = !settings.speedMode;
        if (settings.speedMode) {
            settings.learningMode = false; // schließen sich gegenseitig aus
            refreshLearningModeButton();
        }
        refreshSpeedModeButton();
        saveSettingsToStorage();
    };

    updateLengthHint();
    updateHighscoreDisplay();
    updateAllSummaries();
}

function getFilteredCountries() {
    return countries.filter(c => settings.continents.includes(c.continent));
}

function updateLengthHint() {
    const available = getFilteredCountries().length;
    if (settings.length > available) {
        lengthHint.textContent = t("settings.lengthHint").replace("{n}", available);
    } else {
        lengthHint.textContent = "";
    }
}

function getLocalTopList(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
        // Fallback für das alte Einzel-Highscore-Format aus einer früheren Version
        if (parsed && typeof parsed === "object" && "score" in parsed) {
            return [{ name: parsed.name || t("common.anonymous"), score: parsed.score }];
        }
        return [];
    } catch (e) {
        return [];
    }
}

function saveLocalTopList(key, list) {
    try {
        localStorage.setItem(key, JSON.stringify(list));
    } catch (e) { /* localStorage evtl. nicht verfügbar, ignorieren */ }
}

// Lädt die Top-3-Liste zentral aus Firestore. Schlägt das fehl (offline, blockiert, o.ä.),
// wird automatisch auf die lokal zwischengespeicherte Liste zurückgegriffen.
async function fetchTopList(key) {
    if (!firestoreDb) return { list: getLocalTopList(key), online: false };
    try {
        const doc = await firestoreDb.collection("highscores").doc(key).get();
        const entries = doc.exists && Array.isArray(doc.data().entries) ? doc.data().entries : [];
        saveLocalTopList(key, entries); // als Offline-Cache mitführen
        return { list: entries, online: true };
    } catch (e) {
        console.warn("Zentrale Bestenliste nicht erreichbar, nutze lokalen Stand.", e);
        return { list: getLocalTopList(key), online: false };
    }
}

// Speichert die Top-3-Liste zentral in Firestore, mit lokalem Fallback bei Fehlern.
async function saveTopList(key, list) {
    saveLocalTopList(key, list); // immer auch lokal sichern
    if (!firestoreDb) return false;
    try {
        await firestoreDb.collection("highscores").doc(key).set({ entries: list });
        return true;
    } catch (e) {
        console.warn("Highscore konnte nicht zentral gespeichert werden, nur lokal gesichert.", e);
        return false;
    }
}

