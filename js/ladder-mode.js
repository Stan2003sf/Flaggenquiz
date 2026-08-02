// ================= Ladder-Modus =================

const LADDER_HIGHSCORE_KEY = "flagquiz_ladder_bestenliste"; // wiederverwendet die "highscores"-Collection

// Lokaler Cache des eigenen Gipfelsturm-Bestwerts/Tiers, damit die Statistik-Seite (renderStatsModal
// in js/group-quiz.js) den Wert sofort anzeigen kann, ohne auf den Firestore-Abruf zu warten.
const LADDER_OWN_BEST_CACHE_KEY = "flagquiz_ladder_own_best";

function getLadderOwnBestCache() {
    try {
        const raw = localStorage.getItem(LADDER_OWN_BEST_CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

function saveLadderOwnBestCache(reachedCount, won) {
    try {
        const prev = getLadderOwnBestCache();
        const merged = { best: Math.max(reachedCount, prev ? (prev.best || 0) : 0), crown: !!(won || (prev && prev.crown)) };
        localStorage.setItem(LADDER_OWN_BEST_CACHE_KEY, JSON.stringify(merged));
    } catch (e) { /* ignorieren */ }
}

const ladderStartBtn = document.getElementById("ladderStartBtn");
const ladderEndBtn = document.getElementById("ladderEndBtn");
const ladderRestartBtn = document.getElementById("ladderRestartBtn");
const ladderHeartsEl = document.getElementById("ladderHearts");
const ladderProgressLabelEl = document.getElementById("ladderProgressLabel");
const ladderProgressBarInnerEl = document.getElementById("ladderProgressBarInner");
const ladderFlagDiv = document.getElementById("ladderFlag");
const ladderFlagErrorEl = document.getElementById("ladderFlagError");
const ladderMcOptionsDiv = document.getElementById("ladderMcOptions");
const ladderEndContentEl = document.getElementById("ladderEndContent");
const ladderHighscoreDisplayEl = document.getElementById("ladderHighscoreDisplay");

let ladderOrder = [];
let ladderPos = 0;
let ladderLives = 5;
let ladderCorrectCount = 0;
let ladderMilestonesUsed = 0;
let ladderAnswering = false;
let ladderRoundActive = false;
let ladderLoadToken = 0;

// Nur für die Testphase (siehe Konzept): Rundenstart ab einem bestimmten Rang statt Rang 1,
// z. B. über die URL ?ladder_debug=190 — damit lässt sich Game-Over/Sieg schnell durchspielen.
// Bewusst auf localhost beschränkt (Code-Review-Befund): auf der echten, öffentlich erreichbaren
// Seite dürfte sonst jede beliebige Person per URL-Parameter nahe Platz 1 der Gipfelsturm-
// Bestenliste bzw. die Krone faken, ohne die Flaggen tatsächlich zu kennen.
function ladderDebugStartIndex(total) {
    try {
        if (location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return 0;
        const params = new URLSearchParams(location.search);
        const raw = params.get("ladder_debug");
        if (!raw) return 0;
        const rank = parseInt(raw, 10);
        if (!Number.isFinite(rank) || rank < 1 || rank > total) return 0;
        return rank - 1;
    } catch (e) { return 0; }
}

function playLadderHeartBreakSound() { playTone(220, 0.18, "sawtooth"); }
function playLadderGameOverSound() {
    playTone(200, 0.25, "sawtooth");
    setTimeout(() => playTone(140, 0.35, "sawtooth"), 180);
}
function playLadderVictorySound() {
    playTone(660, 0.18, "sine");
    setTimeout(() => playTone(880, 0.18, "sine"), 140);
    setTimeout(() => playTone(1100, 0.32, "sine"), 280);
}

function renderLadderHearts() {
    let html = "";
    for (let i = 0; i < 5; i++) {
        html += i < ladderLives ? '<span class="heart">❤️</span>' : '<span class="heart heart-lost">🤍</span>';
    }
    ladderHeartsEl.innerHTML = html;
}

// Distraktor-Pool: ±20 Ränge um die Frageflagge, an den Rändern einseitig erweitert (Konzept Punkt 2).
function pickLadderDistractors(posIndex, correctCountry) {
    const n = ladderOrder.length;
    const radius = 20;
    let lo = posIndex - radius;
    let hi = posIndex + radius;
    if (lo < 0) { hi += (-lo); lo = 0; }
    if (hi > n - 1) { lo -= (hi - (n - 1)); hi = n - 1; }
    lo = Math.max(0, lo);
    hi = Math.min(n - 1, hi);
    const pool = ladderOrder.slice(lo, hi + 1).filter(c => c.iso !== correctCountry.iso);
    return shuffle(pool).slice(0, 3);
}

// ---------- Reload-Wiederherstellung einer laufenden Gipfelsturm-Runde ----------
// Gipfelsturm hat keinen Zeitbonus/Timer, daher ist hier (anders als beim Entdecker-Modus) keine
// besondere Behandlung für Zeitmodifikationen nötig — es genügt, den diskreten Fortschritt
// (Position, Leben, Reihenfolge) zu sichern.
const LADDER_ACTIVE_ROUND_KEY = "flagquiz_active_round_ladder";

function saveActiveLadderRound() {
    try {
        localStorage.setItem(LADDER_ACTIVE_ROUND_KEY, JSON.stringify({
            savedAt: Date.now(),
            orderIsos: ladderOrder.map(c => c.iso),
            ladderPos: ladderPos,
            ladderLives: ladderLives,
            ladderCorrectCount: ladderCorrectCount,
            ladderMilestonesUsed: ladderMilestonesUsed
        }));
    } catch (e) { /* ignorieren */ }
}

function clearActiveLadderRound() {
    try { localStorage.removeItem(LADDER_ACTIVE_ROUND_KEY); } catch (e) { /* ignorieren */ }
}

function loadActiveLadderRoundData() {
    let raw;
    try { raw = localStorage.getItem(LADDER_ACTIVE_ROUND_KEY); } catch (e) { return null; }
    if (!raw) return null;
    let data;
    try { data = JSON.parse(raw); } catch (e) { return null; }
    if (!data || typeof data.savedAt !== "number" || Date.now() - data.savedAt > ACTIVE_ROUND_MAX_AGE_MS) {
        clearActiveLadderRound();
        return null;
    }
    return data;
}

// Wird beim Seitenstart aufgerufen (siehe init.js). Liefert true, wenn eine Runde wiederhergestellt
// und der Spielbildschirm bereits angezeigt wurde — sonst false.
function restoreActiveLadderRound() {
    const data = loadActiveLadderRoundData();
    if (!data || !Array.isArray(data.orderIsos) || data.orderIsos.length === 0) return false;

    const order = data.orderIsos.map(iso => countries.find(c => c.iso === iso));
    // Länderdaten inzwischen verändert oder Datensatz beschädigt -> lieber verwerfen als eine
    // kaputte Runde zu zeigen.
    if (order.some(c => !c) || data.ladderPos < 0 || data.ladderPos >= order.length || data.ladderLives <= 0) {
        clearActiveLadderRound();
        return false;
    }

    ladderOrder = order;
    ladderPos = data.ladderPos;
    ladderLives = data.ladderLives;
    ladderCorrectCount = data.ladderCorrectCount;
    ladderMilestonesUsed = data.ladderMilestonesUsed;
    ladderAnswering = false;
    ladderRoundActive = true;
    renderLadderHearts();

    hideAllScreens();
    setChromeVisible(false);
    document.getElementById("ladderGame").style.display = "block";
    loadLadderFlag();
    return true;
}

function loadLadderFlag() {
    ladderAnswering = false;
    ladderLoadToken++;
    const myToken = ladderLoadToken;
    const c = ladderOrder[ladderPos];
    saveActiveLadderRound();

    ladderProgressLabelEl.textContent = t("ladder.flagOf").replace("{a}", ladderPos + 1).replace("{b}", ladderOrder.length);
    ladderProgressBarInnerEl.style.width = (ladderPos / ladderOrder.length * 100) + "%";

    const flagUrl = flagImageUrl(c.iso);
    ladderFlagErrorEl.style.display = "none";
    ladderFlagErrorEl.textContent = "";
    ladderFlagDiv.style.backgroundImage = "url('" + flagUrl + "')";
    const testImg = new Image();
    testImg.onerror = function () {
        if (myToken !== ladderLoadToken) return;
        ladderFlagErrorEl.textContent = t("common.flagLoadError");
        ladderFlagErrorEl.style.display = "flex";
    };
    testImg.src = flagUrl;

    const options = shuffle([c, ...pickLadderDistractors(ladderPos, c)]);
    ladderMcOptionsDiv.innerHTML = "";
    options.forEach(opt => {
        const btn = document.createElement("button");
        btn.className = "mc-btn";
        btn.textContent = quizCountryNameByIso(opt.iso);
        btn.dataset.iso = opt.iso;
        btn.onclick = () => submitLadderAnswer(opt.iso, c);
        ladderMcOptionsDiv.appendChild(btn);
    });
}

// Gipfelsturm-Tier-System: Abzeichen neben dem Namen (app-weit, überall wo bisher nur die Krone
// erschien), zeigt den je erreichten Bestwert. Ersetzt sich gegenseitig, die Krone (bei 197/197,
// siehe `crown`-Feld) bleibt die höchste Stufe und wird hier NICHT mit einberechnet.
const LADDER_TIER_ICONS = ["🧢", "🎓", "🎩"]; // Index 0 = ab 50, 1 = ab 100, 2 = ab 150
function ladderTierLabel(icon) {
    if (icon === "🧢") return t("ladder.tierCap");
    if (icon === "🎓") return t("ladder.tierGrad");
    if (icon === "🎩") return t("ladder.tierTopHat");
    if (icon === "👑") return t("ladder.tierCrown");
    return "";
}

// Liefert das Abzeichen für einen Bestenlisten-Eintrag ({ best, crown }) — Krone hat Vorrang.
function ladderTierIconFor(entry) {
    if (!entry) return "";
    if (entry.crown) return "👑";
    const best = entry.best || 0;
    if (best >= 150) return "🎩";
    if (best >= 100) return "🎓";
    if (best >= 50) return "🧢";
    return "";
}

// Alle 50 korrekt beantwortete Flaggen (50/100/150) +1 Leben, gedeckelt auf 5 (Konzept Punkt 2).
// Liefert bei Erreichen einer neuen Stufe deren Icon zurück (für den Zwischenbildschirm), sonst null.
function maybeRefillLadderLife() {
    const milestonesPossible = Math.floor(ladderCorrectCount / 50);
    if (milestonesPossible > ladderMilestonesUsed && milestonesPossible <= 3) {
        ladderMilestonesUsed = milestonesPossible;
        if (ladderLives < 5) {
            ladderLives++;
            renderLadderHearts();
        }
        return LADDER_TIER_ICONS[milestonesPossible - 1];
    }
    return null;
}

// Zwischenbildschirm bei Leben-Auffüllung/Tier-Aufstieg (50/100/150) — ähnlich dem Rundenende-
// Bildschirm, aber das Spiel geht danach weiter (kein Rundenabbruch, keine Bestenlisten-Meldung).
function showLadderMilestoneScreen(icon, onContinue) {
    hideAllScreens();
    setChromeVisible(false);
    const label = ladderTierLabel(icon);
    document.getElementById("ladderMilestoneContent").innerHTML =
        '<div class="ladder-end-emoji">' + icon + '</div>' +
        '<h2>' + t("ladder.milestoneTitle") + '</h2>' +
        '<p>' + t("ladder.milestoneBadgeEarned") + ' ' + icon + ' ' + label + '</p>';
    document.getElementById("ladderMilestoneScreen").style.display = "block";
    document.getElementById("ladderMilestoneContinueBtn").onclick = function () {
        document.getElementById("ladderMilestoneScreen").style.display = "none";
        if (!ladderRoundActive) return;
        setChromeVisible(false);
        document.getElementById("ladderGame").style.display = "block";
        onContinue();
    };
}

function submitLadderAnswer(selectedIso, correctCountry) {
    if (!ladderRoundActive || ladderAnswering) return;
    ladderAnswering = true;
    const wasCorrect = selectedIso === correctCountry.iso;

    Array.from(ladderMcOptionsDiv.querySelectorAll(".mc-btn")).forEach(btn => {
        btn.disabled = true;
        if (btn.dataset.iso === correctCountry.iso) btn.classList.add("correct");
        else if (btn.dataset.iso === selectedIso && !wasCorrect) btn.classList.add("wrong");
    });

    incrementFlagStat(correctCountry.iso, wasCorrect); // globale Flaggen-Statistik weiter mitschreiben

    if (wasCorrect) {
        ladderCorrectCount++;
        showFloatingText("✓", ladderMcOptionsDiv, "positive");
        playCorrectSound();
        const newTierIcon = maybeRefillLadderLife();
        setTimeout(() => {
            if (!ladderRoundActive) return;
            if (newTierIcon) {
                showLadderMilestoneScreen(newTierIcon, () => advanceLadder());
            } else {
                advanceLadder();
            }
        }, 700);
    } else {
        playWrongSound();
        setTimeout(() => {
            if (!ladderRoundActive) return;
            const hearts = Array.from(ladderHeartsEl.querySelectorAll(".heart"));
            const target = hearts[ladderLives - 1];
            if (target) target.classList.add("heart-breaking");
            showFloatingText(t("ladder.minusOneLife"), ladderHeartsEl, "negative");
            playLadderHeartBreakSound();
            setTimeout(() => {
                if (!ladderRoundActive) return;
                ladderLives--;
                renderLadderHearts();
                if (ladderLives <= 0) {
                    endLadderRound(false);
                } else {
                    advanceLadder();
                }
            }, 480);
        }, 500);
    }
}

function advanceLadder() {
    ladderPos++;
    if (ladderPos >= ladderOrder.length) {
        endLadderRound(true);
    } else {
        loadLadderFlag();
    }
}

function spawnLadderConfetti() {
    const pieces = ["🎉", "🎊", "✨", "👑", "⭐"];
    for (let i = 0; i < 18; i++) {
        const span = document.createElement("span");
        span.className = "ladder-confetti-piece";
        span.textContent = pieces[Math.floor(Math.random() * pieces.length)];
        span.style.left = Math.random() * 100 + "%";
        span.style.animationDelay = (Math.random() * 0.4) + "s";
        ladderEndContentEl.style.position = "relative";
        ladderEndContentEl.appendChild(span);
        setTimeout(() => span.remove(), 2000);
    }
}

// Speichert das Ergebnis in der Ladder-Bestenliste (nur persönlicher Bestwert, siehe Konzept).
// Wiederverwendet bewusst fetchTopList/saveTopList (dieselbe "highscores"-Collection).
async function saveLadderResult(playerName, reachedCount, won) {
    const deviceId = getDeviceId();
    const { list: currentList } = await fetchTopList(LADDER_HIGHSCORE_KEY);
    let list = currentList.slice();
    let existingIdx = list.findIndex(e => e.deviceId === deviceId);
    let didUpdate = false;

    if (existingIdx !== -1) {
        const existing = list[existingIdx];
        if (reachedCount > (existing.best || 0)) {
            list[existingIdx] = { name: playerName, deviceId: deviceId, best: reachedCount, achievedAt: Date.now(), crown: won || !!existing.crown };
            didUpdate = true;
        } else if (won && !existing.crown) {
            list[existingIdx] = Object.assign({}, existing, { name: playerName, crown: true });
            didUpdate = true;
        } else if (existing.name !== playerName) {
            list[existingIdx] = Object.assign({}, existing, { name: playerName });
            didUpdate = true;
        }
    } else {
        list.push({ name: playerName, deviceId: deviceId, best: reachedCount, achievedAt: Date.now(), crown: won });
        didUpdate = true;
    }

    // Bei Punktegleichstand steht der Spieler, der den Stand zuerst erreicht hat, weiter oben.
    list.sort((a, b) => (b.best - a.best) || ((a.achievedAt || 0) - (b.achievedAt || 0)));
    list = list.slice(0, 50);
    const rank = list.findIndex(e => e.deviceId === deviceId);

    let savedOnline = true;
    if (didUpdate) {
        savedOnline = await saveTopList(LADDER_HIGHSCORE_KEY, list);
        setHighscoreCache(LADDER_HIGHSCORE_KEY, list, savedOnline);
    }
    return { rank: rank, savedOnline: savedOnline };
}

function buildLadderResultLine(result, total) {
    const onlineNote = result.savedOnline ? "" : t("common.localOnlyNote");
    if (result.rank === -1) {
        return '<p>' + t("ladder.noRankInTop50") + onlineNote + '</p>';
    }
    const medal = result.rank === 0 ? "🥇 " : result.rank === 1 ? "🥈 " : result.rank === 2 ? "🥉 " : "";
    return '<p>' + medal + t("ladder.rankLine").replace("{rank}", result.rank + 1).replace("{total}", total) + '</p>';
}

async function endLadderRound(won) {
    ladderRoundActive = false;
    clearActiveLadderRound();
    hideAllScreens();
    setChromeVisible(true);
    setNicknameCardVisible(false);
    document.getElementById("ladderEndScreen").style.display = "block";

    const reachedCount = won ? ladderOrder.length : ladderPos;
    saveLadderOwnBestCache(reachedCount, won);
    if (won) playLadderVictorySound(); else playLadderGameOverSound();

    let html = won
        ? '<div class="ladder-end-emoji">👑</div><h2>' + t("ladder.wonTitle") + '</h2><p>' + t("ladder.wonSub").replace("{n}", ladderOrder.length) + '</p>'
        : '<div class="ladder-end-emoji">💔</div><h2>' + t("ladder.lostTitle") + '</h2><p>' + t("ladder.lostSub").replace("{reached}", reachedCount).replace("{total}", ladderOrder.length) + '</p>';
    ladderEndContentEl.innerHTML = html;

    const rawName = nicknameInput.value.trim();
    const playerName = (!rawName || containsBlockedContent(rawName)) ? generateFantasyName() : rawName;
    const result = await saveLadderResult(playerName, reachedCount, won);
    ladderEndContentEl.innerHTML += buildLadderResultLine(result, ladderOrder.length);
    refreshCrownStatus(); // Tier-Abzeichen ggf. gerade neu erhalten -> Ebene-0-Anzeige sofort aktualisieren

    if (won) spawnLadderConfetti();

    // Nach saveLadderOwnBestCache aufrufen: die Gipfelsturm-Meilensteine lesen genau diesen
    // Bestwert (siehe computeAchievementStatus in js/achievements.js).
    checkForNewAchievements();
}

async function updateLadderHighscoreDisplay(targetEl) {
    const el = targetEl || ladderHighscoreDisplayEl;
    el.innerHTML = '<div class="highscore-card hs-empty"><span class="trophy">🏆</span><div>' + t("common.loading") + '</div></div>';
    const { list, online } = await fetchTopListCached(LADDER_HIGHSCORE_KEY);
    const titleTexts = await getPlayerTitleDeviceIdMap();
    const statusLine = online
        ? '<span title="' + t("common.onlineTitle") + '">' + t("common.online") + '</span>'
        : '<span title="' + t("common.offlineTitle") + '">' + t("common.offline") + '</span>';

    if (list.length === 0) {
        el.innerHTML =
            '<div class="highscore-card hs-empty"><span class="trophy">🏆</span>' +
            '<div class="hs-card-title" style="margin-bottom:4px;">' + t("ladder.noResultsYet") + '</div>' +
            '<div>' + t("common.beTheFirst") + '</div><div class="hs-status">' + statusLine + '</div></div>';
        return;
    }
    const medals = ["🥇", "🥈", "🥉"];
    let lastBest = null, lastRank = 0;
    const rowsHtml = list.slice(0, 50).map((entry, i) => {
        const rank = (entry.best === lastBest) ? lastRank : (i + 1);
        lastBest = entry.best; lastRank = rank;
        const tierIcon = ladderTierIconFor(entry);
        const titleText = titleTexts.get(entry.deviceId);
        const nameHtml = nameWithTitleHtml(entry.name || t("common.anonymous"), tierIcon, titleText);
        return '<div class="hs-row rank-' + rank + '">' +
            '<div class="hs-medal">' + (rank <= 3 ? medals[rank - 1] : rank + ".") + '</div>' +
            '<div class="hs-row-name">' + nameHtml + '</div>' +
            '<div class="hs-row-score">' + entry.best + ' / 197</div></div>';
    }).join("");
    el.innerHTML =
        '<div class="highscore-card"><div class="hs-row-list">' + rowsHtml + '</div><div class="hs-status">' + statusLine + '</div></div>';
}

// Tier-Abzeichen (🧢/🎓/🎩/👑): einmal in einer Gipfelsturm-Runde erreicht, wird das jeweils
// höchste Abzeichen fortan neben dem Namen in JEDER Bestenliste angezeigt (Konzept Punkt 2,
// Schlussbildschirm "Gewonnen"). Über deviceId abgeglichen, Map deviceId -> Icon.
async function getLadderTierDeviceIdMap() {
    const { list } = await fetchTopListCached(LADDER_HIGHSCORE_KEY);
    const map = new Map();
    list.forEach(entry => {
        const icon = ladderTierIconFor(entry);
        if (icon) map.set(entry.deviceId, icon);
    });
    return map;
}

async function startLadderRound() {
    ladderStartBtn.disabled = true;
    ladderStartBtn.textContent = t("common.loadingShort");
    try {
        const { stats } = await fetchFlagStats();
        ladderOrder = computeLadderOrder(stats);
        ladderPos = ladderDebugStartIndex(ladderOrder.length);
        ladderLives = 5;
        ladderCorrectCount = 0;
        ladderMilestonesUsed = 0;
        ladderAnswering = false;
        ladderRoundActive = true;
        renderLadderHearts();

        hideAllScreens();
        setChromeVisible(false);
        document.getElementById("ladderGame").style.display = "block";
        loadLadderFlag();
    } finally {
        ladderStartBtn.disabled = false;
        ladderStartBtn.textContent = t("ladderPlaceholder.start");
    }
}

ladderStartBtn.onclick = startLadderRound;

ladderEndBtn.onclick = function () {
    const sure = confirm(t("ladder.confirmEnd"));
    if (!sure) return;
    ladderRoundActive = false;
    ladderLoadToken++;
    clearActiveLadderRound();
    goToLadderPlaceholder();
};

ladderRestartBtn.onclick = function () {
    goToLadderPlaceholder();
};

