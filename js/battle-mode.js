// ================= 1vs1 Battle-Modus =================

const BATTLE_SESSION_KEY = "flagquiz_battle_session"; // { code, role: "A"|"B" }
const BATTLE_HIGHSCORE_KEY = "flagquiz_battle_bestenliste";
const BATTLE_EXPIRY_HOURS = 3;
const BATTLE_MAX_LIVES = 5; // Schritt 5: 5 statt 3 Leben pro Spieler:in

// Eigener, rein lokaler Sieg-Zähler für das Erfolgssystem (js/achievements.js) -- bewusst NICHT aus
// BATTLE_HIGHSCORE_KEY abgeleitet, da diese Liste auf die Top 50 gekappt ist (recordBattleWin()):
// Geräte außerhalb der Top 50 würden ihren Sieg-Fortschritt sonst beim nächsten Speichern verlieren.
// Analoges Muster wie LADDER_OWN_BEST_CACHE_KEY in js/ladder-mode.js (dort ebenfalls rein lokal).
const BATTLE_OWN_WINS_KEY = "flagquiz_battle_own_wins";

// Zuletzt in die Bestenliste übertragenes Ergebnis als "code:matchNumber". Muss einen Browser-Reload
// überstehen: seit der Revanche-Funktion bleibt die Battle-Sitzung auch auf dem Endbildschirm
// bestehen (siehe showBattleEndScreen), ein Reload dort baut den Endbildschirm also erneut auf --
// ohne diesen Merker würde derselbe Sieg dabei ein zweites Mal gezählt. Ein einzelner Wert reicht:
// man kann immer nur in genau einem Battle gleichzeitig sein.
const BATTLE_RECORDED_RESULT_KEY = "flagquiz_battle_gewertet";
function loadRecordedBattleResultKey() {
    try { return localStorage.getItem(BATTLE_RECORDED_RESULT_KEY); } catch (e) { return null; }
}
function saveRecordedBattleResultKey(key) {
    try { localStorage.setItem(BATTLE_RECORDED_RESULT_KEY, key); } catch (e) { /* ignorieren */ }
}
function getOwnBattleWins() {
    try { return parseInt(localStorage.getItem(BATTLE_OWN_WINS_KEY), 10) || 0; } catch (e) { return 0; }
}
function incrementOwnBattleWins() {
    try { localStorage.setItem(BATTLE_OWN_WINS_KEY, String(getOwnBattleWins() + 1)); } catch (e) { /* ignorieren */ }
}

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
            winner: null,
            // Revanche-Felder (siehe tryResolveBattleRematch): matchNumber zählt hoch, sobald beide
            // ein weiteres Match wollen; leftA/leftB merken, wer den Endbildschirm verlassen hat,
            // damit der/die andere nicht ins Leere wartet.
            matchNumber: 1,
            rematchA: false, rematchB: false,
            leftA: false, leftB: false
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

// Liefert die zu Rundenbeginn NICHT gewählten Kontinent(e) (aus continents3, abzüglich data.pool) --
// das ist seit dem Feedback-Punkt "Fallen-Flaggen aus fremdem Kontinent" die Quelle für die Fallen-
// Flaggen: Sie sollen aus unbekanntem Terrain kommen, nicht aus dem ohnehin gespielten Kontinent.
// continents3 hat immer 3 Elemente, data.pool höchstens 2 (siehe tryResolveBattlePool) -- die
// Restmenge ist daher rechnerisch immer mit mindestens 1 Kontinent belegt, nie leer.
function battleLeftoverContinents(data) {
    return data.continents3.filter(c => !data.pool.includes(c));
}

