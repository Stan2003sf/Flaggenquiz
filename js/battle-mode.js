// ================= 1vs1 Battle-Modus =================

const BATTLE_SESSION_KEY = "flagquiz_battle_session"; // { code, role: "A"|"B" }
const BATTLE_HIGHSCORE_KEY = "flagquiz_battle_bestenliste";
const BATTLE_EXPIRY_HOURS = 3;
const BATTLE_MAX_LIVES = 5; // Schritt 5: 5 statt 3 Leben pro Spieler:in

function getBattleSession() {
    try { const raw = localStorage.getItem(BATTLE_SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function saveBattleSession(session) { try { localStorage.setItem(BATTLE_SESSION_KEY, JSON.stringify(session)); } catch (e) { /* ignorieren */ } }
function clearBattleSession() { try { localStorage.removeItem(BATTLE_SESSION_KEY); } catch (e) { /* ignorieren */ } }

// ---------- Battle: Aufräumen abgelaufener Battles ----------
// Analog zu cleanupExpiredGroups() in js/group-quiz.js, aber einfacher: Battle-Dokumente haben
// keine Unterkollektionen (alle Rundendaten liegen flach im Dokument selbst), daher reicht ein
// einzelnes delete() pro abgelaufenem Battle.
async function cleanupExpiredBattles() {
    if (!firestoreDb) return;
    try {
        const now = firebase.firestore.Timestamp.now();
        const snap = await firestoreDb.collection("battles").where("expiresAt", "<", now).limit(10).get();
        for (const doc of snap.docs) {
            try { await doc.ref.delete(); } catch (e) { /* evtl. schon gelöscht o. ä., ignorieren */ }
        }
    } catch (e) { console.warn("Aufräumen alter Battles fehlgeschlagen (nicht kritisch).", e); }
}

// ---------- Battle: Erstellen & Beitreten ----------

async function createBattle() {
    if (!firestoreDb) return null;
    cleanupExpiredBattles(); // nebenbei, nicht abwarten
    const deviceId = getDeviceId();
    const rawName = nicknameInput.value.trim();
    const playerName = (!rawName || containsBlockedContent(rawName)) ? generateFantasyName() : rawName;
    const threeContinents = shuffle(continents).slice(0, 3);
    const expiresAt = firebase.firestore.Timestamp.fromMillis(Date.now() + BATTLE_EXPIRY_HOURS * 3600 * 1000);
    let code, ref, exists = true, attempts = 0;
    do {
        code = generateGroupCode();
        ref = firestoreDb.collection("battles").doc(code);
        const snap = await ref.get();
        exists = snap.exists;
        attempts++;
    } while (exists && attempts < 5);

    try {
        await ref.set({
            createdAt: firebase.firestore.Timestamp.now(),
            expiresAt: expiresAt,
            status: "warten_spielerB",
            continents3: threeContinents,
            playerA: { deviceId: deviceId, name: playerName },
            playerB: null,
            continentChoiceA: null, continentChoiceB: null,
            pool: null,
            poisonChoiceA: null, poisonChoiceB: null,
            sequenceA: null, sequenceB: null,
            lastSeenA: Date.now(), lastSeenB: null,
            suddenDeathSequence: null,
            livesA: BATTLE_MAX_LIVES, livesB: BATTLE_MAX_LIVES,
            currentRound: 0,
            rounds: {},
            winner: null
        });
    } catch (e) {
        console.warn("Battle konnte nicht erstellt werden.", e);
        return null;
    }
    saveBattleSession({ code: code, role: "A" });
    return code;
}

async function joinBattleByCode(rawCode) {
    if (!firestoreDb) return { ok: false, reason: "offline" };
    const code = (rawCode || "").trim().toUpperCase();
    if (code.length !== 5) return { ok: false, reason: "format" };
    const ref = firestoreDb.collection("battles").doc(code);
    const rawName = nicknameInput.value.trim();
    const playerName = (!rawName || containsBlockedContent(rawName)) ? generateFantasyName() : rawName;
    const deviceId = getDeviceId();
    let joined = false;
    try {
        await firestoreDb.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists) return;
            const data = snap.data();
            const expMs = (data.expiresAt && data.expiresAt.toMillis) ? data.expiresAt.toMillis() : 0;
            if (expMs && expMs < Date.now()) return;
            if (data.playerA && data.playerA.deviceId === deviceId) return; // eigenes Battle, kann nicht selbst beitreten
            if (data.playerB && data.playerB.deviceId && data.playerB.deviceId !== deviceId) return; // schon vergeben
            tx.update(ref, { playerB: { deviceId: deviceId, name: playerName }, status: "kontinentwahl", lastSeenB: Date.now() });
            joined = true;
        });
    } catch (e) {
        console.warn("Battle-Beitritt fehlgeschlagen.", e);
        return { ok: false, reason: "error" };
    }
    if (!joined) return { ok: false, reason: "notfound" };
    saveBattleSession({ code: code, role: "B" });
    return { ok: true, code: code };
}

// ---------- Battle: Kontinent-Pool auflösen (Konzept Punkt 2) ----------

async function submitBattleContinents(code, role, chosen) {
    const ref = firestoreDb.collection("battles").doc(code);
    const field = role === "A" ? "continentChoiceA" : "continentChoiceB";
    try { await ref.update({ [field]: chosen }); } catch (e) { console.warn("Kontinent-Wahl konnte nicht gesendet werden.", e); }
}

