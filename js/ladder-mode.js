// ================= Ladder-Modus =================

const LADDER_HIGHSCORE_KEY = "flagquiz_ladder_bestenliste"; // wiederverwendet die "highscores"-Collection

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
function ladderDebugStartIndex(total) {
    try {
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

function loadLadderFlag() {
    ladderAnswering = false;
    ladderLoadToken++;
    const myToken = ladderLoadToken;
    const c = ladderOrder[ladderPos];

    ladderProgressLabelEl.textContent = "Flagge " + (ladderPos + 1) + " von " + ladderOrder.length;
    ladderProgressBarInnerEl.style.width = (ladderPos / ladderOrder.length * 100) + "%";

    const flagUrl = "https://flagcdn.com/w320/" + c.iso + ".png";
    ladderFlagErrorEl.style.display = "none";
    ladderFlagErrorEl.textContent = "";
    ladderFlagDiv.style.backgroundImage = "url('" + flagUrl + "')";
    const testImg = new Image();
    testImg.onerror = function () {
        if (myToken !== ladderLoadToken) return;
        ladderFlagErrorEl.textContent = "Flagge konnte nicht geladen werden — bitte Internetverbindung prüfen";
        ladderFlagErrorEl.style.display = "flex";
    };
    testImg.src = flagUrl;

    const options = shuffle([c, ...pickLadderDistractors(ladderPos, c)]);
    ladderMcOptionsDiv.innerHTML = "";
    options.forEach(opt => {
        const btn = document.createElement("button");
        btn.className = "mc-btn";
        btn.textContent = opt.name;
        btn.dataset.iso = opt.iso;
        btn.onclick = () => submitLadderAnswer(opt.iso, c);
        ladderMcOptionsDiv.appendChild(btn);
    });
}

// Alle 50 korrekt beantwortete Flaggen (50/100/150) +1 Leben, gedeckelt auf 5 (Konzept Punkt 2).
function maybeRefillLadderLife() {
    const milestonesPossible = Math.floor(ladderCorrectCount / 50);
    if (milestonesPossible > ladderMilestonesUsed && milestonesPossible <= 3) {
        ladderMilestonesUsed = milestonesPossible;
        if (ladderLives < 5) {
            ladderLives++;
            renderLadderHearts();
        }
    }
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
        playCorrectSound();
        maybeRefillLadderLife();
        setTimeout(() => {
            if (!ladderRoundActive) return;
            advanceLadder();
        }, 700);
    } else {
        playWrongSound();
        setTimeout(() => {
            if (!ladderRoundActive) return;
            const hearts = Array.from(ladderHeartsEl.querySelectorAll(".heart"));
            const target = hearts[ladderLives - 1];
            if (target) target.classList.add("heart-breaking");
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
    const onlineNote = result.savedOnline ? "" : " (nur lokal gespeichert, keine Verbindung zur zentralen Liste)";
    if (result.rank === -1) {
        return '<p>Kein Platz in den Top 50 der Ladder-Bestenliste.' + onlineNote + '</p>';
    }
    const medal = result.rank === 0 ? "🥇 " : result.rank === 1 ? "🥈 " : result.rank === 2 ? "🥉 " : "";
    return '<p>' + medal + 'Platz ' + (result.rank + 1) + ' in der Ladder-Bestenliste (von ' + total + ').</p>';
}

async function endLadderRound(won) {
    ladderRoundActive = false;
    hideAllScreens();
    setChromeVisible(true);
    document.getElementById("ladderEndScreen").style.display = "block";

    const reachedCount = won ? ladderOrder.length : ladderPos;
    if (won) playLadderVictorySound(); else playLadderGameOverSound();

    let html = won
        ? '<div class="ladder-end-emoji">👑</div><h2>Geschafft — du trägst jetzt die Krone!</h2><p>Alle ' + ladderOrder.length + ' Flaggen durchlaufen. 👑</p>'
        : '<div class="ladder-end-emoji">💔</div><h2>Runde beendet</h2><p>' + reachedCount + ' von ' + ladderOrder.length + ' Flaggen geschafft.</p>';
    ladderEndContentEl.innerHTML = html;

    const rawName = nicknameInput.value.trim();
    const playerName = (!rawName || containsBlockedContent(rawName)) ? generateFantasyName() : rawName;
    const result = await saveLadderResult(playerName, reachedCount, won);
    ladderEndContentEl.innerHTML += buildLadderResultLine(result, ladderOrder.length);

    if (won) spawnLadderConfetti();
}

async function updateLadderHighscoreDisplay() {
    ladderHighscoreDisplayEl.innerHTML = '<div class="highscore-card hs-empty"><span class="trophy">🏆</span><div>Bestenliste wird geladen …</div></div>';
    const { list, online } = await fetchTopListCached(LADDER_HIGHSCORE_KEY);
    const statusLine = online
        ? '<span title="Zentrale, geteilte Bestenliste">🌐 zentrale Bestenliste</span>'
        : '<span title="Keine Verbindung zur zentralen Bestenliste — zeigt deinen lokalen Stand">📴 offline (nur lokal)</span>';

    if (list.length === 0) {
        ladderHighscoreDisplayEl.innerHTML =
            '<div class="highscore-card hs-empty"><span class="trophy">🏆</span>' +
            '<div class="hs-card-title" style="margin-bottom:4px;">Noch kein Ladder-Ergebnis</div>' +
            '<div>Sei der Erste!</div><div class="hs-status">' + statusLine + '</div></div>';
        return;
    }
    const medals = ["🥇", "🥈", "🥉"];
    let lastBest = null, lastRank = 0;
    const rowsHtml = list.slice(0, 50).map((entry, i) => {
        const rank = (entry.best === lastBest) ? lastRank : (i + 1);
        lastBest = entry.best; lastRank = rank;
        const crown = entry.crown ? '👑 ' : '';
        return '<div class="hs-row rank-' + rank + '">' +
            '<div class="hs-medal">' + (rank <= 3 ? medals[rank - 1] : rank + ".") + '</div>' +
            '<div class="hs-row-name">' + crown + escapeHtml(entry.name || "Anonym") + '</div>' +
            '<div class="hs-row-score">' + entry.best + ' / 195</div></div>';
    }).join("");
    ladderHighscoreDisplayEl.innerHTML =
        '<div class="highscore-card"><div class="hs-row-list">' + rowsHtml + '</div><div class="hs-status">' + statusLine + '</div></div>';
}

// Krone: einmal in der Ladder-Bestenliste gewonnen, wird sie fortan neben dem Namen in JEDER
// Bestenliste angezeigt (Konzept Punkt 2, Schlussbildschirm "Gewonnen"). Über deviceId abgeglichen.
async function getCrownedDeviceIdSet() {
    const { list } = await fetchTopListCached(LADDER_HIGHSCORE_KEY);
    return new Set(list.filter(e => e.crown).map(e => e.deviceId));
}

async function startLadderRound() {
    ladderStartBtn.disabled = true;
    ladderStartBtn.textContent = "Wird geladen …";
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
        ladderStartBtn.textContent = "🚀 Start";
    }
}

ladderStartBtn.onclick = startLadderRound;

ladderEndBtn.onclick = function () {
    const sure = confirm("Möchtest du den Ladder-Modus wirklich beenden? Dein Fortschritt in dieser Runde geht verloren.");
    if (!sure) return;
    ladderRoundActive = false;
    ladderLoadToken++;
    goToSinglePlayerMenu();
};

ladderRestartBtn.onclick = function () {
    goToSinglePlayerMenu();
};