// Baut den Anzeigetext für 1-2 Kontinente ("Afrika" bzw. "Afrika und Europa"), analog zum Muster
// in js/standard-settings.js (buildContinentSummary).
function battleContinentListLabel(list) {
    if (list.length === 1) return continentDisplayName(list[0]);
    return list.slice(0, -1).map(continentDisplayName).join(", ") + " " + t("settings.continentAnd") + " " + continentDisplayName(list[list.length - 1]);
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
// Jede Runde wird in ein Objekt {opts: [...]} verpackt statt als nacktes Array zurückzugeben:
// Firestore lehnt Arrays direkt IN einem Array ("nested arrays") mit einem invalid-argument-Fehler
// ab -- das komplette Rundenstart-Update (inkl. sequenceA/sequenceB/status) schlug dadurch bisher
// IMMER fehl, sobald beide Fallen-Flaggen gewählt hatten (Battle blieb für beide dauerhaft im
// Bildschirm "Fallen-Flaggen wählen" hängen, siehe battleCurrentOptionsFor für das Auspacken).
function buildBattleOptionsForSequence(sequence, poolCountries) {
    return sequence.map(flag => {
        const distractors = shuffle(poolCountries.filter(c => c.iso !== flag.iso)).slice(0, 3);
        return { opts: shuffle([{ name: flag.name, iso: flag.iso }, ...distractors]) };
    });
}

// Streut die Fallen-Flaggen-Optionen an dieselben Block-Positionen wie battleBuildIndividualSequence
// (siehe dort) -- WICHTIG: baseOptions ist für A und B identisch (siehe tryResolveBattleStart), damit
// beide bei den 9 "normalen" Runden garantiert exakt dieselben 4 Antwortmöglichkeiten sehen. Nur bei
// den je 3 Fallen-Flaggen-Runden (unterschiedliche richtige Flagge je Spieler:in) werden eigene,
// vorab separat berechnete Optionen eingesetzt.
function battleBuildIndividualOptions(baseOptions, poisonOptions, positions) {
    const blocks = [baseOptions.slice(0, 4), baseOptions.slice(4, 8), baseOptions.slice(8, 12)];
    const result = [];
    blocks.forEach((block, i) => {
        const modified = block.slice();
        modified[positions[i]] = poisonOptions[i];
        result.push(...modified);
    });
    return result;
}

async function tryResolveBattleStart(code) {
    const ref = firestoreDb.collection("battles").doc(code);
    try {
        await firestoreDb.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const data = snap.data();
            if (!data || data.sequenceA || !data.poisonChoiceA || !data.poisonChoiceB || !data.pool) return;
            const poolCountries = countries.filter(c => data.pool.includes(c.continent));
            // Fallen-Flaggen (Länder UND Distraktoren) kommen bewusst aus dem/den NICHT gewählten
            // Kontinent(en), nicht aus dem gespielten Pool (siehe battleLeftoverContinents) --
            // unbekanntes Terrain, das die Falle wirklich unerwartet macht.
            const leftoverCountries = countries.filter(c => battleLeftoverContinents(data).includes(c.continent));
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
            // beide Spieler:innen bei derselben Runde exakt dieselben Optionen sehen. WICHTIG: dafür
            // müssen die Optionen für die 9 "normalen" Runden aus der GEMEINSAMEN Basis-Sequenz
            // (base) berechnet werden, nicht getrennt aus sequenceA/sequenceB -- sonst wird pro Seite
            // unabhängig neu gewürfelt (gleiche richtige Flagge, aber fast immer andere Distraktoren,
            // Bug: A und B sahen dadurch bei den meisten Runden unterschiedliche Antwortmöglichkeiten).
            // Nur die je 3 Fallen-Flaggen-Runden brauchen wirklich getrennte Optionen, da dort auch
            // die richtige Flagge selbst zwischen A und B unterschiedlich ist.
            const baseOptions = buildBattleOptionsForSequence(base, poolCountries);
            // Distraktoren für die Fallen-Runden ebenfalls aus dem fremden Kontinent (leftoverCountries),
            // nicht aus poolCountries -- sonst wäre die einzige "fremd aussehende" Flagge unter drei
            // Distraktoren aus dem gespielten Kontinent optisch sofort als Falle erkennbar.
            const poisonOptionsForA = buildBattleOptionsForSequence(poisonForA, leftoverCountries);
            const poisonOptionsForB = buildBattleOptionsForSequence(poisonForB, leftoverCountries);
            const optionsA = battleBuildIndividualOptions(baseOptions, poisonOptionsForA, poisonPositions);
            const optionsB = battleBuildIndividualOptions(baseOptions, poisonOptionsForB, poisonPositions);
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

            // Sudden-Death-Beschleuniger (Konzept-Feedback Punkt 1A): Beim Übergang Runde 12 -> 13
            // verlieren beide automatisch 1 Leben zusätzlich zur normalen Antwort-Wertung, danach
            // alle weiteren 5 Sudden-Death-Runden nochmal je 1 (wird beim Auflösen von Runde 17/22/27
            // angewendet, sichtbar wird der reduzierte Lebensstand dann ab Runde 18/23/28 -- die
            // 5er-Zählung startet bewusst NACH dem Start-Verlust neu). Nur anwenden, wenn das Duell
            // nicht schon durch die normale Rundenwertung entschieden ist.
            if (livesA > 0 && livesB > 0) {
                const sdRoundIndex = roundNum - 12; // 1 bei Runde 13, 2 bei Runde 14, ...
                const entersSuddenDeath = roundNum === 12;
                const hitsFiveRhythm = sdRoundIndex > 0 && sdRoundIndex % 5 === 0;
                if (entersSuddenDeath || hitsFiveRhythm) {
                    livesA--;
                    livesB--;
                }
            }

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

// ---------- Battle: Revanche ("Noch ein Match") ----------
// Bewusst dasselbe Battle-Dokument (gleicher Code) statt eines neuen: beide Spieler:innen sind
// bereits verbunden, ein erneuter Beitritt per Code/QR wäre unnötiger Umweg. Erst wenn BEIDE den
// Wunsch gesendet haben, wird das Dokument auf einen frischen Match-Zustand zurückgesetzt.
async function requestBattleRematch(code, role) {
    if (!firestoreDb) return;
    const ref = firestoreDb.collection("battles").doc(code);
    const field = role === "A" ? "rematchA" : "rematchB";
    try { await ref.update({ [field]: true }); } catch (e) { console.warn("Revanche-Wunsch konnte nicht gesendet werden.", e); }
    tryResolveBattleRematch(code);
}

async function tryResolveBattleRematch(code) {
    if (!firestoreDb) return;
    const ref = firestoreDb.collection("battles").doc(code);
    try {
        await firestoreDb.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const data = snap.data();
            if (!data || data.status !== "beendet") return;
            if (!data.rematchA || !data.rematchB) return;
            if (data.leftA || data.leftB) return; // jemand ist inzwischen weg -> kein Neustart
            tx.update(ref, {
                // Zählt hoch und ist damit der Auslöser, an dem alle Clients einen Match-Wechsel
                // erkennen (siehe renderBattleFromData / resetBattleRoundState).
                matchNumber: (data.matchNumber || 1) + 1,
                status: "kontinentwahl",
                // Kontinente werden für jedes Match neu gewürfelt -- sonst spielt man dieselben
                // drei zur Auswahl stehenden Kontinente immer wieder.
                continents3: shuffle(continents).slice(0, 3),
                continentChoiceA: null, continentChoiceB: null,
                pool: null,
                poisonChoiceA: null, poisonChoiceB: null,
                sequenceA: null, sequenceB: null,
                optionsA: null, optionsB: null,
                suddenDeathSequence: null, suddenDeathOptions: null,
                livesA: BATTLE_MAX_LIVES, livesB: BATTLE_MAX_LIVES,
                currentRound: 0,
                rounds: {},
                winner: null,
                rematchA: false, rematchB: false,
                // Ablaufzeitpunkt mitverlängern, sonst könnte das Aufräumen abgelaufener Battles
                // (cleanupExpiredBattles) das laufende zweite Match wegräumen.
                expiresAt: firebase.firestore.Timestamp.fromMillis(Date.now() + BATTLE_EXPIRY_HOURS * 3600 * 1000)
            });
        });
    } catch (e) { console.warn("Revanche konnte nicht gestartet werden.", e); }
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
    incrementOwnBattleWins(); // unabhängig vom Top-50-Cap, siehe Kommentar oben
}

async function updateBattleHighscoreDisplay(targetId) {
    const el = document.getElementById(targetId || "battleHighscoreDisplay");
    el.innerHTML = '<div class="highscore-card hs-empty"><span class="trophy">🏆</span><div>' + t("common.loading") + '</div></div>';
    const { list, online } = await fetchTopListCached(BATTLE_HIGHSCORE_KEY);
    const tierIcons = await getLadderTierDeviceIdMap();
    const titleTexts = await getPlayerTitleDeviceIdMap();
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
        const tierIcon = tierIcons.get(entry.deviceId);
        const titleText = titleTexts.get(entry.deviceId);
        const nameHtml = nameWithTitleHtml(entry.name || t("common.anonymous"), tierIcon, titleText);
        return '<div class="hs-row rank-' + rank + '">' +
            '<div class="hs-medal">' + (rank <= 3 ? medals[rank - 1] : rank + ".") + '</div>' +
            '<div class="hs-row-name">' + nameHtml + '</div>' +
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
let battleTitles = new Map(); // dito, für Erfolgs-Titel (js/achievements.js)
// 3-2-1-Los-Countdown + Sudden-Death-Ankündigung (Konzept-Feedback Punkte 1A/1D): battleIntroPlayedFor
// verhindert ein erneutes Abspielen bei jedem Snapshot-Update (z. B. Herzschlag alle 5s), solange
// dieselbe Runde noch aktuell ist. battleIntroGeneration steigt bei stopBattleListener und bricht
// eine noch laufende Sequenz sauber ab (z. B. bei Battle-Abbruch mitten im Countdown).
let battleIntroPlayedFor = null;
let battleIntroActive = false;
let battleIntroGeneration = 0;
const BATTLE_STALE_WARNING_MS = 12000; // ab hier: dezenter Hinweis "Verbindung könnte unterbrochen sein"
const BATTLE_STALE_CLAIM_MS = 45000;   // ab hier: aktive Möglichkeit, das Battle für sich zu werten

// ---------- Revanche-/Match-Zustand (siehe tryResolveBattleRematch) ----------
let battleCurrentMatchNumber = null;   // erkennt den Wechsel auf ein neues Match im selben Dokument
let battleEndRenderedFor = null;       // "code:matchNumber" -- Endbildschirm je Match nur einmal aufbauen
let battleResultRecordedFor = null;    // "code:matchNumber" -- Sieg je Match nur EINMAL in die Bestenliste
let battleResultSaving = false;        // solange true: Revanche-Knopf bleibt gesperrt

// Zeitpunkt, seit dem beide Fallen-Flaggen-Wahlen vorliegen, der Rundenstart aber noch nicht
// aufgelöst wurde. Grundlage für den sichtbaren Hinweis, falls tryResolveBattleStart scheitert --
// die Funktion meldet Fehler bisher nur per console.warn, das Battle bliebe sonst stumm hängen.
let battleStartWaitingSince = null;
const BATTLE_START_STUCK_MS = 10000;

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
            // Gegner gilt als weg -> auch das "verlassen"-Flag setzen, damit auf dem Endbildschirm
            // gleich "Gegner hat das Duell verlassen" steht statt eines Revanche-Knopfs ins Leere.
            const oppLeftField = battleRole === "A" ? "leftB" : "leftA";
            tx.update(ref, { status: "beendet", winner: battleRole, [oppLeftField]: true });
        });
    } catch (e) { console.warn("Sieg wegen Verbindungsabbruch konnte nicht gewertet werden.", e); }
}

