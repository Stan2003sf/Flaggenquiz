// ---------- Start ----------

startBtn.onclick = async function () {
    if (containsBlockedContent(nicknameInput.value)) {
        nicknameInput.value = generateFantasyName();
        localStorage.setItem("flagquiz_nickname", nicknameInput.value);
        renderNicknameDisplay();
    }

    const rawName = nicknameInput.value.trim();
    const playerName = rawName || generateFantasyName();
    if (!rawName) {
        nicknameInput.value = playerName;
        localStorage.setItem("flagquiz_nickname", playerName);
        renderNicknameDisplay();
    }
    nicknameHint.style.display = "none";

    // Namens-Kollisionsprüfung: derselbe Name bereits unter einer ANDEREN Geräte-ID vergeben?
    // Im Gruppenquiz entfällt das komplett, da dort keine globale Bestenliste verwendet wird.
    // Für alle anderen Fälle greift dies meist auf den Cache zurück (siehe checkNameCollision),
    // wurde der Name schon beim Verlassen des Namensfelds geprüft, ist es hier normalerweise
    // sofort fertig statt spürbar zu laden.
    if (!isGroupPlayer) {
        const collision = await checkNameCollision(playerName);
        if (collision) {
            nicknameHint.textContent = "Name bereits vergeben – bitte wähle einen anderen Namen.";
            nicknameHint.style.display = "block";
            return;
        }
    }

    // Gruppenquiz: sobald tatsächlich gestartet wird, diese Runde als "gespielt" markieren,
    // damit der Start-Button gesperrt bleibt, bis die Gruppenleitung die nächste Runde freigibt.
    if (isGroupPlayer) {
        lastPlayedGroupRound = currentGroupRound;
        updateGroupStartButtonUI();
    }

    // Gruppenquiz: Zufallsfolge aus Gruppen-Code + Rundennummer ableiten, damit alle
    // Mitspieler:innen exakt dieselben Flaggen in derselben Reihenfolge und dieselben
    // Antwortoptionen bekommen — die Ziehung wirkt zufällig, ist aber über die Runde gesteuert.
    if (isGroupPlayer) {
        const playerSession = getPlayerGroupSession();
        const seedText = (playerSession ? playerSession.code : "gruppe") + "_runde_" + currentGroupRound;
        groupRng = mulberry32(stringToSeed(seedText));
    } else {
        groupRng = null;
    }

    const filtered = getFilteredCountries();
    maxFlags = Math.min(settings.length, filtered.length);
    list = shuffle(filtered, groupRng).slice(0, maxFlags);
    index = 0;
    score = 0;
    roundBaseSum = 0;
    roundTimeBonusSum = 0;
    roundStreakSum = 0;
    roundNewBestStreakValue = null;
    wrongAnswers = [];
    currentStreak = 0;
    mixedBag = [];
    questionPlan = buildQuestionPlan(list);
    scoreDiv.innerHTML = "Punkte: 0";
    scoreDiv.style.display = settings.learningMode ? "none" : "block";

    updateSettingsSummaryLine();

    settingsDiv.style.display = "none";
    endScreen.style.display = "none";
    setChromeVisible(false);
    game.style.display = "block";
    loadFlag();
};

function updateSettingsSummaryLine() {
    document.getElementById("settingsSummary").innerHTML =
        "🌍 " + continentLabel() + " &nbsp;·&nbsp; 🚩 " + maxFlags + " Flaggen &nbsp;·&nbsp; ✏️ " + modeLabel() +
        (settings.learningMode ? " &nbsp;·&nbsp; 🎓 Lernmodus" : "") +
        (settings.proMode ? " &nbsp;·&nbsp; 🎯 Profimodus" : "") +
        (settings.speedMode ? " &nbsp;·&nbsp; ⚡ Speedmodus" : "");
}

// ---------- Reload-Wiederherstellung einer laufenden Entdecker-Runde ----------
// Bewusst NICHT für Gruppenrunden (isGroupPlayer/Leitung): die haben bereits ihre eigene,
// serverseitige Wiederherstellung über Firestore — beide Mechanismen dürfen sich nicht
// überschneiden. Der Zeitbonus-/Speedmodus-Timer hängt an flagStartTime (echter Zeitstempel) und
// wird beim Wiederherstellen NICHT auf "jetzt" zurückgesetzt, sondern rechnet mit der tatsächlich
// vergangenen Zeit weiter (siehe loadFlag/resumeState) — sonst ließe sich ein Speedmodus-Timeout
// einfach durch Neuladen umgehen oder der Zeitbonus künstlich auf Maximum zurücksetzen.
const ACTIVE_ROUND_KEY = "flagquiz_active_round_standard";

