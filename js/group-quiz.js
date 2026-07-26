// ---------- Gruppenquiz (Sitzungen für Lehrkräfte/Gruppenleiter:innen) ----------
const GROUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne O/0, I/1 zur besseren Lesbarkeit
const GROUP_LEADER_SESSION_KEY = "flagquiz_leader_session"; // { code, leaderToken }
const GROUP_PLAYER_SESSION_KEY = "flagquiz_group_session";   // { code }
const GROUP_EXPIRY_HOURS = 12;

function generateGroupCode() {
    let code = "";
    for (let i = 0; i < 5; i++) {
        code += GROUP_CODE_ALPHABET[Math.floor(Math.random() * GROUP_CODE_ALPHABET.length)];
    }
    return code;
}

function generateLeaderToken() {
    return (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : ("lt-" + Date.now() + "-" + Math.random().toString(36).slice(2));
}

function getLeaderSession() {
    try {
        const raw = localStorage.getItem(GROUP_LEADER_SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}
function saveLeaderSession(session) {
    try { localStorage.setItem(GROUP_LEADER_SESSION_KEY, JSON.stringify(session)); } catch (e) { /* ignorieren */ }
}
function clearLeaderSession() {
    try { localStorage.removeItem(GROUP_LEADER_SESSION_KEY); } catch (e) { /* ignorieren */ }
}

function getPlayerGroupSession() {
    try {
        const raw = localStorage.getItem(GROUP_PLAYER_SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}
function savePlayerGroupSession(session) {
    try { localStorage.setItem(GROUP_PLAYER_SESSION_KEY, JSON.stringify(session)); } catch (e) { /* ignorieren */ }
}
function clearPlayerGroupSession() {
    try { localStorage.removeItem(GROUP_PLAYER_SESSION_KEY); } catch (e) { /* ignorieren */ }
}

// Räumt beiläufig alte, abgelaufene Gruppen auf. Wird beim Erstellen einer neuen Gruppe
// angestoßen, läuft im Hintergrund und darf ruhig scheitern -- ist nur "Kür", keine Voraussetzung
// (die eigentliche Löschung übernimmt zusätzlich eine TTL-Regel serverseitig in Firestore).
async function cleanupExpiredGroups() {
    if (!firestoreDb) return;
    try {
        const now = firebase.firestore.Timestamp.now();
        const snap = await firestoreDb.collection("gruppen").where("expiresAt", "<", now).limit(10).get();
        for (const doc of snap.docs) {
            try {
                const ergebnisseSnap = await doc.ref.collection("ergebnisse").get();
                for (const eDoc of ergebnisseSnap.docs) {
                    try { await eDoc.ref.delete(); } catch (e) { /* ignorieren */ }
                }
                const teilnehmerSnap = await doc.ref.collection("teilnehmer").get();
                for (const tDoc of teilnehmerSnap.docs) {
                    try { await tDoc.ref.delete(); } catch (e) { /* ignorieren */ }
                }
                await doc.ref.delete();
            } catch (e) { /* evtl. schon gelöscht o. ä., ignorieren */ }
        }
    } catch (e) {
        console.warn("Aufräumen alter Gruppen fehlgeschlagen (nicht kritisch).", e);
    }
}

// Erstellt eine neue Gruppe mit zufälligem Code und geheimem Leiter-Token (nur lokal gespeichert).
async function createGroup() {
    if (!firestoreDb) return null;
    cleanupExpiredGroups(); // nebenbei, nicht abwarten
    const leaderToken = generateLeaderToken();
    const expiresAt = firebase.firestore.Timestamp.fromMillis(Date.now() + GROUP_EXPIRY_HOURS * 3600 * 1000);
    let code, ref, exists = true, attempts = 0;
    do {
        code = generateGroupCode();
        ref = firestoreDb.collection("gruppen").doc(code);
        const snap = await ref.get();
        exists = snap.exists;
        attempts++;
    } while (exists && attempts < 5);

    await ref.set({
        leaderToken: leaderToken,
        status: "warten",
        round: 1,
        createdAt: firebase.firestore.Timestamp.now(),
        expiresAt: expiresAt
    });
    // Einstellungen erst per separatem update() nachreichen: Die Firestore-Sicherheitsregeln
    // erlauben beim Erstellen (create) nur genau die 5 Felder oben — ein zusätzliches
    // "settings"-Feld direkt im ersten Schreibvorgang würde daran scheitern. Per update()
    // (erlaubt, sobald das leaderToken passt) klappt es unmittelbar danach, ohne auf die
    // sonst übliche 400ms-Verzögerung der Live-Synchronisierung warten zu müssen.
    try {
        await ref.update({
            leaderToken: leaderToken,
            settings: {
                continents: settings.continents,
                length: settings.length,
                mode: settings.mode,
                learningMode: settings.learningMode,
                proMode: settings.proMode,
                speedMode: settings.speedMode
            }
        });
    } catch (e) {
        console.warn("Einstellungen konnten nicht direkt bei Gruppenerstellung gesetzt werden.", e);
    }

    const session = { code: code, leaderToken: leaderToken };
    saveLeaderSession(session);
    return session;
}

// Schließt die eigene Gruppe (nur möglich mit passendem Leiter-Token) und räumt ihre Ergebnisse auf.
async function closeGroup() {
    const session = getLeaderSession();
    if (!session) return;
    if (firestoreDb) {
        try {
            await firestoreDb.collection("gruppen").doc(session.code).update({
                leaderToken: session.leaderToken,
                status: "beendet",
                expiresAt: firebase.firestore.Timestamp.now()
            });
            // Ergebnisse und Teilnehmerliste der Gruppe löschen (jetzt erlaubt, da status == 'beendet')
            const ergebnisseSnap = await firestoreDb.collection("gruppen").doc(session.code).collection("ergebnisse").get();
            for (const eDoc of ergebnisseSnap.docs) {
                try { await eDoc.ref.delete(); } catch (e) { /* ignorieren */ }
            }
            const teilnehmerSnap = await firestoreDb.collection("gruppen").doc(session.code).collection("teilnehmer").get();
            for (const tDoc of teilnehmerSnap.docs) {
                try { await tDoc.ref.delete(); } catch (e) { /* ignorieren */ }
            }
        } catch (e) {
            console.warn("Gruppe konnte nicht sauber geschlossen werden, wird trotzdem lokal beendet.", e);
        }
    }
    clearLeaderSession();
}

// Prüft einen eingegebenen Code und tritt der Gruppe bei, falls sie existiert und aktiv ist.
async function joinGroupByCode(code) {
    if (!firestoreDb) return { ok: false, reason: "offline" };
    const cleanCode = (code || "").trim().toUpperCase();
    if (cleanCode.length !== 5) return { ok: false, reason: "format" };
    try {
        const snap = await firestoreDb.collection("gruppen").doc(cleanCode).get();
        if (!snap.exists) return { ok: false, reason: "not_found" };
        const data = snap.data();
        const now = Date.now();
        const expiresMs = (data.expiresAt && data.expiresAt.toMillis) ? data.expiresAt.toMillis() : 0;
        if (data.status === "beendet" || expiresMs < now) return { ok: false, reason: "closed" };
        savePlayerGroupSession({ code: cleanCode });
        return { ok: true, code: cleanCode };
    } catch (e) {
        console.warn("Beitritt zum Gruppenquiz fehlgeschlagen.", e);
        return { ok: false, reason: "error" };
    }
}

// Sendet die aktuellen Einstellungen an Firestore, falls dieses Gerät gerade eine Gruppe leitet.
// Leicht entprellt, damit schnelles Klicken (z. B. mehrere Kontinente hintereinander) nicht zu viele Schreibzugriffe auslöst.
let groupSettingsSyncTimer = null;
function syncGroupSettingsIfLeader() {
    const session = getLeaderSession();
    if (!session || !firestoreDb) return;
    clearTimeout(groupSettingsSyncTimer);
    groupSettingsSyncTimer = setTimeout(async () => {
        try {
            await firestoreDb.collection("gruppen").doc(session.code).update({
                leaderToken: session.leaderToken,
                settings: {
                    continents: settings.continents,
                    length: settings.length,
                    mode: settings.mode,
                    learningMode: settings.learningMode,
                    proMode: settings.proMode,
                    speedMode: settings.speedMode
                }
            });
        } catch (e) {
            console.warn("Einstellungen konnten nicht an die Gruppe gesendet werden.", e);
        }
    }, 400);
}

// Gibt das Spiel für die Mitspieler:innen der eigenen Gruppe frei (Status "warten" -> "laeuft").
async function releaseGroupForPlaying() {
    const session = getLeaderSession();
    if (!session || !firestoreDb) return;
    try {
        await firestoreDb.collection("gruppen").doc(session.code).update({
            leaderToken: session.leaderToken,
            status: "laeuft",
            releasedAt: firebase.firestore.Timestamp.now()
        });
    } catch (e) {
        console.warn("Spiel konnte nicht freigegeben werden.", e);
        alert(t("group.releaseFailedAlert"));
    }
}

// Startet eine neue Runde für die Gruppe: Rundenzähler erhöhen, damit eine frische
// rundenbezogene Bestenliste beginnt (die Gesamtwertung über alle Runden bleibt erhalten).
async function advanceGroupRound(session, currentRound) {
    if (!firestoreDb) return;
    try {
        await firestoreDb.collection("gruppen").doc(session.code).update({
            leaderToken: session.leaderToken,
            status: "laeuft",
            round: currentRound + 1,
            releasedAt: firebase.firestore.Timestamp.now()
        });
    } catch (e) {
        console.warn("Neue Runde konnte nicht gestartet werden.", e);
        alert(t("group.nextRoundFailedAlert"));
    }
}

// Aktuelle Rundennummer der Gruppe, wird über den Live-Listener der Mitspieler:innen aktuell gehalten.
let currentGroupRound = 1;

// Speichert das eigene Ergebnis unter der eigenen Geräte-ID in der Gruppe. Pro Runde zählt nur
// der eigene Bestwert (mehrfaches Spielen derselben Runde verbessert höchstens den Eintrag).
async function submitGroupResult(playerName, roundScore) {
    const playerSession = getPlayerGroupSession();
    if (!playerSession || !firestoreDb) return;
    const code = playerSession.code;
    const deviceId = getDeviceId();
    const ref = firestoreDb.collection("gruppen").doc(code).collection("ergebnisse").doc(deviceId);
    try {
        const snap = await ref.get();
        const existing = snap.exists ? snap.data() : {};
        const roundScores = Object.assign({}, existing.roundScores || {});
        const roundKey = String(currentGroupRound);
        if (!(roundKey in roundScores) || roundScore > roundScores[roundKey]) {
            roundScores[roundKey] = roundScore;
        }
        await ref.set({
            name: playerName,
            roundScores: roundScores,
            updatedAt: firebase.firestore.Timestamp.now()
        });
    } catch (e) {
        console.warn("Gruppenergebnis konnte nicht gespeichert werden.", e);
    }
}

// Baut die HTML-Ansicht der Gruppen-Bestenliste (Runde + Gesamtwertung) aus den Rohdaten.
// tierIcons (Map Geräte-ID -> Gipfelsturm-Tier-Abzeichen) wird einmal vorab abgerufen und
// durchgereicht, statt hier erneut asynchron nachzuladen (siehe startGroupHighscoreLive).
function buildGroupHighscoreHtml(docsData, round, tierIcons) {
    const roundList = [];
    const totalList = [];
    docsData.forEach(d => {
        const name = d.name || t("common.anonymous");
        const tierIcon = tierIcons && tierIcons.get(d.id);
        const crown = tierIcon ? (tierIcon + " ") : "";
        const rs = d.roundScores || {};
        const roundScore = rs[String(round)];
        if (typeof roundScore === "number") roundList.push({ name, crown, score: roundScore });
        const total = Object.values(rs).reduce((sum, v) => sum + (typeof v === "number" ? v : 0), 0);
        if (total > 0) totalList.push({ name, crown, score: total });
    });
    roundList.sort((a, b) => b.score - a.score);
    totalList.sort((a, b) => b.score - a.score);

    function renderRows(rows) {
        if (rows.length === 0) return `<div style="color:#666;font-size:13px;padding:6px 0;">${t("group.noEntries")}</div>`;
        const medals = ["🥇", "🥈", "🥉"];
        return '<div class="hs-row-list">' + rows.map((e, i) => `
            <div class="hs-row rank-${i + 1}">
                <div class="hs-medal">${i < 3 ? medals[i] : (i + 1) + "."}</div>
                <div class="hs-row-name">${e.crown}${escapeHtml(e.name)}</div>
                <div class="hs-row-score">${e.score} ${t("highscore.points")}</div>
            </div>`).join("") + '</div>';
    }

    return `
        <div class="highscore-card" style="margin-bottom:14px;">
            <div class="hs-card-title">${t("group.thisRound").replace("{n}", round)}</div>
            ${renderRows(roundList)}
        </div>
        <div class="highscore-card">
            <div class="hs-card-title">${t("group.overallScore")}</div>
            ${renderRows(totalList)}
        </div>`;
}

// Zeigt die Gruppen-Bestenliste live in einem Container an (endScreen-Box oder Modal).
// getRound ist eine Funktion, damit bei Rundenwechseln immer die aktuelle Nummer verwendet wird.
let groupHighscoreUnsub = null;
function startGroupHighscoreLive(containerEl, code, getRound) {
    stopGroupHighscoreLive();
    if (!firestoreDb) return;
    containerEl.innerHTML = '<div class="highscore-card hs-empty"><span class="trophy">🏆</span><div>' + t("group.highscoreLoading") + '</div></div>';
    groupHighscoreUnsub = firestoreDb.collection("gruppen").doc(code).collection("ergebnisse").onSnapshot(
        async (snap) => {
            const docsData = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
            const tierIcons = await getLadderTierDeviceIdMap();
            containerEl.innerHTML = buildGroupHighscoreHtml(docsData, getRound(), tierIcons);
        },
        (e) => {
            console.warn("Gruppen-Bestenliste nicht erreichbar.", e);
            containerEl.innerHTML = '<div class="highscore-card hs-empty"><span class="trophy">⚠️</span><div>' + t("group.highscoreUnavailable") + '</div></div>';
        }
    );
}
function stopGroupHighscoreLive() {
    if (groupHighscoreUnsub) { groupHighscoreUnsub(); groupHighscoreUnsub = null; }
}

// Zeigt die Teilnehmer:innen-Liste der Gruppe live in der Leiter-Ansicht an (Nummer + Name),
// inkl. grünem Häkchen sobald jemand die aktuelle Runde beendet hat.
let groupRosterUnsub = null;
let groupRosterErgebnisseUnsub = null;
let groupRosterTeilnehmerDocs = [];
let groupRosterErgebnisseDocs = [];
let groupRosterGetRound = () => 1;
let groupRosterContainerEl = null;
let groupRosterTierIcons = new Map(); // wird beim Start der Live-Ansicht einmal geladen, siehe startGroupRosterLive

function renderGroupRosterCombined() {
    if (!groupRosterContainerEl) return;
    const round = groupRosterGetRound();
    const finishedIds = new Set();
    groupRosterErgebnisseDocs.forEach(doc => {
        const rs = doc.data().roundScores || {};
        if (String(round) in rs) finishedIds.add(doc.id);
    });
    if (groupRosterTeilnehmerDocs.length === 0) {
        groupRosterContainerEl.innerHTML = '<div class="glb-roster-empty">' + t("group.rosterEmpty") + '</div>';
        return;
    }
    const rows = groupRosterTeilnehmerDocs.map((d, i) =>
        '<div class="glb-roster-row"><span style="color:var(--text-muted);width:22px;flex-shrink:0;">' + (i + 1) + '.</span>' +
        '<span style="flex:1;">' + (groupRosterTierIcons.get(d.id) ? (groupRosterTierIcons.get(d.id) + ' ') : '') + escapeHtml(d.data().name || t("common.anonymous")) + '</span>' +
        (finishedIds.has(d.id) ? '<span style="color:var(--color-secondary);">✅</span>' : '')
        + '</div>'
    ).join("");
    groupRosterContainerEl.innerHTML =
        '<div style="font-size:13px;font-weight:600;margin-bottom:6px;color:var(--text-secondary);">' +
        t("group.rosterSummary").replace("{joined}", groupRosterTeilnehmerDocs.length).replace("{finished}", finishedIds.size).replace("{round}", round) +
        '</div>' +
        '<div style="max-height:220px;overflow-y:auto;">' + rows + '</div>';
    if (typeof window.__groupUpdateReleaseGate === "function") window.__groupUpdateReleaseGate();
}

function startGroupRosterLive(code, containerEl, getRound) {
    if (!firestoreDb || !containerEl) return;
    groupRosterContainerEl = containerEl;
    groupRosterGetRound = getRound || (() => 1);
    groupRosterTeilnehmerDocs = [];
    groupRosterErgebnisseDocs = [];
    containerEl.innerHTML = '<div style="font-size:13px;color:#666;">' + t("group.loadingParticipants") + '</div>';

    getLadderTierDeviceIdMap().then(map => {
        groupRosterTierIcons = map;
        renderGroupRosterCombined();
    });

    groupRosterUnsub = firestoreDb.collection("gruppen").doc(code).collection("teilnehmer")
        .orderBy("joinedAt", "asc")
        .onSnapshot((snap) => {
            groupRosterTeilnehmerDocs = snap.docs;
            renderGroupRosterCombined();
        }, (e) => {
            console.warn("Teilnehmerliste nicht erreichbar.", e);
            containerEl.innerHTML = '<div style="font-size:13px;color:#c62828;">' + t("group.rosterUnavailable") + '</div>';
        });

    groupRosterErgebnisseUnsub = firestoreDb.collection("gruppen").doc(code).collection("ergebnisse")
        .onSnapshot((snap) => {
            groupRosterErgebnisseDocs = snap.docs;
            renderGroupRosterCombined();
        }, (e) => {
            console.warn("Fertig-Status für Teilnehmerliste nicht erreichbar.", e);
        });
}

function stopGroupRosterLive() {
    if (groupRosterUnsub) { groupRosterUnsub(); groupRosterUnsub = null; }
    if (groupRosterErgebnisseUnsub) { groupRosterErgebnisseUnsub(); groupRosterErgebnisseUnsub = null; }
    groupRosterContainerEl = null;
    groupRosterTeilnehmerDocs = [];
    groupRosterErgebnisseDocs = [];
}

// Sperrt "Gruppenquiz starten" und "Gruppenquiz beitreten", solange dieses Gerät bereits eine
// Gruppe leitet oder einer Gruppe beigetreten ist (verhindert widersprüchliche Doppelrollen).
// Nutzt getElementById direkt, damit die Funktion unabhängig von der Deklarationsreihenfolge
// der const-Referenzen weiter unten im Skript sicher aufgerufen werden kann.
function updateGroupEntryLinksState() {
    const locked = !!getLeaderSession() || isGroupPlayer;
    ["groupCreateLink", "groupJoinLink"].forEach(id => {
        const link = document.getElementById(id);
        if (!link) return;
        link.style.pointerEvents = locked ? "none" : "";
        link.style.opacity = locked ? "0.4" : "";
        link.title = locked ? t("group.alreadyActiveShort") : "";
    });
    // Sichtbare Kacheln in Mehrspieler-Menü und Gruppenquiz-Einstiegsbildschirm ebenfalls sperren,
    // damit ein Klick nicht einfach folgenlos ins Leere läuft (siehe Hinweis bei backFromStandardSettings).
    ["tileGroup", "tileGroupCreate", "tileGroupJoin"].forEach(id => {
        const tile = document.getElementById(id);
        if (!tile) return;
        tile.disabled = locked;
        tile.classList.toggle("disabled", locked);
        tile.title = locked ? t("group.alreadyActiveLong") : "";
    });
}

// Zeigt den gemeinsamen Einstiegsbildschirm für "Gruppenspiel leiten" / "Gruppenspiel beitreten"
// (Ebene 2b-Detail, nach dem Muster des 1vs1-Battle-Einstiegs) — die eigentliche Leiten-/
// Beitreten-Logik läuft unverändert über die bestehenden Modals (groupCreateLink/groupJoinLink).
function goToGroupEntryScreen() {
    hideAllScreens();
    setChromeVisible(true);
    document.getElementById("groupEntryScreen").style.display = "block";
    updateGroupEntryLinksState();
}

document.getElementById("tileGroup").onclick = () => goToGroupEntryScreen();
document.getElementById("backFromGroupEntry").onclick = () => goToMultiPlayerMenu();

// ---------- Gruppenquiz: Sperr-UI für Mitspieler:innen ----------
let isGroupPlayer = false;
let groupPlayerUnsub = null;
// Merkt sich, welche Rundennummer dieses Gerät zuletzt gestartet hat. Damit bleibt der
// Start-Button gesperrt, sobald die Runde einmal gespielt wurde — auch wenn der Status in
// Firestore weiterhin "laeuft" ist — bis die Gruppenleitung die nächste Runde freigibt.
let lastPlayedGroupRound = null;
let lastKnownGroupStatus = "warten";

// Aktualisiert Text/Sperre des Start-Buttons anhand von Rundenstatus + bereits gespielter Runde.
function updateGroupStartButtonUI() {
    if (!isGroupPlayer) return;
    const alreadyPlayedThisRound = lastPlayedGroupRound !== null && lastPlayedGroupRound === currentGroupRound;
    const canStart = lastKnownGroupStatus === "laeuft" && !alreadyPlayedThisRound;
    startBtn.disabled = !canStart;
    startBtn.textContent = canStart
        ? t("group.start")
        : (alreadyPlayedThisRound ? t("group.startWaitingRound") : t("group.startWaitingRelease"));
}

function setGroupPlayerLockUI(locked) {
    [continentButtons, lengthButtons, modeButtons, learningModeToggle, proModeToggle, speedModeToggle].forEach(el => {
        if (!el) return;
        el.style.pointerEvents = locked ? "none" : "";
        el.style.opacity = locked ? "0.5" : "";
    });
    updateStandardBackArrowVisibility();
    // Mitspieler:innen brauchen keine eigenen Einstellungen zu sehen — die Accordion-Karten
    // werden für sie komplett ausgeblendet, damit die Seite minimal bleibt.
    const accordion = document.querySelector(".settings-accordion");
    if (accordion) accordion.style.display = locked ? "none" : "";
    settingsDiv.classList.toggle("group-locked", locked);
}

// Übernimmt die von der Gruppenleitung gewählten Einstellungen und aktualisiert die (gesperrte) Ansicht.
function applyGroupSettingsFromDoc(data) {
    const s = data && data.settings;
    if (!s) return;
    if (Array.isArray(s.continents)) {
        const valid = s.continents.filter(c => continents.includes(c));
        if (valid.length > 0) settings.continents = valid;
    }
    if (typeof s.length === "number" && [10, 20, 30, 50].includes(s.length)) settings.length = s.length;
    if (["mc", "reverse-mc", "text", "mixed"].includes(s.mode)) settings.mode = s.mode;
    if (typeof s.learningMode === "boolean") settings.learningMode = s.learningMode;
    if (typeof s.proMode === "boolean") settings.proMode = s.proMode;
    if (typeof s.speedMode === "boolean") settings.speedMode = s.speedMode;
    buildSettingsScreen();
    setGroupPlayerLockUI(true); // buildSettingsScreen setzt Handler neu, Sperre danach erneut anwenden
}

function renderGroupPlayerBanner(code, status) {
    const groupPlayerBanner = document.getElementById("groupPlayerBanner");
    groupPlayerBanner.style.display = "block";
    const isReady = status === "laeuft";
    groupPlayerBanner.innerHTML =
        '<div class="gpb-badge">CODE ' + escapeHtml(code) + '</div>' +
        '<div class="gpb-title">' + (isReady ? t("group.readyTitle") : t("group.joinedTitle")) + '</div>' +
        (isReady ? '' : '<div class="gpb-spinner"></div>') +
        '<div class="gpb-text">' +
        (isReady ? t("group.readyText") : t("group.waitingText")) +
        '</div>' +
        '<div style="margin-top:14px;"><a href="#" id="groupLeaveLink" style="font-size:13px;color:var(--color-danger);">' + t("group.leaveLink") + '</a></div>';
    document.getElementById("groupLeaveLink").onclick = function (e) {
        e.preventDefault();
        leaveGroupPlayerMode(false);
    };
}

// Trägt dieses Gerät als Teilnehmer:in in der Gruppe ein (Name + Beitrittszeitpunkt), damit die
// Gruppenleitung live sehen kann, wer schon da ist. Läuft nebenbei, blockiert die UI nicht.
async function registerAsGroupParticipant(code) {
    if (!firestoreDb) return;
    const deviceId = getDeviceId();
    const rawName = nicknameInput.value.trim();
    const name = (!rawName || containsBlockedContent(rawName)) ? generateFantasyName() : rawName;
    const ref = firestoreDb.collection("gruppen").doc(code).collection("teilnehmer").doc(deviceId);
    try {
        const snap = await ref.get();
        if (snap.exists) {
            await ref.update({ name: name });
        } else {
            await ref.set({ name: name, joinedAt: firebase.firestore.Timestamp.now() });
        }
    } catch (e) {
        console.warn("Konnte nicht als Teilnehmer:in registriert werden.", e);
    }
}

// Trägt dieses Gerät wieder aus der Teilnehmer:innen-Liste aus (z. B. beim freiwilligen Verlassen).
async function unregisterGroupParticipant(code) {
    if (!firestoreDb) return;
    try {
        await firestoreDb.collection("gruppen").doc(code).collection("teilnehmer").doc(getDeviceId()).delete();
    } catch (e) { /* nicht kritisch, Eintrag verschwindet spätestens beim Aufräumen */ }
}

let groupPlayerPollTimer = null;

// Holt den aktuellen Gruppenstatus einmalig per direktem Request (statt über den Live-Listener).
// Wird genutzt, wenn die Seite wieder sichtbar wird oder der Live-Listener (z. B. auf manchen
// mobilen Browsern nach Standby) die Verbindung verloren haben könnte, damit die Freigabe nicht
// erst nach einem manuellen Neuladen ankommt (Punkt 21).
async function refreshGroupPlayerStatus(code, silent) {
    if (!firestoreDb || !code) return;
    try {
        const snap = await firestoreDb.collection("gruppen").doc(code).get();
        if (!snap.exists) { leaveGroupPlayerMode(true); return; }
        const data = snap.data();
        const now = Date.now();
        const expiresMs = (data.expiresAt && data.expiresAt.toMillis) ? data.expiresAt.toMillis() : 0;
        if (data.status === "beendet" || expiresMs < now) { leaveGroupPlayerMode(true); return; }
        applyGroupSettingsFromDoc(data);
        currentGroupRound = data.round || 1;
        lastKnownGroupStatus = data.status;
        renderGroupPlayerBanner(code, data.status);
        updateGroupStartButtonUI();
    } catch (e) {
        if (!silent) console.warn("Statusabgleich mit der Gruppe fehlgeschlagen.", e);
    }
}

// Sehr sparsame Sicherheitsabfrage: läuft nur, solange noch auf Freigabe gewartet wird (nicht
// während des laufenden Spiels), und nur alle 18 Sekunden — hält die Firestore-Zugriffe gering.
function startGroupPlayerPolling(code) {
    stopGroupPlayerPolling();
    groupPlayerPollTimer = setInterval(() => {
        if (lastKnownGroupStatus !== "laeuft") refreshGroupPlayerStatus(code, true);
    }, 18000);
}
function stopGroupPlayerPolling() {
    clearInterval(groupPlayerPollTimer);
    groupPlayerPollTimer = null;
}

function enterGroupPlayerMode(code) {
  try {
    isGroupPlayer = true;
    lastPlayedGroupRound = null;
    lastKnownGroupStatus = "warten";
    updateGroupEntryLinksState();
    registerAsGroupParticipant(code);
    startBtn.disabled = true;
    startBtn.textContent = t("group.startWaitingRelease");
    setGroupPlayerLockUI(true);
    renderGroupPlayerBanner(code, "warten");
    startGroupPlayerPolling(code);

    if (groupPlayerUnsub) groupPlayerUnsub();
    groupPlayerUnsub = firestoreDb.collection("gruppen").doc(code).onSnapshot(
        (snap) => {
            if (!snap.exists) { leaveGroupPlayerMode(true); return; }
            const data = snap.data();
            const now = Date.now();
            const expiresMs = (data.expiresAt && data.expiresAt.toMillis) ? data.expiresAt.toMillis() : 0;
            if (data.status === "beendet" || expiresMs < now) { leaveGroupPlayerMode(true); return; }

            applyGroupSettingsFromDoc(data);
            currentGroupRound = data.round || 1;
            lastKnownGroupStatus = data.status;
            renderGroupPlayerBanner(code, data.status);
            updateGroupStartButtonUI();
        },
        (e) => {
            console.warn("Verbindung zur Gruppe verloren.", e);
        }
    );
  } catch (err) {
    // Darf niemals unbehandelt nach oben durchreichen — sonst würde die restliche Skript-
    // Initialisierung danach (u. a. die Verdrahtung der Menü-Buttons) nicht mehr ausgeführt.
    console.error("enterGroupPlayerMode: Fehler, falle zurück auf normale Ansicht.", err);
    isGroupPlayer = false;
    clearPlayerGroupSession();
    if (startBtn) {
        startBtn.disabled = false;
        startBtn.textContent = t("settings.startButton");
    }
  }
}

function leaveGroupPlayerMode(closedByLeader) {
    const session = getPlayerGroupSession();
    if (groupPlayerUnsub) { groupPlayerUnsub(); groupPlayerUnsub = null; }
    stopGroupPlayerPolling();
    stopGroupHighscoreLive();
    isGroupPlayer = false;
    lastPlayedGroupRound = null;
    lastKnownGroupStatus = "warten";
    updateGroupEntryLinksState();
    clearPlayerGroupSession();
    if (!closedByLeader && session) unregisterGroupParticipant(session.code);
    setGroupPlayerLockUI(false);
    updateStandardBackArrowVisibility();
    document.getElementById("groupPlayerBanner").style.display = "none";
    startBtn.disabled = false;
    startBtn.textContent = t("settings.startButton");
    updateHighscoreDisplay(); // globale Bestenliste war während des Gruppenquiz ausgeblendet
    if (closedByLeader) {
        alert(t("group.closedAlert"));
    }
}

// Sperrt den Lernmodus-Schalter, solange eine Gruppe geleitet wird: Im Lernmodus gibt es
// grundsätzlich keinen Highscore-Eintrag — das würde sonst die Gruppen-Bestenliste leer lassen.
function setLeaderLearningModeLock(locked) {
    if (!learningModeToggle) return;
    learningModeToggle.style.pointerEvents = locked ? "none" : "";
    learningModeToggle.style.opacity = locked ? "0.4" : "";
    learningModeToggle.title = locked ? t("group.learningModeLockedTitle") : "";
    if (locked && settings.learningMode) {
        settings.learningMode = false;
        buildSettingsScreen();
        saveSettingsToStorage();
    }
}

// ---------- Gruppenquiz: Leiter-Banner ----------
let groupReleaseGateTimer = null;

async function renderGroupLeaderBanner() {
  try {
    const groupLeaderBanner = document.getElementById("groupLeaderBanner");
    const session = getLeaderSession();
    stopGroupRosterLive();
    updateGroupEntryLinksState();
    clearInterval(groupReleaseGateTimer);
    if (!session) {
        groupLeaderBanner.style.display = "none";
        document.body.classList.remove("leader-mode-active");
        stopGroupHighscoreLive();
        setLeaderLearningModeLock(false);
        updateStandardBackArrowVisibility();
        if (!isGroupPlayer) {
            startBtn.style.display = "";
            startBtn.disabled = false;
            startBtn.textContent = t("settings.startButton");
        }
        return;
    }
    groupLeaderBanner.style.display = "block";
    document.body.classList.add("leader-mode-active");
    setLeaderLearningModeLock(true);
    updateStandardBackArrowVisibility();
    groupLeaderBanner.innerHTML = '<div class="glb-head"><div class="glb-title">🧑\u200d🏫 ' + t("group.leaderDataLoading") + '</div></div>';
    // Punkt 9: Kein ausgegrauter Start-Button mehr — die Leitung steuert alles über das
    // Freigabe-/Nächste-Runde-Dashboard weiter unten.
    startBtn.style.display = "none";

    let round = 1, status = "warten", releasedAtMs = 0;
    if (firestoreDb) {
        try {
            const snap = await firestoreDb.collection("gruppen").doc(session.code).get();
            if (snap.exists) {
                const data = snap.data();
                round = data.round || 1;
                status = data.status || "warten";
                releasedAtMs = (data.releasedAt && data.releasedAt.toMillis) ? data.releasedAt.toMillis() : 0;
            }
        } catch (e) { /* Anzeige bleibt bei Standardwerten, nicht kritisch */ }
    }
    // Session könnte inzwischen (z. B. durch Schließen in einem anderen Tab) ungültig geworden sein
    if (!getLeaderSession()) {
        groupLeaderBanner.style.display = "none";
        document.body.classList.remove("leader-mode-active");
        stopGroupRosterLive();
        stopGroupHighscoreLive();
        setLeaderLearningModeLock(false);
        updateStandardBackArrowVisibility();
        if (!isGroupPlayer) {
            startBtn.style.display = "";
            startBtn.disabled = false;
            startBtn.textContent = t("settings.startButton");
        }
        return;
    }

    const releaseLabel = status === "laeuft"
        ? t("group.nextRoundLabel").replace("{n}", round)
        : t("group.releaseLabel");

    groupLeaderBanner.innerHTML =
        '<div class="glb-head">' +
            '<div class="glb-title">🧑\u200d🏫 ' + t("group.leaderTitle") + '</div>' +
            '<div class="glb-code-row">' +
                '<div class="glb-code">' + escapeHtml(session.code) + '</div>' +
                '<div>' +
                    '<button id="groupShowQrBtn" style="font-size:12.5px;padding:6px 10px;margin:0;background:rgba(255,255,255,0.9);color:var(--color-primary-dark);">' + t("group.showQr") + '</button>' +
                    '<div class="glb-code-hint">' + t("group.settingsLiveHint") + '</div>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<div class="glb-tabs">' +
            '<button class="glb-tab active" data-glbtab="warteraum" type="button">' + t("group.tabWaitroom") + '</button>' +
            '<button class="glb-tab" data-glbtab="ergebnisse" type="button">' + t("group.tabLiveResults") + '</button>' +
        '</div>' +
        '<div class="glb-tab-panel active" id="glbPanelWarteraum">' +
            '<div id="groupRosterList"></div>' +
        '</div>' +
        '<div class="glb-tab-panel" id="glbPanelErgebnisse">' +
            '<div id="groupLiveScores"></div>' +
        '</div>' +
        '<div class="glb-actions">' +
            '<button id="groupReleaseBtn">' + releaseLabel + '</button>' +
            '<div id="groupReleaseGateHint"></div>' +
            '<button id="groupLeaderCloseBtn">' + t("group.endGroupButton") + '</button>' +
        '</div>';

    document.getElementById("groupShowQrBtn").onclick = function () {
        renderGroupCreateModal();
        groupCreateModal.classList.add("open");
    };
    const releaseBtnEl = document.getElementById("groupReleaseBtn");
    releaseBtnEl.onclick = async function () {
        this.disabled = true;
        this.textContent = status === "laeuft" ? t("group.startingRound") : t("group.releasing");
        if (status === "laeuft") {
            await advanceGroupRound(session, round);
        } else {
            await releaseGroupForPlaying();
        }
        renderGroupLeaderBanner();
    };
    document.getElementById("groupLeaderCloseBtn").onclick = async function () {
        const sure = confirm(t("group.confirmClose"));
        if (!sure) return;
        this.disabled = true;
        await closeGroup();
        renderGroupLeaderBanner();
        updateHighscoreDisplay(); // globale Bestenliste war während der Leitung ausgeblendet
        goToMultiPlayerMenu(); // sonst bliebe der (jetzt wieder normale Solo-)Einstellungsbildschirm einfach stehen
    };

    // Punkt 11: "Nächste Runde" erst erlauben, wenn entweder alle Teilnehmer:innen ihr Ergebnis
    // eingesendet haben, oder seit der Freigabe mindestens 1 Minute vergangen ist. So kann die
    // Gruppe auch weiterspielen, falls ein Gerät die Verbindung verliert.
    const GROUP_NEXT_ROUND_MIN_WAIT_MS = 60 * 1000;
    function updateReleaseGate() {
        if (status !== "laeuft" || !releasedAtMs) {
            releaseBtnEl.disabled = false;
            document.getElementById("groupReleaseGateHint").textContent = "";
            return;
        }
        const total = groupRosterTeilnehmerDocs.length;
        const finished = groupRosterTeilnehmerDocs.filter(d =>
            groupRosterErgebnisseDocs.some(e => e.id === d.id && String(round) in (e.data().roundScores || {}))
        ).length;
        const allDone = total > 0 && finished >= total;
        const elapsedMs = Date.now() - releasedAtMs;
        const timeOk = elapsedMs >= GROUP_NEXT_ROUND_MIN_WAIT_MS;
        const gateHintEl = document.getElementById("groupReleaseGateHint");
        if (allDone || timeOk) {
            releaseBtnEl.disabled = false;
            if (gateHintEl) gateHintEl.textContent = "";
        } else {
            releaseBtnEl.disabled = true;
            const secsLeft = Math.ceil((GROUP_NEXT_ROUND_MIN_WAIT_MS - elapsedMs) / 1000);
            if (gateHintEl) gateHintEl.textContent = t("group.gateHint").replace("{finished}", finished).replace("{total}", total).replace("{secs}", secsLeft);
        }
    }
    updateReleaseGate();
    groupReleaseGateTimer = setInterval(updateReleaseGate, 2000);
    window.__groupUpdateReleaseGate = updateReleaseGate;

    // Tabs: Warteraum (Teilnehmer:innen live) <-> Live-Ergebnisse (Bestenliste live)
    const tabButtons = groupLeaderBanner.querySelectorAll(".glb-tab");
    const panels = {
        warteraum: document.getElementById("glbPanelWarteraum"),
        ergebnisse: document.getElementById("glbPanelErgebnisse")
    };
    tabButtons.forEach(tabBtn => {
        tabBtn.onclick = function () {
            tabButtons.forEach(b => b.classList.remove("active"));
            Object.values(panels).forEach(p => p.classList.remove("active"));
            this.classList.add("active");
            panels[this.dataset.glbtab].classList.add("active");
            if (this.dataset.glbtab === "ergebnisse") {
                startGroupHighscoreLive(document.getElementById("groupLiveScores"), session.code, () => round);
            } else {
                stopGroupHighscoreLive();
            }
        };
    });

    startGroupRosterLive(session.code, document.getElementById("groupRosterList"), () => round);
  } catch (err) {
    // Darf niemals unbehandelt nach oben durchreichen — sonst würde die restliche Skript-
    // Initialisierung danach (u. a. die Verdrahtung der Menü-Buttons) nicht mehr ausgeführt.
    console.error("renderGroupLeaderBanner: Fehler, falle zurück auf normale Ansicht.", err);
    const groupLeaderBanner = document.getElementById("groupLeaderBanner");
    if (groupLeaderBanner) groupLeaderBanner.style.display = "none";
    document.body.classList.remove("leader-mode-active");
    if (!isGroupPlayer) {
        startBtn.style.display = "";
        startBtn.disabled = false;
        startBtn.textContent = t("settings.startButton");
    }
  }
}

const STATS_KEY = "flagquiz_stats";

function loadStats() {
    try {
        const raw = localStorage.getItem(STATS_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        return {};
    }
}

function saveStats(stats) {
    try {
        localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch (e) { /* localStorage evtl. nicht verfügbar, ignorieren */ }
}

function recordAnswerStat(countryName, wasCorrect) {
    const stats = loadStats();
    if (!stats[countryName]) stats[countryName] = { seen: 0, correct: 0 };
    stats[countryName].seen++;
    if (wasCorrect) stats[countryName].correct++;
    saveStats(stats);
}

function renderStatsModal() {
    const stats = loadStats();
    const entries = Object.entries(stats);

    const explanation = `<p style="font-size:13px;color:#666;margin-top:0;">${t("stats.explanation")}</p>`;

    const ladderCache = getLadderOwnBestCache();

    if (entries.length === 0 && !(ladderCache && ladderCache.best > 0)) {
        statsContent.innerHTML = explanation + `<p>${t("stats.noData")}</p>`;
        return;
    }

    let totalSeen = 0, totalCorrect = 0;
    entries.forEach(([, v]) => { totalSeen += v.seen; totalCorrect += v.correct; });
    const accuracy = totalSeen > 0 ? Math.round((totalCorrect / totalSeen) * 100) : 0;
    const bestStreak = getBestStreak();

    // Länder mit den meisten Fehlern zuerst (mindestens 2x gesehen, damit Zufallstreffer nicht
    // verzerren; Länder ohne einen einzigen Fehler werden ausgeblendet, da "X von Y richtig"
    // mit X = Y sonst verwirrend in einer "hier häufen sich Fehler"-Liste auftauchen würde).
    const worst = entries
        .filter(([, v]) => v.seen >= 2 && v.correct < v.seen)
        .map(([name, v]) => ({ name, ratio: v.correct / v.seen, seen: v.seen, correct: v.correct }))
        .sort((a, b) => a.ratio - b.ratio)
        .slice(0, 12);

    const ladderTierIcon = ladderTierIconFor(ladderCache);
    const ladderProgressValue = ladderCache && ladderCache.best > 0
        ? `${ladderTierIcon ? (ladderTierIcon + " ") : ""}(${ladderCache.best}/${countries.length} Flaggen)`
        : "–";

    let html = explanation + `
        <div class="stats-row" style="font-weight:bold;border-bottom:2px solid #333;">
            <div>${t("stats.totalAnswered")}</div><div>${totalSeen} (${accuracy}% ${t("stats.correctWord")})</div>
        </div>
        <div class="stats-row" style="font-weight:bold;">
            <div>🔥 ${t("stats.bestStreak")}</div><div>${bestStreak > 0 ? bestStreak : "–"}</div>
        </div>
        <div class="stats-row" style="font-weight:bold;">
            <div>⛰️ ${t("stats.ladderProgress")}</div><div>${ladderProgressValue}</div>
        </div>`;

    if (worst.length > 0) {
        html += `<div style="margin-top:14px;font-weight:bold;">${t("stats.practiceHeading")}</div>`;
        html += worst.map(w => `
            <div class="stats-row">
                <div class="stats-name">${escapeHtml(countryDisplayName(w.name))}</div>
                <div class="stats-ratio">${w.correct} ${t("stats.of")} ${w.seen} ${t("stats.correctWord")}</div>
            </div>`).join("");
    } else {
        const anyEligible = entries.some(([, v]) => v.seen >= 2);
        html += anyEligible
            ? `<div style="margin-top:14px;color:#666;">${t("stats.noWeaknesses")}</div>`
            : `<div style="margin-top:14px;color:#666;">${t("stats.notEnoughData")}</div>`;
    }

    statsContent.innerHTML = html;
}