async function tryResolveBattlePool(code) {
    const ref = firestoreDb.collection("battles").doc(code);
    try {
        await firestoreDb.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const data = snap.data();
            if (!data || data.pool || !data.continentChoiceA || !data.continentChoiceB) return;
            const a = data.continentChoiceA, b = data.continentChoiceB;
            const overlap = a.filter(c => b.includes(c));
            let pool;
            if (overlap.length === 1) pool = [overlap[0]];
            else if (overlap.length >= 2) pool = a.slice(0, 2);
            else pool = Array.from(new Set([...a, ...b])); // sollte laut Konzept mathematisch nie vorkommen
            tx.update(ref, { pool: pool, status: "giftwahl" });
        });
    } catch (e) { console.warn("Kontinent-Pool konnte nicht aufgelöst werden.", e); }
}

// ---------- Battle: Fallen-Flaggen & Rundenaufbau (Konzept Punkte 3-4) ----------

async function submitBattlePoison(code, role, isos) {
    const ref = firestoreDb.collection("battles").doc(code);
    const field = role === "A" ? "poisonChoiceA" : "poisonChoiceB";
    try { await ref.update({ [field]: isos }); } catch (e) { console.warn("Fallen-Flaggen-Wahl konnte nicht gesendet werden.", e); }
}

// Streut 1 Fallen-Flagge pro Block (4er-Block) an zufälliger Position ein (Konzept Punkt 4).
// positions (eine Position je Block) wird EINMAL für beide Spieler:innen gemeinsam gewürfelt und
// hier nur noch angewendet — würde jede Sequenz ihre eigene Zufallsposition würfeln, käme die
// Fallen-Flagge bei A und B in unterschiedlichen Runden an (Bug, siehe tryResolveBattleStart).
function battleBuildIndividualSequence(baseSequence, poisonCountries, positions) {
    const blocks = [baseSequence.slice(0, 4), baseSequence.slice(4, 8), baseSequence.slice(8, 12)];
    const seq = [];
    blocks.forEach((block, i) => {
        const pos = positions[i];
        const modified = block.map(c => ({ name: c.name, iso: c.iso, isPoison: false }));
        modified[pos] = { name: poisonCountries[i].name, iso: poisonCountries[i].iso, isPoison: true };
        seq.push(...modified);
    });
    return seq;
}

// Berechnet für eine Flaggen-Sequenz (12 Runden bzw. Sudden-Death-Liste) pro Runde vorab die
// fertig gemischten Antwortoptionen (richtige Flagge + 3 zufällige Distraktoren aus dem Pool).
// Wird EINMAL serverseitig in der Transaktion berechnet und in Firestore abgelegt, damit beide
// Spieler:innen für dieselbe Runde exakt dieselben Optionen sehen (siehe tryResolveBattleStart) —
// vorher wurden die Optionen rein clientseitig und unabhängig voneinander gewürfelt.
function buildBattleOptionsForSequence(sequence, poolCountries) {
    return sequence.map(flag => {
        const distractors = shuffle(poolCountries.filter(c => c.iso !== flag.iso)).slice(0, 3);
        return shuffle([{ name: flag.name, iso: flag.iso }, ...distractors]);
    });
}

async function tryResolveBattleStart(code) {
    const ref = firestoreDb.collection("battles").doc(code);
    try {
        await firestoreDb.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const data = snap.data();
            if (!data || data.sequenceA || !data.poisonChoiceA || !data.poisonChoiceB || !data.pool) return;
            const poolCountries = countries.filter(c => data.pool.includes(c.continent));
            const isoToCountry = iso => countries.find(c => c.iso === iso);
            const poisonForA = data.poisonChoiceB.map(isoToCountry); // B's Wahl trifft A
            const poisonForB = data.poisonChoiceA.map(isoToCountry); // A's Wahl trifft B
            const base = shuffle(poolCountries).slice(0, 12);
            // Eine gemeinsame Einfüge-Position je Block, statt je Sequenz einzeln zu würfeln —
            // sonst käme die Fallen-Flagge bei A und B in unterschiedlichen Runden an.
            const poisonPositions = [0, 1, 2].map(() => Math.floor(Math.random() * 4));
            const sequenceA = battleBuildIndividualSequence(base, poisonForA, poisonPositions);
            const sequenceB = battleBuildIndividualSequence(base, poisonForB, poisonPositions);
            const suddenDeathSequence = shuffle(poolCountries).slice(0, Math.min(30, poolCountries.length))
                .map(c => ({ name: c.name, iso: c.iso, isPoison: false }));
            // Antwortoptionen pro Runde einmal hier (statt clientseitig je Gerät) berechnen, damit
            // beide Spieler:innen bei derselben Runde exakt dieselben Optionen sehen.
            const optionsA = buildBattleOptionsForSequence(sequenceA, poolCountries);
            const optionsB = buildBattleOptionsForSequence(sequenceB, poolCountries);
            const suddenDeathOptions = buildBattleOptionsForSequence(suddenDeathSequence, poolCountries);
            tx.update(ref, {
                sequenceA: sequenceA, sequenceB: sequenceB,
                optionsA: optionsA, optionsB: optionsB,
                suddenDeathSequence: suddenDeathSequence, suddenDeathOptions: suddenDeathOptions,
                status: "laeuft", currentRound: 1,
                livesA: BATTLE_MAX_LIVES, livesB: BATTLE_MAX_LIVES
            });
        });
    } catch (e) { console.warn("Battle-Start konnte nicht aufgelöst werden.", e); }
}

// ---------- Battle: Antwort-Mechanik pro Runde (Konzept Punkte 5-7) ----------

async function submitBattleAnswer(code, role, roundNum, givenIso, correctIso, wasTimeout) {
    const ref = firestoreDb.collection("battles").doc(code);
    const field = role === "A" ? "answerA" : "answerB";
    const value = { given: givenIso || null, correct: !wasTimeout && givenIso === correctIso, atMs: Date.now(), timeout: !!wasTimeout };
    try {
        await ref.update({ ["rounds." + roundNum + "." + field]: value });
    } catch (e) {
        try {
            const patch = {}; patch[roundNum] = {}; patch[roundNum][field] = value;
            await ref.set({ rounds: patch }, { merge: true });
        } catch (e2) { console.warn("Antwort konnte nicht gesendet werden.", e2); }
    }
}