function saveActiveStandardRound(pendingAdvance) {
    if (isGroupPlayer) return;
    try {
        localStorage.setItem(ACTIVE_ROUND_KEY, JSON.stringify({
            savedAt: Date.now(),
            questionPlan: questionPlan.map(e => ({
                mode: e.mode,
                countryIso: e.country.iso,
                optionIsos: e.options.map(o => o.iso)
            })),
            index: index,
            maxFlags: maxFlags,
            score: score,
            roundBaseSum: roundBaseSum,
            roundTimeBonusSum: roundTimeBonusSum,
            roundStreakSum: roundStreakSum,
            roundNewBestStreakValue: roundNewBestStreakValue,
            // Bei pendingAdvance zählt der Tipp-Stand der SCHON BEANTWORTETEN Frage nicht mehr für
            // die nächste Frage (die beim Wiederherstellen ganz normal frisch geladen wird).
            tipCount: pendingAdvance ? 0 : tipCount,
            wrongAnswers: wrongAnswers,
            currentStreak: currentStreak,
            flagStartTime: flagStartTime,
            // true = Frage wurde bereits beantwortet, Ergebniskarte war sichtbar, "Weiter" aber noch
            // nicht geklickt. Ein Reload in genau diesem Moment führt beim Wiederherstellen direkt
            // zur nächsten Frage (wie "Weiter" bereits geklickt) statt die Auswertung erneut zu zeigen.
            pendingAdvance: !!pendingAdvance
        }));
    } catch (e) { /* ignorieren */ }
}

function clearActiveStandardRound() {
    try { localStorage.removeItem(ACTIVE_ROUND_KEY); } catch (e) { /* ignorieren */ }
}

function loadActiveStandardRoundData() {
    let raw;
    try { raw = localStorage.getItem(ACTIVE_ROUND_KEY); } catch (e) { return null; }
    if (!raw) return null;
    let data;
    try { data = JSON.parse(raw); } catch (e) { return null; }
    if (!data || typeof data.savedAt !== "number" || Date.now() - data.savedAt > ACTIVE_ROUND_MAX_AGE_MS) {
        clearActiveStandardRound();
        return null;
    }
    return data;
}

// Wird beim Seitenstart aufgerufen (siehe init.js). Liefert true, wenn eine Runde wiederhergestellt
// und die entsprechenden Bildschirme bereits angezeigt wurden — sonst false (init.js zeigt dann
// ganz normal das Hauptmenü).
function restoreActiveStandardRound() {
    const data = loadActiveStandardRoundData();
    if (!data || isGroupPlayer) return false;

    const plan = data.questionPlan.map(e => {
        const country = countries.find(c => c.iso === e.countryIso);
        if (!country) return null;
        const options = (e.optionIsos || []).map(iso => countries.find(c => c.iso === iso));
        if (options.some(o => !o)) return null;
        return { mode: e.mode, country: country, options: options };
    });
    // Länderdaten inzwischen verändert oder Datensatz beschädigt -> lieber verwerfen als eine
    // kaputte Runde zu zeigen.
    if (plan.length === 0 || plan.some(e => !e)) { clearActiveStandardRound(); return false; }

    questionPlan = plan;
    list = plan.map(e => e.country);
    maxFlags = data.maxFlags;
    score = data.score;
    roundBaseSum = data.roundBaseSum;
    roundTimeBonusSum = data.roundTimeBonusSum;
    roundStreakSum = data.roundStreakSum;
    roundNewBestStreakValue = data.roundNewBestStreakValue;
    wrongAnswers = data.wrongAnswers || [];
    currentStreak = data.currentStreak || 0;
    mixedBag = [];

    hideAllScreens();
    setChromeVisible(false);
    settingsDiv.style.display = "none";
    endScreen.style.display = "none";
    game.style.display = "block";
    updateSettingsSummaryLine();
    scoreDiv.innerHTML = "Punkte: " + score;
    scoreDiv.style.display = settings.learningMode ? "none" : "block";

    index = data.index;
    if (data.pendingAdvance) {
        // Wie "Weiter" bereits geklickt: die zuletzt beantwortete Frage wurde nicht mehr angezeigt.
        index++;
        if (index >= maxFlags) {
            showEndScreen();
        } else {
            loadFlag();
        }
    } else {
        loadFlag({ flagStartTime: data.flagStartTime, tipCount: data.tipCount || 0 });
    }
    return true;
}

// ---------- Punkteberechnung ----------

// ---------- Siegesserie: gestaffelter Bonus ----------
// 3–7 in Folge: Bonus steigt bei jeder Antwort (+1 je Antwort). Ab der 7. bis zur 19. Antwort in
// Folge steigt der Bonus nur noch alle 3 Antworten um 1. Ab der 20. Antwort in Folge (Meilenstein,
// direkter Sprung um +1) steigt der Bonus danach nur noch alle 5 Antworten um 1.
function computeStreakBonus(streak) {
    if (streak < 3) return 0;
    if (streak <= 7) return streak - 2;
    if (streak < 20) return 5 + Math.floor((streak - 7) / 3);
    return 10 + Math.floor((streak - 20) / 5);
}

function calculatePoints(country, tips) {
    const base = 20;
    if (tips === 0) return base;
    if (tips === 1) return base / 2;
    return base / 4;
}

const TIME_BONUS_WINDOW_MS = 5000; // normale Modi — Zeitbonus sinkt alle 0,5 Sek. um 1 Punkt, erreicht bei 5,0 Sek. die 0
const SPEED_TIME_BONUS_WINDOW_MS = 2500; // Speedmodus bei Multiple Choice/Umkehr-MC — alle 0,25 Sek. um 1 Punkt, 0 bei 2,5 Sek.
const SPEED_TEXT_TIME_BONUS_WINDOW_MS = 5000; // Speedmodus bei Texteingabe — nutzt dieselbe Skala wie "normal", da im Textmodus die doppelte Speedmodus-Zeit gilt
let timeBonusIntervalId = null;