function battleGetMyLives(data) { return battleRole === "A" ? data.livesA : data.livesB; }
function battleGetOpponentLives(data) { return battleRole === "A" ? data.livesB : data.livesA; }
// Plain-Text-Variante -- für Stellen, an denen der Name in einen längeren Satz eingebettet wird
// (Banner, Warnhinweise), dort ist kein HTML/kleinere Schriftgröße für den Titel möglich.
function battleNameWithCrown(player, fallback) {
    if (!player) return fallback;
    const tierIcon = battleTierIcons.get(player.deviceId);
    const titleText = battleTitles.get(player.deviceId);
    return (tierIcon ? (tierIcon + " ") : "") + player.name + (titleText ? (" " + titleText) : "");
}
// HTML-Variante (Titel kleiner, siehe .player-title-suffix) -- für die direkten Namens-Labels im
// Battle-Kopfbereich (#battleOwnName/#battleOpponentName).
function battleNameWithCrownHtml(player, fallbackText) {
    if (!player) return escapeHtml(fallbackText);
    const tierIcon = battleTierIcons.get(player.deviceId);
    const titleText = battleTitles.get(player.deviceId);
    return nameWithTitleHtml(player.name, tierIcon, titleText);
}
function battleGetMyName(data) {
    return battleRole === "A" ? battleNameWithCrown(data.playerA, t("battle.you")) : battleNameWithCrown(data.playerB, t("battle.you"));
}
function battleGetOpponentName(data) {
    return battleRole === "A" ? battleNameWithCrown(data.playerB, t("battle.opponent")) : battleNameWithCrown(data.playerA, t("battle.opponent"));
}
function battleGetMyNameHtml(data) {
    return battleRole === "A" ? battleNameWithCrownHtml(data.playerA, t("battle.you")) : battleNameWithCrownHtml(data.playerB, t("battle.you"));
}
function battleGetOpponentNameHtml(data) {
    return battleRole === "A" ? battleNameWithCrownHtml(data.playerB, t("battle.opponent")) : battleNameWithCrownHtml(data.playerA, t("battle.opponent"));
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
        if (opts && opts[roundNum - 1]) return opts[roundNum - 1].opts;
    } else {
        const sdOpts = data.suddenDeathOptions || [];
        if (sdOpts.length > 0) return sdOpts[(roundNum - 13) % sdOpts.length].opts;
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
    battleIntroPlayedFor = null;
    battleIntroActive = false;
    battleIntroGeneration++; // bricht eine evtl. noch laufende Intro-Sequenz sauber ab
    battleCurrentMatchNumber = null;
    battleEndRenderedFor = null;
    battleResultRecordedFor = null;
    battleResultSaving = false;
    battleStartWaitingSince = null;
    const banner = document.getElementById("battleConnectionBanner");
    if (banner) banner.style.display = "none";
}