async function tryResolveBattleRound(code, roundNum) {
    const ref = firestoreDb.collection("battles").doc(code);
    try {
        await firestoreDb.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const data = snap.data();
            if (!data) return;
            const rd = data.rounds && data.rounds[roundNum];
            if (!rd || rd.resolved || !rd.answerA || !rd.answerB) return;
            let livesA = data.livesA, livesB = data.livesB;
            if (!rd.answerA.correct) livesA--;
            if (!rd.answerB.correct) livesB--;
            const updates = {};
            updates["rounds." + roundNum + ".resolved"] = true;
            updates.livesA = livesA;
            updates.livesB = livesB;
            if (livesA <= 0 || livesB <= 0) {
                updates.status = "beendet";
                updates.winner = (livesA <= 0 && livesB <= 0) ? "unentschieden" : (livesA <= 0 ? "B" : "A");
            } else {
                updates.currentRound = roundNum + 1;
                if (roundNum >= 12) updates.status = "suddendeath";
            }
            tx.update(ref, updates);
        });
    } catch (e) { console.warn("Battle-Runde konnte nicht aufgelöst werden.", e); }
}

// ---------- Battle: Bestenliste (nur Anzahl gewonnener Battles, Konzept Punkt 8) ----------

async function recordBattleWin() {
    const rawName = nicknameInput.value.trim();
    const playerName = (!rawName || containsBlockedContent(rawName)) ? generateFantasyName() : rawName;
    const deviceId = getDeviceId();
    const { list: currentList } = await fetchTopList(BATTLE_HIGHSCORE_KEY);
    let list = currentList.slice();
    const idx = list.findIndex(e => e.deviceId === deviceId);
    if (idx !== -1) {
        list[idx] = { name: playerName, deviceId: deviceId, wins: (list[idx].wins || 0) + 1 };
    } else {
        list.push({ name: playerName, deviceId: deviceId, wins: 1 });
    }
    list.sort((a, b) => b.wins - a.wins);
    list = list.slice(0, 50);
    const saved = await saveTopList(BATTLE_HIGHSCORE_KEY, list);
    setHighscoreCache(BATTLE_HIGHSCORE_KEY, list, saved);
}

async function updateBattleHighscoreDisplay(targetId) {
    const el = document.getElementById(targetId || "battleHighscoreDisplay");
    el.innerHTML = '<div class="highscore-card hs-empty"><span class="trophy">🏆</span><div>' + t("common.loading") + '</div></div>';
    const { list, online } = await fetchTopListCached(BATTLE_HIGHSCORE_KEY);
    const statusLine = online
        ? '<span title="' + t("common.onlineTitle") + '">' + t("common.online") + '</span>'
        : '<span title="' + t("common.offlineTitle") + '">' + t("common.offline") + '</span>';
    if (list.length === 0) {
        el.innerHTML = '<div class="highscore-card hs-empty"><span class="trophy">🏆</span><div>' + t("battle.noResultsYet") + '</div><div class="hs-status">' + statusLine + '</div></div>';
        return;
    }
    const medals = ["🥇", "🥈", "🥉"];
    let lastWins = null, lastRank = 0;
    const rowsHtml = list.slice(0, 50).map((entry, i) => {
        const rank = (entry.wins === lastWins) ? lastRank : (i + 1);
        lastWins = entry.wins; lastRank = rank;
        return '<div class="hs-row rank-' + rank + '">' +
            '<div class="hs-medal">' + (rank <= 3 ? medals[rank - 1] : rank + ".") + '</div>' +
            '<div class="hs-row-name">' + escapeHtml(entry.name || t("common.anonymous")) + '</div>' +
            '<div class="hs-row-score">' + entry.wins + ' ' + (entry.wins === 1 ? t("battle.wins") : t("battle.winsPlural")) + '</div></div>';
    }).join("");
    el.innerHTML = '<div class="highscore-card"><div class="hs-row-list">' + rowsHtml + '</div><div class="hs-status">' + statusLine + '</div></div>';
}

// ---------- Battle: Client-Zustandsmaschine ----------

let battleCode = null;
let battleRole = null; // "A" | "B"
let battleUnsub = null;
let battleLastRenderedRound = -1;
let battleLocalAnswered = false;
let battleCountdownTimer = null;
let battleSelectedContinents = [];
let battleSelectedPoison = [];
let battleLastKnownMyLives = null;       // Schritt 5: für Trefferanimation bei eigenem Lebensverlust
let battleLastKnownOpponentLives = null; // Schritt 5: für Trefferanimation bei Gegner-Lebensverlust
let battleLastData = null;
let battleHeartbeatTimer = null;
let battleWatchdogTimer = null;
let battleTierIcons = new Map(); // wird beim Verbindungsaufbau einmal geladen, siehe startBattleListener
const BATTLE_STALE_WARNING_MS = 12000; // ab hier: dezenter Hinweis "Verbindung könnte unterbrochen sein"
const BATTLE_STALE_CLAIM_MS = 45000;   // ab hier: aktive Möglichkeit, das Battle für sich zu werten