// Gruppenquiz: zusätzliches, festes Zeitlimit (unabhängig vom persönlichen Speedmodus), damit
// sich niemand in der Gruppe unbegrenzt Zeit lassen kann. Läuft "on top" zum Speedmodus — ist
// der Speedmodus bereits an (5 Sek.), greift ohnehin dessen kürzeres Zeitlimit zuerst.
const GROUP_HARD_TIMEOUT_MS = 20000;
let groupHardTimeoutId = null;

// Aktuelles Zeitfenster für den Zeitbonus/das Zeitlimit dieser Frage: im Speedmodus normalerweise
// 5 Sekunden, aber bei Texteingabe 10 Sekunden (Tippen braucht länger als Tippen/Klicken einer Option).
function currentTimeBonusWindowMs() {
    if (!settings.speedMode) return TIME_BONUS_WINDOW_MS;
    return currentMode === "text" ? SPEED_TEXT_TIME_BONUS_WINDOW_MS : SPEED_TIME_BONUS_WINDOW_MS;
}

// Basis 10 Zeitbonus-Punkte, die mit der Zeit linear absinken. Im normalen Tempo sinkt der Bonus
// alle 0,5 Sek. um 1 Punkt (Fenster 5 Sek.); im Speedmodus (bei MC/Umkehr-MC) doppelt so schnell,
// alle 0,25 Sek. um 1 Punkt (Fenster 2,5 Sek.), damit sich die Zeitknappheit proportional überträgt.
function calculateTimeBonus(elapsedSeconds) {
    if (settings.speedMode && currentMode !== "text") {
        const bonus = 11 - Math.ceil(elapsedSeconds / 0.25);
        return Math.max(0, Math.min(10, bonus));
    }
    // Gilt für alle normalen Modi UND für Texteingabe im Speedmodus (dort mit den gleichen
    // Schwellen wie sonst, da im Textmodus die doppelte Speedmodus-Zeit gilt).
    const bonus = 11 - Math.ceil(elapsedSeconds / 0.5);
    return Math.max(0, Math.min(10, bonus));
}

function startTimeBonusBar() {
    clearInterval(timeBonusIntervalId);
    timeBonusBarInner.classList.toggle("speed-mode", settings.speedMode);
    timeBonusBarInner.style.transition = "none";
    timeBonusBarInner.style.width = "100%";
    // Erzwingt Neuberechnung, damit die Transition beim nächsten Tick wieder greift
    void timeBonusBarInner.offsetWidth;
    timeBonusBarInner.style.transition = "width 0.1s linear";

    timeBonusIntervalId = setInterval(() => {
        const windowMs = currentTimeBonusWindowMs();
        const elapsedMs = Date.now() - flagStartTime;
        const pct = Math.max(0, 100 - (elapsedMs / windowMs * 100));
        timeBonusBarInner.style.width = pct + "%";
        if (!settings.learningMode) {
            const currentBonus = calculateTimeBonus(elapsedMs / 1000);
            speedBonusIndicator.textContent = currentBonus > 0 ? "⏱️ +" + currentBonus : "";
        }
        if (pct <= 0) {
            clearInterval(timeBonusIntervalId);
            if (settings.speedMode) handleSpeedTimeout();
        }
    }, 100);
}

// Speedmodus: Zeit abgelaufen, ohne dass geantwortet wurde -> als nicht beantwortet werten (0 Punkte),
// Lösung kurz zeigen, danach automatisch zur nächsten Frage
function handleSpeedTimeout() {
    submitAnswer(""); // wird wie eine falsche/leere Antwort behandelt -> 0 Punkte, Serie bricht
    setTimeout(() => {
        if (nextBtn.style.display !== "none") nextBtn.click();
    }, 2000);
}

function stopTimeBonusBar() {
    clearInterval(timeBonusIntervalId);
    clearTimeout(groupHardTimeoutId);
}

// ---------- Flagge laden ----------