// Setzt allen Zustand zurück, der an EIN Match gebunden ist -- wird beim Wechsel auf ein neues
// Match im selben Battle-Dokument aufgerufen (Revanche, siehe tryResolveBattleRematch). Ohne diesen
// Reset würden im zweiten Match u. a. die Kontinent-Kacheln und Fallen-Flaggen-Auswahl des ersten
// Matches stehen bleiben (beide Bildschirme bauen ihren Inhalt nur auf, wenn er noch leer ist) und
// der 3-2-1-Countdown gar nicht mehr abspielen.
function resetBattleRoundState() {
    battleLastRenderedRound = -1;
    battleLocalAnswered = false;
    clearInterval(battleCountdownTimer); battleCountdownTimer = null;
    battleLastKnownMyLives = null;
    battleLastKnownOpponentLives = null;
    battleSelectedContinents = [];
    battleSelectedPoison = [];
    battleStartWaitingSince = null;
    battleIntroPlayedFor = null;
    battleIntroActive = false;
    battleEndRenderedFor = null;

    const contBtns = document.getElementById("battleContinentButtons");
    if (contBtns) contBtns.innerHTML = "";
    const poisonGrid = document.getElementById("battlePoisonGrid");
    if (poisonGrid) poisonGrid.innerHTML = "";
    const timerRow = document.getElementById("battleTimerRow");
    if (timerRow) timerRow.classList.remove("timer-active");
    const giftBanner = document.getElementById("battleGiftBanner");
    if (giftBanner) giftBanner.style.display = "none";
}