// Zeigt/versteckt das schwebende Verbindungs-Warnbanner anhand des zuletzt bekannten
// Herzschlag-Zeitstempels des Gegners (siehe Konzept-Offener-Punkt "Verbindungsabbruch").
function updateBattleConnectionWarning(data) {
    const banner = document.getElementById("battleConnectionBanner");
    if (!banner) return;
    if (!data || data.status === "beendet" || data.status === "warten_spielerB") {
        banner.style.display = "none";
        return;
    }
    const oppLastSeen = battleRole === "A" ? data.lastSeenB : data.lastSeenA;
    if (!oppLastSeen) { banner.style.display = "none"; return; }
    const age = Date.now() - oppLastSeen;
    if (age < BATTLE_STALE_WARNING_MS) {
        banner.style.display = "none";
        return;
    }
    banner.style.display = "block";
    const oppName = escapeHtml(battleGetOpponentName(data));
    if (age >= BATTLE_STALE_CLAIM_MS) {
        banner.innerHTML = t("battle.connectionLost").replace("{name}", oppName) +
            '<br><button id="battleClaimWinBtn" style="margin-top:8px;">' + t("battle.claimWin") + '</button>';
        const claimBtn = document.getElementById("battleClaimWinBtn");
        if (claimBtn) claimBtn.onclick = () => claimBattleWinByDisconnect(battleCode);
    } else {
        banner.innerHTML = t("battle.connectionMaybeLost").replace("{name}", oppName);
    }
}

// Erlaubt es, ein Battle für sich zu werten, wenn der Gegner seit längerem (siehe
// BATTLE_STALE_CLAIM_MS) keinen Herzschlag mehr gesendet hat. Prüft den Zeitstempel innerhalb
// der Transaktion nochmal nach, damit ein zwischenzeitlich doch wieder aktiver Gegner nicht
// fälschlich als "abgebrochen" gewertet wird.
async function claimBattleWinByDisconnect(code) {
    const ref = firestoreDb.collection("battles").doc(code);
    try {
        await firestoreDb.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const data = snap.data();
            if (!data || data.status === "beendet") return;
            const oppLastSeen = battleRole === "A" ? data.lastSeenB : data.lastSeenA;
            if (!oppLastSeen || (Date.now() - oppLastSeen) < BATTLE_STALE_CLAIM_MS) return;
            tx.update(ref, { status: "beendet", winner: battleRole });
        });
    } catch (e) { console.warn("Sieg wegen Verbindungsabbruch konnte nicht gewertet werden.", e); }
}

function battleGetMyLives(data) { return battleRole === "A" ? data.livesA : data.livesB; }
function battleGetOpponentLives(data) { return battleRole === "A" ? data.livesB : data.livesA; }
function battleNameWithCrown(player, fallback) {
    if (!player) return fallback;
    const tierIcon = battleTierIcons.get(player.deviceId);
    return (tierIcon ? (tierIcon + " ") : "") + player.name;
}
function battleGetMyName(data) {
    return battleRole === "A" ? battleNameWithCrown(data.playerA, t("battle.you")) : battleNameWithCrown(data.playerB, t("battle.you"));
}
function battleGetOpponentName(data) {
    return battleRole === "A" ? battleNameWithCrown(data.playerB, t("battle.opponent")) : battleNameWithCrown(data.playerA, t("battle.opponent"));
}

function battleCurrentFlagFor(data, roundNum) {
    const seq = battleRole === "A" ? data.sequenceA : data.sequenceB;
    if (roundNum <= 12) return seq && seq[roundNum - 1];
    const sd = data.suddenDeathSequence || [];
    if (sd.length === 0) return null;
    return sd[(roundNum - 13) % sd.length];
}

// Liefert die vorberechneten, für beide Spieler:innen bei dieser Runde identischen Antwortoptionen
// (siehe tryResolveBattleStart). Gibt null zurück, wenn ein Battle-Dokument von vor diesem Fix
// noch keine vorberechneten Optionen enthält — der Aufruf fällt dann auf die alte, lokale
// Zufallsauswahl zurück (siehe showBattleGameScreen).
function battleCurrentOptionsFor(data, roundNum) {
    if (roundNum <= 12) {
        const opts = battleRole === "A" ? data.optionsA : data.optionsB;
        if (opts && opts[roundNum - 1]) return opts[roundNum - 1];
    } else {
        const sdOpts = data.suddenDeathOptions || [];
        if (sdOpts.length > 0) return sdOpts[(roundNum - 13) % sdOpts.length];
    }
    return null;
}

function renderBattleHearts(el, lives) {
    let html = "";
    for (let i = 0; i < BATTLE_MAX_LIVES; i++) html += i < lives ? '<span class="heart">❤️</span>' : '<span class="heart heart-lost">🤍</span>';
    el.innerHTML = html;
}

// ---------- Schritt 5: Trefferanimationen ----------
function playBattleOwnHitSound() {
    // Tiefer, dumpfer "Treffer"-Ton (eigenes Leben verloren)
    playTone(160, 0.22, "sawtooth");
    setTimeout(() => playTone(110, 0.28, "sawtooth"), 90);
}
function playBattleOpponentHitSound() {
    // Heller, positiver Ton (Gegner-Leben verloren)
    playTone(700, 0.14, "sine");
    setTimeout(() => playTone(950, 0.16, "sine"), 90);
}

function flashBattleScreen(colorClass) {
    const overlay = document.getElementById("battleHitFlash");
    if (!overlay) return;
    overlay.classList.remove("flash-red", "flash-green");
    void overlay.offsetWidth; // Reflow erzwingen, damit die Animation bei wiederholtem Trigger neu startet
    overlay.classList.add(colorClass);
    setTimeout(() => overlay.classList.remove(colorClass), 620);
}

// Letztes noch aktives Herz in einer Herzreihe animiert "zerbrechen" lassen.
function breakLastActiveHeart(containerId, extraClass) {
    const hearts = Array.from(document.getElementById(containerId).querySelectorAll(".heart"));
    const target = hearts.slice().reverse().find(h => !h.classList.contains("heart-lost"));
    if (!target) return;
    target.classList.add("heart-breaking");
    if (extraClass) target.classList.add(extraClass);
}