// resumeState (optional): nur beim Wiederherstellen einer Runde nach einem Reload gesetzt, wenn
// die aktuelle Frage schon angezeigt war, aber noch nicht beantwortet wurde. Enthält den ECHTEN,
// ursprünglichen Startzeitpunkt der Frage (flagStartTime) und den schon genutzten tipCount — der
// Timer läuft dann mit der tatsächlich vergangenen Zeit weiter, statt neu bei 100 % zu starten
// (siehe saveActiveStandardRound weiter oben für die Begründung).
function loadFlag(resumeState) {
    tipCount = 0;
    tipDiv.innerHTML = "";
    solutionDiv.innerHTML = "";
    emojiDiv.innerHTML = "";
    pointsChips.innerHTML = "";
    pointsDiv.innerHTML = "";
    tipCostChips.innerHTML = "";
    document.getElementById("resultCard").classList.remove("visible");
    nextBtn.style.display = "none";
    answer.value = "";
    tipBtn.disabled = false;

    const planEntry = questionPlan[index];
    // Effektiven Modus für diese Frage bestimmen (bei Mixed pro Frage neu gezogen) — kommt
    // jetzt aus dem vorab berechneten Fahrplan, statt live gewürfelt zu werden.
    currentMode = planEntry.mode;
    textInputArea.style.display = currentMode === "text" ? "block" : "none";
    mcOptionsDiv.style.display = currentMode === "mc" ? "block" : "none";
    reverseMcOptionsDiv.style.display = currentMode === "reverse-mc" ? "grid" : "none";
    countryNamePrompt.style.display = currentMode === "reverse-mc" ? "block" : "none";
    flagDiv.style.display = currentMode === "reverse-mc" ? "none" : "block";

    if (currentMode === "text") {
        solveBtn.style.display = "inline-block";
        solveBtn.disabled = false;
        answer.disabled = false;
        answer.focus();
    } else {
        solveBtn.style.display = "none";
    }

    const c = planEntry.country;

    if (currentMode === "reverse-mc") {
        countryNamePrompt.textContent = c.name;
    } else {
        const flagUrl = flagImageUrl(c.iso);
        const flagError = document.getElementById("flagError");
        flagError.style.display = "none";
        flagError.textContent = "";
        flagDiv.style.backgroundImage = "url('" + flagUrl + "')";

        // Unauffälliger Test, ob das Bild tatsächlich lädt (ändert die Anzeige nicht, außer bei Fehler)
        const testImg = new Image();
        testImg.onerror = function () {
            flagError.textContent = "Flagge konnte nicht geladen werden";
            flagError.style.display = "flex";
        };
        testImg.src = flagUrl;
    }

    counterDiv.innerHTML = "Flagge " + (index + 1) + " von " + maxFlags;
    progressBarInner.style.width = (index / maxFlags * 100) + "%";
    pointsDiv.innerHTML = settings.learningMode
        ? "🎓 Lernmodus — kein Zeitdruck, kein Highscore-Eintrag"
        : "";

    if (currentMode === "mc" || currentMode === "reverse-mc") {
        buildAnswerOptions(c, planEntry.options);
    }

    document.getElementById("timeBonusRow").style.display = settings.learningMode ? "none" : "flex";
    speedBonusIndicator.innerHTML = "";

    // Beim Wiederherstellen nach einem Reload: schon genutzte Tipps optisch erneut anwenden
    // (entfernte Antwortoption, Tipp-Text, Kosten-Chips) — tipCount wird dabei bewusst genauso
    // hochgezählt wie beim echten Klick, currentStreak aber NICHT nochmal zurückgesetzt (steht
    // bereits korrekt über restoreActiveStandardRound).
    if (resumeState && resumeState.tipCount > 0) {
        for (let i = 0; i < resumeState.tipCount; i++) {
            tipCount++;
            applyTipVisualEffect(c);
        }
    }

    if (resumeState) {
        // Frage war schon sichtbar, bevor die Seite neu geladen wurde: Timer läuft mit der
        // tatsächlich vergangenen Zeit weiter (kein frischer 100%-Start) — siehe Kommentar oben an
        // saveActiveStandardRound. Ist das Zeitfenster in der Zwischenzeit schon abgelaufen, greift
        // im Speedmodus beim nächsten 100ms-Tick von startTimeBonusBar ganz normal handleSpeedTimeout,
        // exakt wie bei einem Timeout ohne Reload.
        flagStartTime = resumeState.flagStartTime;
        loadingInfo.textContent = "";
        if (!settings.learningMode) {
            startTimeBonusBar();
        }
    } else {
        // Zeitbonus erst starten, wenn die Flaggen tatsächlich geladen sind
        flagStartTime = Date.now(); // Fallback, falls jemand schon vor Ladeende antwortet
        const urlsToLoad = [];
        if (currentMode === "reverse-mc") {
            reverseMcOptionsDiv.querySelectorAll(".reverse-mc-btn").forEach(btn => {
                if (btn.dataset.flagUrl) urlsToLoad.push(btn.dataset.flagUrl);
            });
        } else {
            urlsToLoad.push(flagImageUrl(c.iso));
        }

        const myToken = ++flagLoadToken;
        loadingInfo.textContent = "⏳ Flaggen werden geladen…";
        timeBonusBarInner.style.transition = "none";
        timeBonusBarInner.style.width = "100%";

        preloadImages(urlsToLoad, 8000).then(result => {
            if (myToken !== flagLoadToken) return; // Frage wurde inzwischen gewechselt oder beantwortet
            loadingInfo.textContent = "";
            if (!result.allLoaded && currentMode === "reverse-mc") {
                loadingInfo.textContent = "⚠️ Flaggen konnten nicht geladen werden.";
            }
            flagStartTime = Date.now();
            if (!settings.learningMode) {
                startTimeBonusBar();
            }
            // Gruppenquiz: zusätzliches, festes 20-Sekunden-Zeitlimit — nur nötig, wenn der
            // (kürzere) Speedmodus nicht ohnehin schon aktiv ist.
            if (isGroupPlayer && !settings.speedMode) {
                clearTimeout(groupHardTimeoutId);
                groupHardTimeoutId = setTimeout(() => {
                    handleSpeedTimeout(); // gleiche Logik: 0 Punkte, Lösung kurz zeigen, automatisch weiter
                }, GROUP_HARD_TIMEOUT_MS);
            }
            saveActiveStandardRound(false);
        });
    }

    // Die kommenden Fragen schon jetzt unauffällig im Hintergrund laden, damit ihre Flaggen
    // beim eigentlichen Wechsel bereits im Browser-Cache liegen und sofort erscheinen. Da Modus
    // und Antwortoptionen dank questionPlan schon feststehen, werden bei Umkehr Multiple Choice
    // gezielt alle 4 benötigten Flaggenbilder vorgeladen — nicht nur die richtige.
    prefetchUpcomingFlags(index + 1, 4);

    if (resumeState) saveActiveStandardRound(false);
}