// Vollbild-Zwischensequenz vor der ersten Runde und vor Sudden Death (Konzept-Feedback Punkte 1A/1D):
// bei Sudden Death zuerst eine kurze Ankündigung ("Sudden Death! Beide verlieren 1 Leben"), danach in
// beiden Fällen ein 3-2-1-Los-Countdown. Rein clientseitig, kein Server-Sync nötig -- ein paar hundert
// Millisekunden Versatz zwischen den Geräten sind für diesen Effekt unerheblich.
function playBattleIntro(isSuddenDeath, onDone) {
    const myGeneration = battleIntroGeneration;
    hideAllScreens();
    setChromeVisible(false);
    const screen = document.getElementById("battleIntroScreen");
    const content = document.getElementById("battleIntroContent");
    screen.style.display = "flex";

    function runCountdown() {
        if (myGeneration !== battleIntroGeneration) return; // Battle inzwischen verlassen/beendet
        const steps = ["3", "2", "1", t("battle.go")];
        let i = 0;
        (function step() {
            if (myGeneration !== battleIntroGeneration) return;
            if (i >= steps.length) {
                screen.style.display = "none";
                onDone();
                return;
            }
            content.innerHTML = '<div id="battleIntroNumber">' + steps[i] + '</div>';
            i++;
            setTimeout(step, 1000);
        })();
    }

    if (isSuddenDeath) {
        content.innerHTML =
            '<div class="battle-sd-announce-emoji">⚔️</div>' +
            '<div id="battleIntroLabel">' + t("battle.suddenDeathAnnounceTitle") + '</div>' +
            '<div id="battleIntroLabel">' + t("battle.suddenDeathAnnounceSub") + '</div>';
        setTimeout(runCountdown, 1800);
    } else {
        runCountdown();
    }
}