// Eigenes Leben verloren: Herz zerbricht, roter Bildschirm-Blitz, dumpfer Ton, kurze Vibration
// (Vibration funktioniert nur auf Geräten/Browsern, die die Vibration-API unterstützen — z. B.
// Android-Chrome. iOS/Safari unterstützt das grundsätzlich nicht; dort passiert einfach nichts,
// kein Fehler, keine Beeinträchtigung — "Progressive Enhancement".)
function triggerBattleOwnHitAnimation() {
    breakLastActiveHeart("battleOwnHearts");
    showFloatingText("-1", document.getElementById("battleOwnHearts"), "negative");
    flashBattleScreen("flash-red");
    playBattleOwnHitSound();
    if (window.navigator && typeof navigator.vibrate === "function") {
        try { navigator.vibrate(140); } catch (e) { /* ignorieren */ }
    }
}

// Gegner-Leben verloren: Herz beim Gegner zerbricht + wackelt kurz, grüner Bildschirm-Blitz
// (positives Feedback für dich), heller Ton. Keine Vibration — die ist bewusst nur für den
// eigenen Treffer reserviert, sonst wäre die Bedeutung nicht eindeutig unterscheidbar.
function triggerBattleOpponentHitAnimation() {
    breakLastActiveHeart("battleOpponentHearts", "heart-shake");
    showFloatingText("-1", document.getElementById("battleOpponentHearts"), "positive");
    flashBattleScreen("flash-green");
    playBattleOpponentHitSound();
}

function stopBattleListener() {
    if (battleUnsub) { battleUnsub(); battleUnsub = null; }
    clearInterval(battleCountdownTimer); battleCountdownTimer = null;
    clearInterval(battleHeartbeatTimer); battleHeartbeatTimer = null;
    clearInterval(battleWatchdogTimer); battleWatchdogTimer = null;
    battleLastData = null;
    battleLastKnownMyLives = null;
    battleLastKnownOpponentLives = null;
    const banner = document.getElementById("battleConnectionBanner");
    if (banner) banner.style.display = "none";
}

function startBattleListener(code, role) {
    battleCode = code; battleRole = role;
    battleLastRenderedRound = -1;
    stopBattleListener();

    getLadderTierDeviceIdMap().then(map => {
        battleTierIcons = map;
        if (battleLastData) renderBattleFromData(battleLastData); // Namen (Tier-Abzeichen) neu einblenden, falls schon etwas gerendert wurde
    });

    const ref = firestoreDb.collection("battles").doc(code);
    battleUnsub = ref.onSnapshot((snap) => {
        if (!snap.exists) {
            stopBattleListener();
            clearBattleSession();
            alert(t("battle.notExistsAnymore"));
            goToMultiPlayerMenu();
            return;
        }
        battleLastData = snap.data();
        renderBattleFromData(battleLastData);
    }, (e) => console.warn("Battle-Verbindung verloren.", e));

    // Herzschlag: eigenen Zeitstempel regelmäßig aktualisieren — Grundlage dafür, dass der Gegner
    // eine abgebrochene Verbindung erkennen kann (siehe Konzept, offener Punkt "Verbindungsabbruch").
    const myField = role === "A" ? "lastSeenA" : "lastSeenB";
    ref.update({ [myField]: Date.now() }).catch(() => {});
    battleHeartbeatTimer = setInterval(() => {
        ref.update({ [myField]: Date.now() }).catch(() => {});
    }, 5000);

    // Watchdog: regelmäßig prüfen, ob der Gegner seit längerem keinen Herzschlag mehr gesendet hat.
    battleWatchdogTimer = setInterval(() => {
        if (battleLastData) updateBattleConnectionWarning(battleLastData);
    }, 3000);
}

function renderBattleFromData(data) {
    if (data.status === "warten_spielerB") {
        // Reload-sicher: Bildschirm samt Code/QR erneut aufbauen, falls er (z. B. nach einem
        // Browser-Reload während der Wartephase) noch nicht sichtbar ist.
        if (document.getElementById("battleEntryScreen").style.display !== "block") {
            hideAllScreens();
            setChromeVisible(true);
            document.getElementById("battleEntryScreen").style.display = "block";
        }
        renderBattleWaitingBox(battleCode);
        return;
    }
    if (data.status === "kontinentwahl") {
        if (data.continentChoiceA && data.continentChoiceB && !data.pool) tryResolveBattlePool(battleCode);
        showBattleContinentScreen(data);
        return;
    }
    if (data.status === "giftwahl") {
        if (data.poisonChoiceA && data.poisonChoiceB && !data.sequenceA) tryResolveBattleStart(battleCode);
        showBattlePoisonScreen(data);
        return;
    }
    if (data.status === "laeuft" || data.status === "suddendeath") {
        const rd = data.rounds && data.rounds[data.currentRound];
        if (rd && rd.answerA && rd.answerB && !rd.resolved) tryResolveBattleRound(battleCode, data.currentRound);
        showBattleGameScreen(data);
        return;
    }
    if (data.status === "beendet") {
        showBattleEndScreen(data);
        return;
    }
}