// Lädt die Flaggenbilder der kommenden `count` Fragen (ab `fromIndex`) unauffällig im
// Hintergrund vor, anhand des vorab berechneten Fahrplans (questionPlan).
function prefetchUpcomingFlags(fromIndex, count) {
    const upTo = Math.min(fromIndex + count, questionPlan.length);
    for (let i = fromIndex; i < upTo; i++) {
        const entry = questionPlan[i];
        const urls = entry.mode === "reverse-mc"
            ? entry.options.map(opt => flagImageUrl(opt.iso))
            : [flagImageUrl(entry.country.iso)];
        urls.forEach(u => { const img = new Image(); img.src = u; });
    }
}

// Lädt Bilder vor und meldet sich, sobald alle fertig sind (oder das Zeitlimit erreicht ist)
function preloadImages(urls, timeoutMs) {
    return new Promise(resolve => {
        if (urls.length === 0) { resolve({ allLoaded: true }); return; }
        let loaded = 0, failed = 0, finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            resolve({ allLoaded: loaded === urls.length });
        };
        const timer = setTimeout(finish, timeoutMs);
        urls.forEach(u => {
            const img = new Image();
            img.onload = () => { loaded++; if (loaded + failed === urls.length) finish(); };
            img.onerror = () => { failed++; if (loaded + failed === urls.length) finish(); };
            img.src = u;
        });
    });
}

// Berechnet für die komplette Runde vorab: welcher Modus (bei "Mixed") und welche fertigen,
// bereits gemischten Antwortoptionen (bei mc/reverse-mc) pro Flagge verwendet werden. Dadurch
// steht schon zu Beginn fest, welche Flaggenbilder für JEDE kommende Frage gebraucht werden —
// Grundlage für das gezielte Vorausladen mehrerer Fragen (prefetchUpcomingFlags).
function buildQuestionPlan(countryList) {
    const rng = isGroupPlayer ? groupRng : null;
    return countryList.map(c => {
        const mode = settings.mode === "mixed" ? pickMixedSubMode() : settings.mode;
        let options = [];
        if (mode === "mc" || mode === "reverse-mc") {
            const distractors = pickDistractors(c);
            options = shuffle([c, ...distractors], rng);
        }
        return { country: c, mode: mode, options: options };
    });
}

function pickDistractors(correctCountry) {
    const rng = isGroupPlayer ? groupRng : null;
    const pool = countries.filter(c => c.name !== correctCountry.name);
    if (settings.proMode) {
        const sameContinent = pool.filter(c => settings.continents.includes(c.continent));
        if (sameContinent.length >= 3) {
            return shuffle(sameContinent, rng).slice(0, 3);
        }
        // Zu wenige Länder im gewählten Kontinent -> mit den übrigen auffüllen, damit die Runde funktioniert
        const others = pool.filter(c => !settings.continents.includes(c.continent));
        return [...sameContinent, ...shuffle(others, rng)].slice(0, 3);
    }
    return shuffle(pool, rng).slice(0, 3);
}

// Baut die Antwort-Buttons aus den bereits vorab berechneten (fertig gemischten) Optionen auf
// (siehe buildQuestionPlan) — es wird hier bewusst NICHT erneut gewürfelt, damit die Vorschau
// beim Vorausladen (prefetchUpcomingFlags) exakt zu dem passt, was später angezeigt wird.
function buildAnswerOptions(correctCountry, options) {
    if (currentMode === "mc") {
        mcOptionsDiv.innerHTML = "";
        options.forEach(opt => {
            const btn = document.createElement("button");
            btn.className = "mc-btn";
            btn.textContent = opt.name;
            btn.onclick = () => submitAnswer(opt.name, correctCountry);
            mcOptionsDiv.appendChild(btn);
        });
    } else if (currentMode === "reverse-mc") {
        reverseMcOptionsDiv.innerHTML = "";
        options.forEach(opt => {
            const btn = document.createElement("button");
            btn.className = "reverse-mc-btn";
            const flagUrl = flagImageUrl(opt.iso);
            btn.style.backgroundImage = "url('" + flagUrl + "')";
            btn.dataset.flagUrl = flagUrl;
            btn.dataset.name = opt.name;
            btn.setAttribute("aria-label", opt.name);
            btn.onclick = () => submitAnswer(opt.name, correctCountry);
            reverseMcOptionsDiv.appendChild(btn);
        });
    }
}

// ---------- Tipp ----------

// Baut die sichtbaren Tipp-Effekte (Text, entfernte Option, Kosten-Chip) für den aktuellen
// tipCount auf. Getrennt von tipBtn.onclick, damit dieselbe Darstellung auch beim Wiederherstellen
// einer Runde nach einem Reload reproduziert werden kann (siehe loadFlag/resumeState), ohne dabei
// tipCount erneut hochzuzählen oder die Siegesserie ein zweites Mal zu unterbrechen.
function applyTipVisualEffect(c) {
    if (currentMode === "mc" || currentMode === "reverse-mc") {
        removeWrongOption(c);
        if (tipCount === 1) {
            tipDiv.innerHTML = "Eine falsche Antwort wurde entfernt.";
        } else if (tipCount === 2) {
            tipDiv.innerHTML = "Noch eine falsche Antwort wurde entfernt.";
            tipBtn.disabled = true;
        }
    } else {
        const singleContinent = settings.continents.length === 1;
        if (tipCount === 1) {
            if (singleContinent) {
                const letterCount = c.name.replace(/[^A-Za-zÀ-ÿ]/g, "").length;
                tipDiv.innerHTML = "Anzahl Buchstaben: " + letterCount;
            } else {
                tipDiv.innerHTML = "Kontinent: " + c.continent;
            }
        } else if (tipCount === 2) {
            tipDiv.innerHTML += "<br>Erster Buchstabe: " + c.name.charAt(0);
            tipBtn.disabled = true;
        }
    }

    if (tipCount === 1) {
        tipCostChips.innerHTML = '<span class="tip-cost-chip">⭐ −10</span>';
    } else if (tipCount === 2) {
        tipCostChips.innerHTML += '<span class="tip-cost-chip">⭐ −5</span>';
    }
}