function startBattleListener(code, role) {
    battleCode = code; battleRole = role;
    battleLastRenderedRound = -1;
    stopBattleListener();

    getLadderTierDeviceIdMap().then(map => {
        battleTierIcons = map;
        if (battleLastData) renderBattleFromData(battleLastData); // Namen (Tier-Abzeichen) neu einblenden, falls schon etwas gerendert wurde
    });
    getPlayerTitleDeviceIdMap().then(map => {
        battleTitles = map;
        if (battleLastData) renderBattleFromData(battleLastData); // Namen (Erfolgs-Titel) neu einblenden, falls schon etwas gerendert wurde
    });

    const ref = firestoreDb.collection("battles").doc(code);
    battleUnsub = ref.onSnapshot((snap) => {
        if (!snap.exists) {
            // Nach einem beendeten Match bleiben wir mit dem Endbildschirm verbunden (Revanche).
            // Löscht der Gegner dann das Dokument oder räumt es ab, ist das kein Fehlerfall mehr --
            // dann einfach still die Revanche-Möglichkeit zurücknehmen statt eine Warnung zu zeigen.
            const wasEnded = battleLastData && battleLastData.status === "beendet";
            stopBattleListener();
            clearBattleSession();
            if (wasEnded) { renderBattleOpponentLeftNote(); return; }
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

    // Watchdog: regelmäßig prüfen, ob der Gegner seit längerem keinen Herzschlag mehr gesendet hat
    // bzw. ob der Rundenstart ungewöhnlich lange hängt.
    battleWatchdogTimer = setInterval(() => {
        if (battleLastData) {
            updateBattleConnectionWarning(battleLastData);
            renderBattlePoisonWaitNote(battleLastData);
        }
    }, 3000);
}

function renderBattleFromData(data) {
    // Match-Wechsel (Revanche) erkennen: alles an EIN Match gebundene zurücksetzen, bevor
    // irgendein Bildschirm mit den neuen Daten aufgebaut wird.
    const matchNumber = data.matchNumber || 1;
    if (battleCurrentMatchNumber !== matchNumber) {
        battleCurrentMatchNumber = matchNumber;
        resetBattleRoundState();
    }

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
        if (data.poisonChoiceA && data.poisonChoiceB && !data.sequenceA) {
            if (battleStartWaitingSince === null) battleStartWaitingSince = Date.now();
            tryResolveBattleStart(battleCode);
        } else {
            battleStartWaitingSince = null;
        }
        showBattlePoisonScreen(data);
        return;
    }
    if (data.status === "laeuft" || data.status === "suddendeath") {
        battleStartWaitingSince = null;
        // 3-2-1-Los-Countdown vor Runde 1, bzw. Sudden-Death-Ankündigung + Countdown vor Runde 13
        // (siehe playBattleIntro). introKey bindet die Sequenz an genau diese Runde UND an das
        // laufende Match -- ein Reload während einer späteren Runde löst sie NICHT erneut aus, ein
        // erneutes Snapshot-Update während derselben Runde (z. B. Herzschlag) auch nicht
        // (battleIntroPlayedFor-Guard). Ohne matchNumber im Schlüssel bliebe der Countdown bei
        // einer Revanche im selben Battle-Dokument aus.
        const introKey = (data.status === "laeuft" && data.currentRound === 1) ? (battleCode + ":" + matchNumber + ":start")
            : (data.status === "suddendeath" && data.currentRound === 13) ? (battleCode + ":" + matchNumber + ":sd")
            : null;
        if (introKey && battleIntroPlayedFor !== introKey && !battleIntroActive) {
            battleIntroActive = true;
            battleIntroPlayedFor = introKey;
            playBattleIntro(data.status === "suddendeath", () => {
                battleIntroActive = false;
                if (battleLastData) renderBattleFromData(battleLastData);
            });
            return;
        }
        if (battleIntroActive) return;
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
    // Muss explizit zurückgesetzt werden: dieselben DOM-Elemente werden ohne Seiten-Reload für
    // JEDES neue Battle wiederverwendet. Ohne dieses Reset blieb der Hinweis samt Namen des
    // VORHERIGEN Gegners sichtbar, falls man in einem früheren Battle bereits selbst gewählt
    // hatte, bevor man im neuen Battle überhaupt bestätigt hat (siehe Nutzer-Fehlerbericht).
    waitNote.style.display = "none";

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

// Warte-Hinweis im Fallen-Flaggen-Bildschirm: normalerweise "Warte auf {Name} …". Dauert der
// Rundenstart aber ungewöhnlich lange (siehe BATTLE_START_STUCK_MS), wird daraus ein sichtbarer
// Hinweis samt Wiederholen-Knopf. Hintergrund: tryResolveBattleStart() meldet Fehler nur per
// console.warn -- scheitert die Transaktion, bliebe das Battle sonst ohne jede Rückmeldung in
// diesem Bildschirm stehen (genau dieser Fehlerfall ist hier schon einmal aufgetreten).
function renderBattlePoisonWaitNote(data) {
    const screen = document.getElementById("battlePoisonScreen");
    const waitNote = document.getElementById("battlePoisonWaitNote");
    if (!screen || !waitNote || screen.style.display !== "block") return;
    const myChoice = battleRole === "A" ? data.poisonChoiceA : data.poisonChoiceB;
    if (!myChoice) return;

    const stuck = battleStartWaitingSince !== null && (Date.now() - battleStartWaitingSince) >= BATTLE_START_STUCK_MS;
    waitNote.style.display = "block";
    if (!stuck) {
        waitNote.textContent = t("battle.waitingFor").replace("{name}", battleGetOpponentName(data));
        return;
    }
    // Nur einmal aufbauen -- der Watchdog ruft alle 3 s hierher, ein Neuaufbau würde den evtl.
    // schon gedrückten Wiederholen-Knopf jedes Mal wieder freischalten.
    if (document.getElementById("battleStartRetryBtn")) return;
    waitNote.innerHTML = escapeHtml(t("battle.startStuck")) +
        '<br><button type="button" id="battleStartRetryBtn" style="margin-top:8px;">' + escapeHtml(t("battle.startRetry")) + '</button>';
    document.getElementById("battleStartRetryBtn").onclick = function () {
        this.disabled = true;
        battleStartWaitingSince = Date.now();
        tryResolveBattleStart(battleCode);
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

    // Kenntlich machen, welche(r) Kontinent(e) für diese Runde gewählt wurde(n) (Konzept-Feedback
    // Punkt 1C) -- die Fallen-Flaggen selbst kommen bewusst aus dem jeweils ANDEREN Kontinent
    // (siehe battleLeftoverContinents), das wird hier bewusst nicht nochmal extra erklärt.
    const continentNote = document.getElementById("battlePoisonContinentNote");
    if (continentNote) continentNote.textContent = t("battle.continentsChosenNote").replace("{continents}", battleContinentListLabel(data.pool));

    if (myChoice) {
        renderBattlePoisonWaitNote(data);
        submitBtn.style.display = "none";
        Array.from(grid.children).forEach(el => el.style.pointerEvents = "none");
        return;
    }
    // Siehe Kommentar in showBattleContinentScreen: ohne diesen Reset blieb der Warte-Hinweis
    // (inkl. Name) eines vorherigen Battles sichtbar, bevor im neuen Battle selbst bestätigt wurde.
    waitNote.style.display = "none";

    if (grid.children.length === 0) {
        battleSelectedPoison = [];
        // Auswahl kommt aus dem/den NICHT gewählten Kontinent(en), nicht aus data.pool (siehe
        // battleLeftoverContinents) -- die Fallen-Flaggen sollen unbekanntes Terrain sein.
        const leftoverCountries = countries.filter(c => battleLeftoverContinents(data).includes(c.continent));
        leftoverCountries.forEach(c => {
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

    document.getElementById("battleOwnName").innerHTML = battleGetMyNameHtml(data);
    document.getElementById("battleOpponentName").innerHTML = battleGetOpponentNameHtml(data);

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
    // Antwortoptionen werden gemeinsam mit der Sequenz in EINER Transaktion geschrieben
    // (tryResolveBattleStart) -- fehlen sie, ist das Dokument noch nicht vollständig. Früher wurde
    // an dieser Stelle ersatzweise lokal gewürfelt; das führte zu unterschiedlichen Antwort-
    // möglichkeiten bei beiden Spieler:innen, ohne dass es jemand bemerkt hätte. Lieber kurz warten.
    const options = battleCurrentOptionsFor(data, roundNum);
    if (!myFlag || !options) {
        document.getElementById("battleMcOptions").innerHTML = "";
        document.getElementById("battleWaitingForOpponentNote").textContent = t("battle.preparingRound");
        battleLastRenderedRound = -1; // beim nächsten Snapshot erneut versuchen
        return;
    }

    if (roundNum !== battleLastRenderedRound) {
        battleLastRenderedRound = roundNum;
        battleLocalAnswered = false;
        // Muss auch auf null gesetzt werden: die Prüfung "!battleCountdownTimer" weiter unten würde
        // einen stehengebliebenen Zeitgeber-Verweis sonst als "läuft schon" deuten und den
        // Countdown der neuen Runde gar nicht erst starten.
        clearInterval(battleCountdownTimer);
        battleCountdownTimer = null;
        document.getElementById("battleTimerRow").classList.remove("timer-active");
        document.getElementById("battleWaitingForOpponentNote").textContent = "";

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

        // Ausschließlich die serverseitig vorberechneten Optionen nutzen (siehe oben), damit beide
        // Spieler:innen bei derselben Runde exakt dieselben Antwortmöglichkeiten sehen.
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

    // Fallen-Hinweis bewusst AUSSERHALB des Runden-Blocks: Tier-Abzeichen und Erfolgs-Titel des
    // Gegners werden asynchron nachgeladen (siehe startBattleListener) und lösen danach ein
    // erneutes Rendern aus -- stünde der Hinweis im Runden-Block, bliebe der Name darin veraltet.
    // Hinweis zur Spielmechanik: die Fallen sitzen bei A und B an derselben Position im Block,
    // beide bekommen die Falle des jeweils anderen also in derselben Runde.
    const giftBanner = document.getElementById("battleGiftBanner");
    if (myFlag.isPoison) {
        giftBanner.style.display = "block";
        giftBanner.textContent = t("battle.trapFrom").replace("{name}", battleGetOpponentName(data));
    } else {
        giftBanner.style.display = "none";
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
    document.getElementById("battleTimerRow").classList.remove("timer-active");
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
    timerRow.classList.add("timer-active");
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

// WICHTIG: Der Firestore-Listener läuft hier bewusst WEITER (früher wurde er an dieser Stelle
// beendet und die Sitzung gelöscht) -- nur so kann der Revanche-Wunsch des Gegners überhaupt
// ankommen. Beendet wird erst beim Verlassen des Endbildschirms (siehe leaveBattleAfterEnd).
// Dadurch kann diese Funktion pro Match mehrfach aufgerufen werden (jeder Herzschlag des Gegners
// erzeugt ein Snapshot-Update) -- Aufbau und Sieg-Wertung sind deshalb je Match abgesichert.
async function showBattleEndScreen(data) {
    clearInterval(battleCountdownTimer);
    battleCountdownTimer = null;
    if (document.getElementById("battleEndScreen").style.display !== "block") {
        hideAllScreens();
        setChromeVisible(true);
        setNicknameCardVisible(false);
        document.getElementById("battleEndScreen").style.display = "block";
    }

    const matchKey = battleCode + ":" + (data.matchNumber || 1);
    if (battleEndRenderedFor !== matchKey) {
        battleEndRenderedFor = matchKey;
        const el = document.getElementById("battleEndContent");
        if (data.winner === "unentschieden") {
            el.innerHTML = '<div class="battle-end-emoji">🤝</div><h2>' + t("battle.drawTitle") + '</h2><p>' + t("battle.drawSub") + '</p>';
        } else if (data.winner === battleRole) {
            el.innerHTML = '<div class="battle-end-emoji">🏆</div><h2>' + t("battle.winTitle") + '</h2><p>' + t("battle.winSub") + '</p>';
        } else {
            el.innerHTML = '<div class="battle-end-emoji">💔</div><h2>' + t("battle.loseTitle") + '</h2><p>' + t("battle.loseSub") + '</p>';
        }
    }

    // Sieg genau EINMAL je Match in die Bestenliste übertragen. Beide Merker werden synchron VOR dem
    // await gesetzt -- ohne das würde jedes weitere Snapshot-Update, das eintrifft, während
    // recordBattleWin() noch läuft, denselben Sieg ein zweites Mal zählen. Der zusätzliche
    // localStorage-Merker deckt den Reload auf dem Endbildschirm ab (siehe oben).
    const needsRecording = data.winner === battleRole
        && battleResultRecordedFor !== matchKey
        && loadRecordedBattleResultKey() !== matchKey;
    if (needsRecording) {
        battleResultRecordedFor = matchKey;
        saveRecordedBattleResultKey(matchKey);
        battleResultSaving = true;
    }
    renderBattleRematchBox(data);
    if (needsRecording) {
        await recordBattleWin();
        battleResultSaving = false;
        checkForNewAchievements(); // Battle-Erfolge hängen genau an diesem Sieg-Zähler
        if (battleLastData) renderBattleRematchBox(battleLastData);
    }
}

// Revanche-Bereich unter dem Ergebnis: Knopf, Warte-Hinweis oder "Gegner hat das Duell verlassen".
function renderBattleRematchBox(data) {
    const box = document.getElementById("battleRematchBox");
    if (!box) return;
    const myLeft = battleRole === "A" ? data.leftA : data.leftB;
    const oppLeft = battleRole === "A" ? data.leftB : data.leftA;
    const myWish = battleRole === "A" ? data.rematchA : data.rematchB;
    const oppWish = battleRole === "A" ? data.rematchB : data.rematchA;

    if (oppLeft) { renderBattleOpponentLeftNote(); return; }
    if (myLeft) { box.innerHTML = ""; return; }

    let html = "";
    if (oppWish && !myWish) {
        html += '<div class="battle-rematch-note battle-rematch-note-active">' +
            escapeHtml(t("battle.rematchOpponentWants").replace("{name}", battleGetOpponentName(data))) + '</div>';
    }
    if (myWish) {
        html += '<div class="battle-rematch-note">' + escapeHtml(t("battle.waitingFor").replace("{name}", battleGetOpponentName(data))) + '</div>';
    } else if (battleResultSaving) {
        // Erst freigeben, wenn der Sieg wirklich in der Bestenliste steht -- sonst könnte ein sehr
        // schneller Neustart das Ergebnis überholen.
        html += '<button type="button" id="battleRematchBtn" disabled>' + escapeHtml(t("battle.savingResult")) + '</button>';
    } else {
        html += '<button type="button" id="battleRematchBtn">' + escapeHtml(t("battle.rematchButton")) + '</button>';
    }
    box.innerHTML = html;

    const btn = document.getElementById("battleRematchBtn");
    if (btn && !btn.disabled) {
        btn.onclick = function () {
            this.disabled = true;
            requestBattleRematch(battleCode, battleRole);
        };
    }
}

function renderBattleOpponentLeftNote() {
    const box = document.getElementById("battleRematchBox");
    if (!box) return;
    box.innerHTML = '<div class="battle-rematch-note">' + escapeHtml(t("battle.opponentLeft")) + '</div>';
}

// Verlassen des Endbildschirms: erst die Verbindung sauber beenden, dann das "verlassen"-Flag
// setzen, damit der Gegner nicht vergeblich auf eine Revanche wartet.
function leaveBattleAfterEnd() {
    const code = battleCode, role = battleRole;
    stopBattleListener();
    clearBattleSession();
    goToMultiPlayerMenu();
    if (code && role && firestoreDb) {
        const updates = {};
        updates[role === "A" ? "leftA" : "leftB"] = true;
        updates[role === "A" ? "rematchA" : "rematchB"] = false;
        firestoreDb.collection("battles").doc(code).update(updates).catch(() => { /* Battle evtl. schon weg */ });
    }
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
        // Auch das eigene "verlassen"-Flag setzen: der Gegner landet dadurch mit dem Hinweis
        // "Gegner hat das Duell verlassen" im Endbildschirm statt mit einem Revanche-Knopf,
        // auf den nie jemand antworten wird.
        const myLeftField = battleRole === "A" ? "leftA" : "leftB";
        await firestoreDb.collection("battles").doc(battleCode).update({ status: "beendet", winner: opponentRole, [myLeftField]: true });
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

document.getElementById("battleEndRestartBtn").onclick = function () { leaveBattleAfterEnd(); };
document.getElementById("forfeitFromBattleContinent").onclick = () => forfeitBattle();
document.getElementById("forfeitFromBattlePoison").onclick = () => forfeitBattle();
document.getElementById("forfeitFromBattleGame").onclick = () => forfeitBattle();