function showBattleContinentScreen(data) {
    if (document.getElementById("battleContinentScreen").style.display !== "block") {
        hideAllScreens();
        setChromeVisible(false);
        document.getElementById("battleContinentScreen").style.display = "block";
        document.getElementById("battleContinentButtons").innerHTML = "";
    }
    document.getElementById("battleOpponentJoinedNote").textContent = t("battle.opponentJoined") + battleGetOpponentName(data);

    const myChoice = battleRole === "A" ? data.continentChoiceA : data.continentChoiceB;
    const submitBtn = document.getElementById("battleContinentSubmitBtn");
    const waitNote = document.getElementById("battleContinentWaitNote");
    const btnContainer = document.getElementById("battleContinentButtons");

    if (myChoice) {
        waitNote.style.display = "block";
        waitNote.textContent = t("battle.waitingFor").replace("{name}", battleGetOpponentName(data));
        submitBtn.style.display = "none";
        Array.from(btnContainer.children).forEach(b => b.disabled = true);
        return;
    }

    if (btnContainer.children.length === 0) {
        battleSelectedContinents = [];
        data.continents3.forEach(cont => {
            const btn = document.createElement("button");
            btn.className = "menu-tile";
            btn.type = "button";
            btn.innerHTML = '<span class="menu-tile-icon">' + (CONTINENT_ICONS[cont] || "🌐") + '</span><span class="menu-tile-text"><span class="menu-tile-title">' + continentDisplayName(cont) + '</span></span>';
            btn.onclick = () => {
                const already = battleSelectedContinents.includes(cont);
                if (already) {
                    battleSelectedContinents = battleSelectedContinents.filter(c => c !== cont);
                    btn.classList.remove("selected-battle-tile");
                } else if (battleSelectedContinents.length < 2) {
                    battleSelectedContinents.push(cont);
                    btn.classList.add("selected-battle-tile");
                }
                submitBtn.disabled = battleSelectedContinents.length !== 2;
            };
            btnContainer.appendChild(btn);
        });
    }
    submitBtn.style.display = "block";
    submitBtn.disabled = battleSelectedContinents.length !== 2;
    submitBtn.onclick = () => {
        submitBtn.disabled = true;
        submitBattleContinents(battleCode, battleRole, battleSelectedContinents.slice());
    };
}

function showBattlePoisonScreen(data) {
    if (document.getElementById("battlePoisonScreen").style.display !== "block") {
        hideAllScreens();
        setChromeVisible(false);
        document.getElementById("battlePoisonScreen").style.display = "block";
        document.getElementById("battlePoisonGrid").innerHTML = "";
    }

    const myChoice = battleRole === "A" ? data.poisonChoiceA : data.poisonChoiceB;
    const submitBtn = document.getElementById("battlePoisonSubmitBtn");
    const waitNote = document.getElementById("battlePoisonWaitNote");
    const grid = document.getElementById("battlePoisonGrid");
    const counterEl = document.getElementById("battlePoisonCounter");

    if (myChoice) {
        waitNote.style.display = "block";
        waitNote.textContent = t("battle.waitingFor").replace("{name}", battleGetOpponentName(data));
        submitBtn.style.display = "none";
        Array.from(grid.children).forEach(el => el.style.pointerEvents = "none");
        return;
    }

    if (grid.children.length === 0) {
        battleSelectedPoison = [];
        const poolCountries = countries.filter(c => data.pool.includes(c.continent));
        poolCountries.forEach(c => {
            const tile = document.createElement("div");
            tile.className = "battle-poison-tile";
            tile.innerHTML = '<img src="' + flagImageUrl(c.iso) + '" alt=""><div>' + escapeHtml(c.name) + '</div>';
            tile.onclick = () => {
                const idx = battleSelectedPoison.indexOf(c.iso);
                if (idx !== -1) {
                    battleSelectedPoison.splice(idx, 1);
                    tile.classList.remove("selected");
                } else if (battleSelectedPoison.length < 3) {
                    battleSelectedPoison.push(c.iso);
                    tile.classList.add("selected");
                }
                counterEl.textContent = battleSelectedPoison.length + t("battle.chosenOf3");
                submitBtn.disabled = battleSelectedPoison.length !== 3;
            };
            grid.appendChild(tile);
        });
    }
    counterEl.textContent = battleSelectedPoison.length + t("battle.chosenOf3");
    submitBtn.style.display = "block";
    submitBtn.disabled = battleSelectedPoison.length !== 3;
    submitBtn.onclick = () => {
        submitBtn.disabled = true;
        submitBattlePoison(battleCode, battleRole, battleSelectedPoison.slice());
    };
}