tipBtn.onclick = function () {
    const c = list[index];
    tipCount++;
    currentStreak = 0; // Ein Tipp unterbricht die Siegesserie sofort
    applyTipVisualEffect(c);
    saveActiveStandardRound(false);
};

function removeWrongOption(correctCountry) {
    const isReverse = currentMode === "reverse-mc";
    const container = isReverse ? reverseMcOptionsDiv : mcOptionsDiv;
    const selector = isReverse ? ".reverse-mc-btn:not(:disabled)" : ".mc-btn:not(:disabled)";
    const buttons = Array.from(container.querySelectorAll(selector));
    const wrongButtons = buttons.filter(b => {
        const name = isReverse ? b.dataset.name : b.textContent;
        return normalize(name) !== normalize(correctCountry.name);
    });
    if (wrongButtons.length === 0) return;
    const target = wrongButtons[Math.floor(Math.random() * wrongButtons.length)];
    target.disabled = true;
    target.classList.add("eliminated");
}

// Liefert den aktuell sichtbaren Antwortbereich (abhängig vom Modus dieser Frage) — Anker für die
// aufsteigenden Punkte-/Richtig-Falsch-Effekte, die dort starten sollen (Punkt 11).
function currentAnswerAreaEl() {
    if (currentMode === "text") return textInputArea;
    if (currentMode === "reverse-mc") return reverseMcOptionsDiv;
    return mcOptionsDiv;
}

// ---------- Antwort einreichen ----------

function submitAnswer(userInput, forcedCountry) {
    flagLoadToken++; // laufendes Vorladen soll den Timer nicht mehr starten
    loadingInfo.textContent = "";
    stopTimeBonusBar();
    const c = forcedCountry || list[index];
    const elapsed = (Date.now() - flagStartTime) / 1000;
    const result = checkAnswer(userInput, c.name);

    if (currentMode === "text") {
        solveBtn.style.display = "none";
        answer.disabled = true;
    } else {
        const isReverse = currentMode === "reverse-mc";
        const container = isReverse ? reverseMcOptionsDiv : mcOptionsDiv;
        const btnSelector = isReverse ? ".reverse-mc-btn" : ".mc-btn";
        container.querySelectorAll(btnSelector).forEach(btn => {
            const btnName = isReverse ? btn.dataset.name : btn.textContent;
            btn.disabled = true;
            if (normalize(btnName) === normalize(c.name)) {
                btn.classList.add("correct");
            } else if (normalize(btnName) === normalize(userInput) && !result.correct) {
                btn.classList.add("wrong");
            }
        });
    }
    tipBtn.disabled = true;
    recordAnswerStat(c.name, result.correct);
    if (!settings.learningMode) incrementFlagStat(c.iso, result.correct);

    if (result.correct) {
        const basePoints = calculatePoints(c, tipCount);
        const bonus = settings.learningMode ? 0 : calculateTimeBonus(elapsed);

        let streakBonus = 0;
        if (tipCount === 0) {
            const prevBonus = computeStreakBonus(currentStreak);
            const wasNewBest = (currentStreak + 1) > getBestStreak();
            currentStreak++;
            updateBestStreak(currentStreak);
            if (wasNewBest && !settings.learningMode) roundNewBestStreakValue = currentStreak;
            streakBonus = computeStreakBonus(currentStreak);
            if (!settings.learningMode && streakBonus > prevBonus) {
                playStreakMilestoneSound(streakBonus);
            }
        }

        if (!settings.learningMode) {
            score += basePoints + bonus + streakBonus;
            roundBaseSum += basePoints;
            roundTimeBonusSum += bonus;
            roundStreakSum += streakBonus;
        }
        emojiDiv.innerHTML = "😀";
        solutionDiv.innerHTML = settings.learningMode
            ? (result.fuzzy ? "Richtig (kleiner Tippfehler toleriert)!" : "Richtig!")
            : (result.fuzzy ? "Richtig (kleiner Tippfehler toleriert)!" : "Richtig!");
        if (settings.learningMode) {
            pointsChips.innerHTML = "";
            showFloatingText("✓", currentAnswerAreaEl(), "positive");
        } else {
            let chips = '<span class="result-chip chip-base">⭐ +' + basePoints + '</span>';
            if (bonus > 0) chips += '<span class="result-chip chip-time">⏱️ +' + bonus + '</span>';
            if (streakBonus > 0) chips += '<span class="result-chip chip-streak">🔥 +' + streakBonus + ' (' + currentStreak + 'er Serie)</span>';
            pointsChips.innerHTML = chips;
            showFloatingText("+" + (basePoints + bonus + streakBonus), currentAnswerAreaEl(), "positive");
        }
        playCorrectSound();
    } else {
        wrongAnswers.push({ name: c.name, given: userInput || "(keine Antwort)" });
        currentStreak = 0; // Falsche Antwort unterbricht die Siegesserie
        emojiDiv.innerHTML = "😢";
        solutionDiv.innerHTML = "Richtig wäre: " + c.name;
        pointsChips.innerHTML = "";
        showFloatingText("✗", currentAnswerAreaEl(), "negative");
        playWrongSound();
    }

    scoreDiv.innerHTML = "Punkte: " + score;
    nextBtn.style.display = "inline-block";
    document.getElementById("resultCard").classList.add("visible");

    saveActiveStandardRound(true);
}

solveBtn.onclick = function () {
    submitAnswer(answer.value.trim());
};

answer.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && solveBtn.style.display !== "none") {
        e.preventDefault();
        solveBtn.click();
    }
});

// ---------- Nächste Flagge / Rundenende ----------

nextBtn.onclick = function () {
    index++;
    if (index >= maxFlags) {
        showEndScreen();
        return;
    }
    loadFlag();
};

// Prüft, ob ein Name bereits unter einer ANDEREN Geräte-ID in der (gecachten) Bestenliste steht.
// Nutzt bevorzugt den Cache, damit weder beim Verlassen des Namensfelds noch beim Start
// spürbare Wartezeit entsteht. Im Gruppenquiz wird gar nicht erst geprüft (keine globale Bestenliste).
async function checkNameCollision(name) {
    if (isGroupPlayer) return null;
    const rawName = (name !== undefined ? name : nicknameInput.value).trim();
    if (!rawName) return null;
    const key = highscoreKey();
    const { list } = await fetchTopListCached(key);
    const deviceId = getDeviceId();
    return list.find(e =>
        normalize(e.name || "") === normalize(rawName) && e.deviceId && e.deviceId !== deviceId
    ) || null;
}

function highscoreKey(s) {
    s = s || settings;
    const continentPart = s.continents.length === continents.length
        ? "all"
        : [...s.continents].sort().join("+");
    const proPart = s.proMode ? "proAn" : "proAus";
    const speedPart = s.speedMode ? "speedAn" : "speedAus";
    return "flagquiz_highscore_" + continentPart + "_" + s.length + "_" + s.mode + "_" + proPart + "_" + speedPart;
}

// ---------- Rundenende: Punkte-Aufschlüsselung & Rekord-Badges (Punkte 5, 22-Konzept) ----------
function buildScoreBreakdownHtml() {
    const parts = ["⭐ " + roundBaseSum];
    if (roundTimeBonusSum > 0) parts.push("⏱️ " + roundTimeBonusSum);
    if (roundStreakSum > 0) parts.push("🔥 " + roundStreakSum);
    return parts.join(" &nbsp;·&nbsp; ");
}

function renderRecordBadges(prestigeLevel) {
    const container = document.getElementById("recordBadges");
    if (!container) return;
    let html = "";
    if (prestigeLevel) {
        html += '<div class="record-badge badge-prestige">💎 Neues Prestige erreicht! (jetzt ' + prestigeLevel + '× ' + score + ' Punkte)</div>';
    }
    if (roundNewBestStreakValue) {
        html += '<div class="record-badge badge-streak">🔥 Neue persönliche Bestserie: ' + roundNewBestStreakValue + ' in Folge!</div>';
    }
    container.innerHTML = html;
}