function showBattleGameScreen(data) {
    if (document.getElementById("battleGameScreen").style.display !== "block") {
        hideAllScreens();
        setChromeVisible(false);
        document.getElementById("battleGameScreen").style.display = "block";
    }

    document.getElementById("battleOwnName").textContent = battleGetMyName(data);
    document.getElementById("battleOpponentName").textContent = battleGetOpponentName(data);

    const myLivesNow = battleGetMyLives(data);
    const opponentLivesNow = battleGetOpponentLives(data);

    // Schritt 5: Lebensverlust seit dem letzten bekannten Stand erkennen und animieren.
    // battleLastKnownXLives ist beim allerersten Rendern noch null (kein Vergleich möglich/nötig).
    const myJustLost = battleLastKnownMyLives !== null && myLivesNow < battleLastKnownMyLives;
    const opponentJustLost = battleLastKnownOpponentLives !== null && opponentLivesNow < battleLastKnownOpponentLives;

    if (myJustLost) {
        // Erst mit dem ALTEN (höheren) Herz-Stand rendern, damit das Herz, das gerade "zerbricht",
        // überhaupt noch da ist — sonst würde renderBattleHearts es sofort wieder wegrationalisieren.
        renderBattleHearts(document.getElementById("battleOwnHearts"), battleLastKnownMyLives);
        triggerBattleOwnHitAnimation();
        setTimeout(() => renderBattleHearts(document.getElementById("battleOwnHearts"), myLivesNow), 480);
    } else {
        renderBattleHearts(document.getElementById("battleOwnHearts"), myLivesNow);
    }

    if (opponentJustLost) {
        renderBattleHearts(document.getElementById("battleOpponentHearts"), battleLastKnownOpponentLives);
        triggerBattleOpponentHitAnimation();
        setTimeout(() => renderBattleHearts(document.getElementById("battleOpponentHearts"), opponentLivesNow), 480);
    } else {
        renderBattleHearts(document.getElementById("battleOpponentHearts"), opponentLivesNow);
    }

    battleLastKnownMyLives = myLivesNow;
    battleLastKnownOpponentLives = opponentLivesNow;

    const roundNum = data.currentRound;
    document.getElementById("battleRoundLabel").textContent =
        roundNum <= 12 ? t("battle.round").replace("{n}", roundNum) : t("battle.suddenDeathRound").replace("{n}", roundNum - 12);

    const myFlag = battleCurrentFlagFor(data, roundNum);
    if (!myFlag) return;

    if (roundNum !== battleLastRenderedRound) {
        battleLastRenderedRound = roundNum;
        battleLocalAnswered = false;
        clearInterval(battleCountdownTimer);
        document.getElementById("battleTimerRow").style.display = "none";
        document.getElementById("battleWaitingForOpponentNote").textContent = "";

        const giftBanner = document.getElementById("battleGiftBanner");
        if (myFlag.isPoison) {
            giftBanner.style.display = "block";
            giftBanner.textContent = t("battle.trapFrom").replace("{name}", battleGetOpponentName(data));
        } else {
            giftBanner.style.display = "none";
        }

        const flagUrl = flagImageUrl(myFlag.iso);
        const flagErrorEl = document.getElementById("battleFlagError");
        flagErrorEl.style.display = "none";
        document.getElementById("battleFlag").style.backgroundImage = "url('" + flagUrl + "')";
        const testImg = new Image();
        testImg.onerror = function () {
            flagErrorEl.textContent = t("common.flagLoadError");
            flagErrorEl.style.display = "flex";
        };
        testImg.src = flagUrl;

        // Serverseitig vorberechnete Optionen nutzen, damit beide Spieler:innen bei derselben Runde
        // exakt dieselben Antwortmöglichkeiten sehen. Fallback (lokale Zufallsauswahl) nur für
        // Battle-Dokumente von vor diesem Fix, die noch keine vorberechneten Optionen haben.
        const precomputed = battleCurrentOptionsFor(data, roundNum);
        let options;
        if (precomputed) {
            options = precomputed;
        } else {
            const poolCountries = countries.filter(c => data.pool.includes(c.continent));
            const distractors = shuffle(poolCountries.filter(c => c.iso !== myFlag.iso)).slice(0, 3);
            options = shuffle([{ name: myFlag.name, iso: myFlag.iso }, ...distractors]);
        }
        const optsDiv = document.getElementById("battleMcOptions");
        optsDiv.innerHTML = "";
        options.forEach(opt => {
            const btn = document.createElement("button");
            btn.className = "mc-btn";
            btn.textContent = quizCountryNameByIso(opt.iso);
            btn.dataset.iso = opt.iso;
            btn.onclick = () => onBattleAnswerClick(opt.iso, myFlag.iso);
            optsDiv.appendChild(btn);
        });
    }

    const rd = (data.rounds && data.rounds[roundNum]) || {};
    const myAns = battleRole === "A" ? rd.answerA : rd.answerB;
    const oppAns = battleRole === "A" ? rd.answerB : rd.answerA;
    if (myAns) {
        Array.from(document.getElementById("battleMcOptions").querySelectorAll(".mc-btn")).forEach(b => { b.disabled = true; });
        document.getElementById("battleWaitingForOpponentNote").textContent = oppAns ? "" : t("battle.waitingFor").replace("{name}", battleGetOpponentName(data));
    } else if (oppAns && !battleCountdownTimer) {
        startBattleCountdown(myFlag.iso);
    }
}

function onBattleAnswerClick(givenIso, correctIso) {
    if (battleLocalAnswered) return;
    battleLocalAnswered = true;
    clearInterval(battleCountdownTimer);
    battleCountdownTimer = null;
    document.getElementById("battleTimerRow").style.display = "none";
    Array.from(document.getElementById("battleMcOptions").querySelectorAll(".mc-btn")).forEach(b => {
        b.disabled = true;
        if (b.dataset.iso === correctIso) b.classList.add("correct");
        else if (b.dataset.iso === givenIso && givenIso !== correctIso) b.classList.add("wrong");
    });
    if (givenIso === correctIso) {
        showFloatingText("✓", document.getElementById("battleMcOptions"), "positive");
        playCorrectSound();
    } else {
        showFloatingText("✗", document.getElementById("battleMcOptions"), "negative");
        playWrongSound();
    }
    submitBattleAnswer(battleCode, battleRole, battleLastRenderedRound, givenIso, correctIso, false);
}

function startBattleCountdown(correctIso) {
    const timerRow = document.getElementById("battleTimerRow");
    const timerInner = document.getElementById("battleTimerBarInner");
    timerRow.style.display = "block";
    timerInner.style.transition = "none";
    timerInner.style.width = "100%";
    requestAnimationFrame(() => {
        timerInner.style.transition = "width 3s linear";
        timerInner.style.width = "0%";
    });
    battleCountdownTimer = setTimeout(() => {
        battleCountdownTimer = null;
        if (battleLocalAnswered) return;
        battleLocalAnswered = true;
        Array.from(document.getElementById("battleMcOptions").querySelectorAll(".mc-btn")).forEach(b => { b.disabled = true; });
        playWrongSound();
        submitBattleAnswer(battleCode, battleRole, battleLastRenderedRound, null, correctIso, true);
    }, 3000);
}

async function showBattleEndScreen(data) {
    stopBattleListener();
    hideAllScreens();
    setChromeVisible(true);
    setNicknameCardVisible(false);
    document.getElementById("battleEndScreen").style.display = "block";

    const el = document.getElementById("battleEndContent");
    if (data.winner === "unentschieden") {
        el.innerHTML = '<div class="battle-end-emoji">🤝</div><h2>' + t("battle.drawTitle") + '</h2><p>' + t("battle.drawSub") + '</p>';
    } else if (data.winner === battleRole) {
        el.innerHTML = '<div class="battle-end-emoji">🏆</div><h2>' + t("battle.winTitle") + '</h2><p>' + t("battle.winSub") + '</p>';
        await recordBattleWin();
    } else {
        el.innerHTML = '<div class="battle-end-emoji">💔</div><h2>' + t("battle.loseTitle") + '</h2><p>' + t("battle.loseSub") + '</p>';
    }
    clearBattleSession();
}