async function showEndScreen() {
    clearActiveStandardRound();
    game.style.display = "none";
    setChromeVisible(true);
    setNicknameCardVisible(false);
    endScreen.style.display = "block";
    stopGroupHighscoreLive();
    groupHighscoreBox.style.display = "none";
    groupHighscoreBox.innerHTML = "";
    document.getElementById("recordBadges").innerHTML = "";

    if (settings.learningMode) {
        finalScoreLine.innerHTML = "🎓 Lernrunde abgeschlossen!";
        scoreBreakdownLine.innerHTML = "";
        highscoreLine.innerHTML = "Im Lernmodus werden keine Punkte gezählt und kein Highscore-Eintrag gespeichert — nur zum Üben.";
    } else if (isGroupPlayer) {
        // Im Gruppenmodus zählt nur die Gruppen-Bestenliste weiter unten — die globale
        // Bestenliste wird hier bewusst weder abgerufen noch angezeigt, um nicht zu verwirren.
        finalScoreLine.innerHTML = "Du hast " + score + " Punkte erreicht!";
        scoreBreakdownLine.innerHTML = buildScoreBreakdownHtml();
        highscoreLine.innerHTML = "🚩 Deine Punkte fließen in die Gruppen-Bestenliste weiter unten ein.";
        renderRecordBadges(null);
    } else {
        finalScoreLine.innerHTML = "Du hast " + score + " Punkte erreicht!";
        scoreBreakdownLine.innerHTML = buildScoreBreakdownHtml();
        highscoreLine.innerHTML = "Bestenliste wird aktualisiert …";

        const rawName = nicknameInput.value.trim();
        const playerName = (!rawName || containsBlockedContent(rawName)) ? generateFantasyName() : rawName;
        const deviceId = getDeviceId();
        const key = highscoreKey();
        const { list: currentList } = await fetchTopList(key);
        let list = currentList.slice();

        // Bestehenden Eintrag zuerst über die Geräte-ID suchen, sonst über den Namen (Fallback)
        let existingIdx = list.findIndex(e => e.deviceId === deviceId);
        if (existingIdx === -1) {
            existingIdx = list.findIndex(e => normalize(e.name || "") === normalize(playerName));
        }

        let didUpdate = false;
        let prestigeLeveledUp = null; // gesetzte Zahl, falls in dieser Runde ein neues Prestige-Level erreicht wurde
        let isFreshEntryOrImprovement = true;
        if (existingIdx !== -1) {
            const existing = list[existingIdx];
            if (score > existing.score) {
                // Neuer, höherer Bestwert -> Prestige beginnt wieder bei 0
                list.splice(existingIdx, 1);
                list.push({ name: playerName, score: score, deviceId: deviceId, prestige: 0 });
                didUpdate = true;
            } else if (score === existing.score) {
                // Exakt gleiche Punktzahl erneut erreicht -> Prestige zählt hoch (2. Erreichen = 1 💎, usw.)
                const newPrestige = (existing.prestige || 0) + 1;
                list[existingIdx] = { name: playerName, score: existing.score, deviceId: deviceId, prestige: newPrestige };
                prestigeLeveledUp = newPrestige;
                didUpdate = true;
                isFreshEntryOrImprovement = false;
            }
            // score < existing.score: bestehender, besserer Eintrag bleibt unverändert stehen
        } else {
            list.push({ name: playerName, score: score, deviceId: deviceId, prestige: 0 });
            didUpdate = true;
        }

        // Bei Punktegleichstand entscheidet höheres Prestige über die Reihenfolge (Punkt 3)
        list.sort((a, b) => b.score - a.score || (b.prestige || 0) - (a.prestige || 0));
        list = list.slice(0, 50);
        const rank = list.findIndex(e => e.deviceId === deviceId);

        let savedOnline = true;
        if (didUpdate && rank !== -1) {
            savedOnline = await saveTopList(key, list);
            setHighscoreCache(key, list, savedOnline);
        }
        const onlineNote = savedOnline ? "" : " (nur lokal gespeichert, keine Verbindung zur zentralen Liste)";

        if (rank === -1) {
            highscoreLine.innerHTML = "Kein Platz in den Top 50." + onlineNote;
        } else if (!didUpdate) {
            const medal = rank === 0 ? "🥇 " : rank === 1 ? "🥈 " : rank === 2 ? "🥉 " : "";
            highscoreLine.innerHTML = medal + "Dein bisheriger Bestwert (Platz " + (rank + 1) + ", " +
                list[rank].score + " Punkte) ist bereits mindestens genauso gut — Eintrag bleibt unverändert." + onlineNote;
        } else if (!isFreshEntryOrImprovement) {
            // Prestige-Fall: Punktzahl unverändert, aber erneut erreicht
            const medal = rank === 0 ? "🥇 " : rank === 1 ? "🥈 " : rank === 2 ? "🥉 " : "";
            highscoreLine.innerHTML = medal + "Platz " + (rank + 1) + " mit " + score + " Punkten erneut erreicht!" + onlineNote;
        } else if (rank === 0) {
            highscoreLine.innerHTML = '🥇 Neuer Highscore — Platz 1!<span id="newHighscoreBadge">Top!</span>' + onlineNote;
        } else if (rank === 1) {
            highscoreLine.innerHTML = "🥈 Stark! Platz 2 in der Bestenliste erreicht." + onlineNote;
        } else if (rank === 2) {
            highscoreLine.innerHTML = "🥉 Platz 3 in der Bestenliste erreicht!" + onlineNote;
        } else if (rank >= 3) {
            highscoreLine.innerHTML = "🏅 Platz " + (rank + 1) + " von " + list.length + " in der Bestenliste erreicht!" + onlineNote;
        } else {
            const last = list[list.length - 1];
            highscoreLine.innerHTML = (last
                ? "Knapp kein Platz in den Top 50 — Platz 50 liegt bei " + last.score + " Punkten."
                : "Kein Platz in den Top 50.") + onlineNote;
        }

        renderRecordBadges(prestigeLeveledUp);
    }

    // Gruppenquiz: eigenes Ergebnis einsenden und Live-Bestenliste der Gruppe anzeigen
    if (isGroupPlayer && !settings.learningMode) {
        const playerSession = getPlayerGroupSession();
        if (playerSession) {
            const rawGroupName = nicknameInput.value.trim();
            const groupPlayerName = (!rawGroupName || containsBlockedContent(rawGroupName)) ? generateFantasyName() : rawGroupName;
            await submitGroupResult(groupPlayerName, score);
            groupHighscoreBox.style.display = "block";
            startGroupHighscoreLive(groupHighscoreBox, playerSession.code, () => currentGroupRound);
        }
    }

    if (wrongAnswers.length === 0) {
        wrongListTitle.innerHTML = "Alles richtig — stark! 🎉";
        wrongListDiv.innerHTML = "";
    } else {
        wrongListTitle.innerHTML = "Zum Üben — diese Länder waren falsch:";
        wrongListDiv.innerHTML = wrongAnswers
            .map(w => `<div><strong>${w.name}</strong> — deine Antwort: ${w.given}</div>`)
            .join("");
    }
}

endBtn.onclick = function () {
    const sure = confirm("Möchtest du das Quiz wirklich beenden? Dein aktueller Fortschritt in dieser Runde geht verloren.");
    if (!sure) return;
    flagLoadToken++;
    stopTimeBonusBar();
    clearActiveStandardRound();
    backToModeMenu();
};

restartBtn.onclick = function () {
    backToModeMenu();
};