// ---------- Battle: Bildschirm-Navigation & Buttons ----------

function goToBattleEntryScreen() {
    hideAllScreens();
    setChromeVisible(true);
    document.getElementById("battleEntryScreen").style.display = "block";
    document.getElementById("battleWaitingBox").style.display = "none";
    document.getElementById("battleCreateBtn").style.display = "block";
    document.getElementById("battleJoinBtn").style.display = "block";
    document.getElementById("battleJoinInputRow").style.display = "none";
}

function renderBattleWaitingBox(code) {
    const box = document.getElementById("battleWaitingBox");
    if (box.dataset.renderedFor === code) return; // schon aufgebaut — eigene Herzschlag-Updates lösen sonst unnötig oft neu aus
    box.dataset.renderedFor = code;
    box.style.display = "block";
    box.innerHTML =
        '<p>' + t("battle.shareCode") + '</p>' +
        '<div style="font-family:var(--font-display);font-size:34px;font-weight:700;letter-spacing:6px;text-align:center;margin:14px 0;color:var(--color-primary);">' + escapeHtml(code) + '</div>' +
        '<div id="battleQrContainer" style="display:flex;justify-content:center;margin:10px 0;padding:14px;background:#F8FBFC;border-radius:var(--radius-md);"></div>' +
        '<p style="text-align:center;color:var(--text-secondary);">' + t("battle.waitingForOpponent") + '</p>';
    const qrDiv = document.getElementById("battleQrContainer");
    const joinUrl = location.origin + location.pathname + "?battle=" + code;
    if (window.QRCode) new QRCode(qrDiv, { text: joinUrl, width: 160, height: 160 });
    document.getElementById("battleCreateBtn").style.display = "none";
    document.getElementById("battleJoinBtn").style.display = "none";
    document.getElementById("battleJoinInputRow").style.display = "none";
}

// Sauberes Verlassen während einer laufenden Battle-Phase (Kontinent-/Fallen-/Duell-Bildschirm):
// zählt als Aufgabe — der Gegner gewinnt automatisch, statt einfach im Ungewissen zu bleiben.
async function forfeitBattle() {
    if (!battleCode || !battleRole) { goToMultiPlayerMenu(); return; }
    const sure = confirm(t("battle.confirmForfeit"));
    if (!sure) return;
    const opponentRole = battleRole === "A" ? "B" : "A";
    try {
        await firestoreDb.collection("battles").doc(battleCode).update({ status: "beendet", winner: opponentRole });
    } catch (e) { console.warn("Battle konnte nicht sauber verlassen werden.", e); }
    stopBattleListener();
    clearBattleSession();
    goToMultiPlayerMenu();
}

document.getElementById("tileBattle").onclick = () => goToBattleEntryScreen();

document.getElementById("backFromBattleEntry").onclick = async function () {
    const session = getBattleSession();
    if (session) {
        const sure = confirm(t("battle.confirmLeaveEntry"));
        if (!sure) return;
        stopBattleListener();
        try { await firestoreDb.collection("battles").doc(session.code).delete(); } catch (e) { /* ignorieren */ }
        clearBattleSession();
    }
    goToMultiPlayerMenu();
};

document.getElementById("battleCreateBtn").onclick = async function () {
    if (!firestoreDb) { alert(t("battle.needsOnlineCreate")); return; }
    this.disabled = true;
    this.textContent = t("battle.creatingCode");
    const code = await createBattle();
    this.disabled = false;
    this.textContent = t("battle.createButton");
    if (!code) { alert(t("battle.couldNotCreate")); return; }
    renderBattleWaitingBox(code);
    startBattleListener(code, "A");
};

document.getElementById("battleJoinBtn").onclick = function () {
    document.getElementById("battleJoinInputRow").style.display = "block";
};

document.getElementById("battleJoinConfirmBtn").onclick = async function () {
    const feedback = document.getElementById("battleJoinFeedback");
    this.disabled = true;
    feedback.style.color = "#666";
    feedback.textContent = t("battle.checkingCode");
    const result = await joinBattleByCode(document.getElementById("battleCodeInput").value);
    this.disabled = false;
    if (result.ok) {
        feedback.textContent = "";
        startBattleListener(result.code, "B");
    } else {
        let msg = t("battle.codeNotFound");
        if (result.reason === "offline") msg = t("battle.needsOnlineJoin");
        if (result.reason === "format") msg = t("battle.enterFullCode");
        feedback.style.color = "#c62828";
        feedback.textContent = "⚠️ " + msg;
    }
};
document.getElementById("battleCodeInput").addEventListener("input", function () { this.value = this.value.toUpperCase(); });

document.getElementById("battleEndRestartBtn").onclick = function () { goToMultiPlayerMenu(); };
document.getElementById("forfeitFromBattleContinent").onclick = () => forfeitBattle();
document.getElementById("forfeitFromBattlePoison").onclick = () => forfeitBattle();
document.getElementById("forfeitFromBattleGame").onclick = () => forfeitBattle();

// Automatischer Beitritt über den Battle-QR-Code-Link (?battle=CODE in der URL)
(function checkBattleUrlParam() {
    const params = new URLSearchParams(location.search);
    const code = params.get("battle");
    if (code) {
        goToBattleEntryScreen();
        document.getElementById("battleJoinInputRow").style.display = "block";
        document.getElementById("battleCodeInput").value = code.toUpperCase();
        document.getElementById("battleJoinConfirmBtn").click();
        history.replaceState({}, "", location.pathname);
    }
})();

