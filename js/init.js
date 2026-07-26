// ---------- Init ----------

let savedNickname = localStorage.getItem("flagquiz_nickname");
if (!savedNickname || containsBlockedContent(savedNickname)) {
    savedNickname = generateFantasyName();
    localStorage.setItem("flagquiz_nickname", savedNickname);
    localStorage.setItem(NICKNAME_SOURCE_KEY, "generated");
}
nicknameInput.value = savedNickname;

// ---------- Namensanzeige auf Ebene 0 (Name + Krone, falls vorhanden) ----------
// Die Krone hängt an der Geräte-ID und braucht einen Firestore-Abruf — deshalb getrennt von der
// reinen Textanzeige (renderNicknameDisplay, synchron, z. B. bei jedem Tastendruck) gehalten, statt
// bei jeder kleinen Änderung erneut abzufragen. refreshCrownStatus wird beim Laden und nach
// Ereignissen aufgerufen, die eine neue Krone bringen könnten (z. B. Gipfelsturm-Rundenende).
let cachedTierIcon = "";
function renderNicknameDisplay() {
    const name = nicknameInput.value.trim() || t("nicknameFallback");
    // Eigener Titel wird rein lokal aufgelöst (getOwnActiveTitleText, js/achievements.js) --
    // kein Firestore-Zugriff nötig, da nur die eigene Auswahl angezeigt wird.
    const titleText = (typeof getOwnActiveTitleText === "function") ? getOwnActiveTitleText() : "";
    document.getElementById("nicknameDisplay").innerHTML = nameWithTitleHtml(name, cachedTierIcon, titleText);
}
async function refreshCrownStatus() {
    try {
        const tierMap = await getLadderTierDeviceIdMap();
        cachedTierIcon = tierMap.get(getDeviceId()) || "";
    } catch (e) { /* ignorieren */ }
    renderNicknameDisplay();
}
renderNicknameDisplay();
refreshCrownStatus();
// Antippen der Namens-Card auf Ebene 0 springt direkt zu den Einstellungen, wo der Name geändert
// werden kann (das eigentliche Eingabefeld liegt dort, siehe #settingsMenuScreen).
document.getElementById("nicknameCard").onclick = () => goToSettingsMenuScreen();

let nicknameGroupSyncTimer = null;
nicknameInput.addEventListener("input", function () {
    localStorage.setItem("flagquiz_nickname", nicknameInput.value.trim());
    localStorage.setItem(NICKNAME_SOURCE_KEY, "custom"); // echte Nutzereingabe -- kein Auto-Ersetzen mehr bei Sprachwechsel
    renderNicknameDisplay();
    // Im Gruppenmodus: geänderten Namen (entprellt) auch in der Teilnehmerliste aktualisieren,
    // damit die Gruppenleitung immer den aktuellen Namen sieht.
    if (isGroupPlayer) {
        clearTimeout(nicknameGroupSyncTimer);
        nicknameGroupSyncTimer = setTimeout(() => {
            const session = getPlayerGroupSession();
            if (session) registerAsGroupParticipant(session.code);
        }, 800);
    }
});

let nicknameValueOnFocus = nicknameInput.value;
nicknameInput.addEventListener("focus", function () {
    nicknameValueOnFocus = nicknameInput.value;
});

let nicknameCollisionCheckToken = 0;
nicknameInput.addEventListener("blur", function () {
    // Name tatsächlich geändert? Dann vorher bestätigen lassen, da bereits eingetragene
    // Bestenlisten-Einträge nicht rückwirkend auf den neuen Namen angepasst werden.
    if (nicknameInput.value.trim() !== nicknameValueOnFocus.trim()) {
        const sure = confirm(t("nickname.confirmChange"));
        if (!sure) {
            nicknameInput.value = nicknameValueOnFocus;
            localStorage.setItem("flagquiz_nickname", nicknameInput.value.trim());
            renderNicknameDisplay();
            return;
        }
        nicknameValueOnFocus = nicknameInput.value;
    }

    if (containsBlockedContent(nicknameInput.value)) {
        nicknameInput.value = generateFantasyName();
        localStorage.setItem("flagquiz_nickname", nicknameInput.value);
        localStorage.setItem(NICKNAME_SOURCE_KEY, "generated");
        renderNicknameDisplay();
        nicknameHint.textContent = t("nickname.blockedReplaced");
        nicknameHint.style.display = "block";
        setTimeout(() => { nicknameHint.style.display = "none"; }, 4000);
        return;
    }

    // Vorab schon prüfen, ob der Name bereits vergeben ist — dann ist beim Klick auf
    // "Start" keine (spürbare) Wartezeit mehr nötig, da der Cache bereits gefüllt ist.
    const myToken = ++nicknameCollisionCheckToken;
    checkNameCollision().then(collision => {
        if (myToken !== nicknameCollisionCheckToken) return; // Name wurde inzwischen erneut geändert
        if (collision) {
            nicknameHint.textContent = t("nickname.collision");
            nicknameHint.style.display = "block";
        } else {
            nicknameHint.style.display = "none";
        }
    });
});

loadSettingsFromStorage();
buildSettingsScreen();

// Verbindungs-Check: MUSS vor der Navigations-Initialisierung stehen, da goToStandardSettings()
// weiter unten sofort checkConnection() aufruft (u. a. beim direkten Wiedereinstieg in eine
// laufende Gruppe nach einem Browser-Reload).
const offlineWarning = document.getElementById("offlineWarning");
let connectionCheckToken = 0;

function checkConnection() {
    // Sofort warnen, wenn das Gerät offline meldet (z. B. Flugmodus)
    if (!navigator.onLine) {
        offlineWarning.style.display = "block";
        return;
    }
    if (!firestoreDb) {
        // Keine Firebase-Konfiguration vorhanden -- kann nicht sinnvoll geprüft werden
        offlineWarning.style.display = "none";
        return;
    }
    // Echter Verbindungstest gegen Firestore (statt vorher ein fremdes Testbild von flagcdn.com --
    // das wurde gelegentlich von Werbeblockern/Datenschutz-Erweiterungen blockiert und löste dann
    // fälschlich "offline" aus, obwohl die eigentlich relevante Verbindung (Bestenliste/Mehrspieler)
    // einwandfrei funktionierte). Ein Lesezugriff auf ein nicht existierendes Dokument ist dafür
    // ausreichend und günstig -- es geht nur um die Zeit bis zur Antwort. WICHTIG: Die Doc-ID darf
    // nicht dem Muster "__irgendwas__" folgen -- solche IDs sind von Firestore intern reserviert und
    // Zugriffe darauf schlagen grundsätzlich fehl, unabhängig von den Security Rules (das war der
    // Grund, warum die Meldung zuvor dauerhaft "offline" anzeigte, obwohl die Verbindung stand).
    const myToken = ++connectionCheckToken;
    const timer = setTimeout(() => {
        if (myToken === connectionCheckToken) offlineWarning.style.display = "block";
    }, 5000);
    firestoreDb.collection("highscores").doc("connectivity_check").get()
        .then(() => {
            clearTimeout(timer);
            if (myToken === connectionCheckToken) offlineWarning.style.display = "none";
        })
        .catch(() => {
            clearTimeout(timer);
            if (myToken === connectionCheckToken) offlineWarning.style.display = "block";
        });
}

// ---------- Neue Menüstruktur: Kacheln & Zurück-Pfeile ----------
// Bewusst VOR der Gruppen-Sitzungs-Wiederherstellung verdrahtet: Sollte dort unerwartet ein
// Fehler auftreten, bleiben Navigation und "Zurück"-Buttons trotzdem in jedem Fall nutzbar.
document.getElementById("tileSinglePlayer").onclick = () => goToSinglePlayerMenu();
document.getElementById("tileMultiPlayer").onclick = () => goToMultiPlayerMenu();
function goToSettingsMenuScreen() {
    hideAllScreens();
    setChromeVisible(true);
    document.getElementById("settingsMenuScreen").style.display = "block";
}
document.getElementById("tileSettingsMenu").onclick = () => goToSettingsMenuScreen();
document.getElementById("backFromSettingsMenu").onclick = () => goToMainMenu();
document.getElementById("tileHighscoreHub").onclick = () => goToHighscoreHub();
document.getElementById("backFromHighscoreHub").onclick = () => goToMainMenu();

// Kurzlinks von den einzelnen Modi zum zentralen Bestenlisten-Hub (Schritt: Highscore-Konsolidierung)
document.getElementById("standardHighscoreHubLink").onclick = function (e) {
    e.preventDefault();
    goToHighscoreHub();
    selectHubTab("standard");
};
document.getElementById("ladderHighscoreHubLink").onclick = function (e) {
    e.preventDefault();
    goToHighscoreHub();
    selectHubTab("ladder");
};
document.getElementById("battleHighscoreHubLink").onclick = function (e) {
    e.preventDefault();
    goToHighscoreHub();
    selectHubTab("battle");
};
document.getElementById("hubTabStandard").onclick = () => selectHubTab("standard");
document.getElementById("hubTabLadder").onclick = () => selectHubTab("ladder");
document.getElementById("hubTabBattle").onclick = () => selectHubTab("battle");
document.getElementById("backFromSinglePlayerMenu").onclick = () => goToMainMenu();
document.getElementById("backFromMultiPlayerMenu").onclick = () => goToMainMenu();
document.getElementById("backFromLadderPlaceholder").onclick = () => goToSinglePlayerMenu();
document.getElementById("backFromStandardSettings").onclick = async function () {
    const btn = this;
    if (getLeaderSession()) {
        const sure = confirm(t("group.confirmClose"));
        if (!sure) return;
        btn.disabled = true;
        await closeGroup();
        renderGroupLeaderBanner();
        updateHighscoreDisplay();
        btn.disabled = false;
        goToMultiPlayerMenu();
        return;
    }
    if (isGroupPlayer) {
        const sure = confirm(t("group.confirmLeave"));
        if (!sure) return;
        leaveGroupPlayerMode(false);
        goToMultiPlayerMenu();
        return;
    }
    // Weder Leitung noch Mitspieler:in — normaler Standard-Einzelspieler-Fall.
    goToSinglePlayerMenu();
};
document.getElementById("tileStandard").onclick = () => goToStandardSettings("single");
document.getElementById("tileLadder").onclick = () => goToLadderPlaceholder();
document.getElementById("tileGroupCreate").onclick = () => groupCreateLink.click();
document.getElementById("tileGroupJoin").onclick = () => groupJoinLink.click();

// Bestehende Gruppensitzung (Leitung oder Mitspieler:in)? Dann direkt zur gemeinsamen
// Einstellungsseite statt ins neue Hauptmenü — sonst würde man aus der laufenden Gruppe "fallen".
// Ohne aktive Gruppe: den zuletzt besuchten Menü-/Übersichtsbildschirm wiederherstellen, damit ein
// Browser-Reload nicht mehr grundsätzlich auf das Hauptmenü zurückspringt (Battle-Sitzungen werden
// weiter unten separat und vorrangig behandelt, da sie einen eigenen Live-Zustand mitbringen).
if (getLeaderSession() || getPlayerGroupSession()) {
    goToStandardSettings("multi");
} else if (!getBattleSession()) {
    // Läuft gerade eine lokale Entdecker- oder Gipfelsturm-Runde (nicht Gruppe/Battle — die haben
    // ihre eigene, vorrangige Wiederherstellung oben/unten), wird sie mitten im Spiel fortgesetzt.
    // Ohne aktive Runde landet man bewusst IMMER auf Ebene 0 (Hauptmenü) — keine Menü-Bildschirm-
    // Wiederherstellung mehr, jeder Neustart/Reload beim reinen Menü-Browsen beginnt neu vorn.
    if (!restoreActiveStandardRound() && !restoreActiveLadderRound()) {
        goToMainMenu();
    }
}
// (Falls eine Battle-Sitzung existiert, übernimmt restoreBattleSession weiter unten die Navigation
// vollständig selbst, sobald der erste Firestore-Snapshot eintrifft — hier daher nichts tun.)

// ---------- Gruppenquiz: Status beim Laden wiederherstellen ----------
renderGroupLeaderBanner();
(function restoreGroupPlayerSession() {
    const playerSession = getPlayerGroupSession();
    if (playerSession && playerSession.code && firestoreDb) {
        enterGroupPlayerMode(playerSession.code);
    }
})();

// ---------- 1vs1 Battle: Sitzung nach Reload wiederherstellen (Reconnect) ----------
// Der Renderpfad (startBattleListener -> renderBattleFromData) übernimmt danach selbst die
// korrekte Bildschirm-Navigation, sobald der erste Firestore-Snapshot eintrifft.
(function restoreBattleSession() {
    const session = getBattleSession();
    if (session && session.code && firestoreDb) {
        startBattleListener(session.code, session.role);
    }
})();

// Punkt 21: Wird die Seite nach Standby/Hintergrund wieder sichtbar (typisches Firefox-Mobil-
// Problem), einmalig direkt den Gruppenstatus nachladen, statt auf den Live-Listener zu warten,
// dessen Wiederverbindung sich in solchen Fällen verzögern kann.
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !isGroupPlayer) return;
    const playerSession = getPlayerGroupSession();
    if (playerSession && playerSession.code) refreshGroupPlayerStatus(playerSession.code, true);
});

// ---------- Verbindungs-Check auf der Startseite ----------
window.addEventListener("offline", () => { offlineWarning.style.display = "block"; });
window.addEventListener("online", checkConnection);
checkConnection();

// ---------- Mute-Button ----------
updateMuteButton();
muteBtn.onclick = function () {
    soundMuted = !soundMuted;
    localStorage.setItem("flagquiz_muted", soundMuted);
    updateMuteButton();
};

// ---------- Statistik-Bildschirm ----------
document.getElementById("tileStats").onclick = function () {
    hideAllScreens();
    setChromeVisible(true);
    renderStatsModal();
    document.getElementById("statsScreen").style.display = "block";
};
document.getElementById("backFromStats").onclick = () => goToMainMenu();

// ---------- Erfolge-Bildschirm ----------
document.getElementById("tileAchievements").onclick = () => goToAchievementsScreen();
document.getElementById("backFromAchievements").onclick = () => goToMainMenu();

statsResetBtn.onclick = function () {
    const sure = confirm(t("stats.confirmReset"));
    if (!sure) return;
    localStorage.removeItem(STATS_KEY);
    localStorage.removeItem(BEST_STREAK_KEY);
    renderStatsModal();
};

// ---------- Datenschutz-Modal ----------
privacyLink.onclick = function (e) {
    e.preventDefault();
    privacyModal.classList.add("open");
};
privacyCloseBtn.onclick = function () {
    privacyModal.classList.remove("open");
};
privacyModal.onclick = function (e) {
    if (e.target === privacyModal) privacyModal.classList.remove("open");
};

// ---------- Hilfe (eigener Screen, wie "Meine Statistik" — kein Modal mehr) ----------
helpLink.onclick = function (e) {
    e.preventDefault();
    hideAllScreens();
    setChromeVisible(true);
    setNicknameCardVisible(false); // spart Platz auf der langen Hilfe-Seite
    document.getElementById("helpScreen").style.display = "block";
};
document.getElementById("backFromHelp").onclick = () => goToMainMenu();

// ---------- Gruppenquiz: Erstellen ----------
const groupCreateLink = document.getElementById("groupCreateLink");
const groupCreateModal = document.getElementById("groupCreateModal");
const groupCreateCloseBtn = document.getElementById("groupCreateCloseBtn");
const groupCreateContent = document.getElementById("groupCreateContent");

function renderGroupCreateModal() {
    const session = getLeaderSession();
    if (session) {
        groupCreateContent.innerHTML =
            "<p>" + t("group.createModalActiveText") + "</p>" +
            "<div style=\"font-family:var(--font-display);font-size:34px;font-weight:700;letter-spacing:6px;text-align:center;margin:14px 0;color:var(--color-primary);\">" + escapeHtml(session.code) + "</div>" +
            "<div id=\"groupQrContainer\" style=\"display:flex;justify-content:center;margin:10px 0;padding:14px;background:#F8FBFC;border-radius:var(--radius-md);\"></div>";
        const qrDiv = document.getElementById("groupQrContainer");
        const joinUrl = location.origin + location.pathname + "?gruppe=" + session.code;
        if (window.QRCode) {
            new QRCode(qrDiv, { text: joinUrl, width: 160, height: 160 });
        }
        // Zum Schließen der Gruppe dient ausschließlich der Button im Leiter-Dashboard
        // (kein zweiter, redundanter "Gruppe schließen"-Button mehr direkt unter dem QR-Code).
    } else {
        groupCreateContent.innerHTML =
            "<p>" + t("group.createModalIntro") + "</p>" +
            "<div style=\"text-align:center;margin-top:10px;\"><button id=\"groupCreateBtn\">" + t("group.createButton") + "</button></div>";
        document.getElementById("groupCreateBtn").onclick = async function () {
            this.disabled = true;
            this.textContent = t("group.creatingGroup");
            // Frisch erstellte Gruppe: Speedmodus zurücksetzen. Sonst könnte eine noch vom
            // letzten Solo-Spiel gemerkte "An"-Einstellung ungewollt für die ganze Gruppe gelten.
            // Damit gilt für neue Gruppen standardmäßig das feste 20-Sekunden-Zeitlimit; die
            // Leitung kann den (kürzeren) Speedmodus jederzeit selbst zusätzlich aktivieren.
            settings.speedMode = false;
            saveSettingsToStorage();
            const newSession = await createGroup();
            if (newSession) {
                goToStandardSettings("multi");
                renderGroupCreateModal();
                renderGroupLeaderBanner();
                updateHighscoreDisplay();
                buildSettingsScreen(); // aktualisiert u. a. den Speedmodus-Button auf "Aus"
            } else {
                this.disabled = false;
                this.textContent = t("group.createButton");
                alert(t("group.createNeedsOnline"));
            }
        };
    }
}

groupCreateLink.onclick = function (e) {
    e.preventDefault();
    if (getLeaderSession() || isGroupPlayer) return;
    renderGroupCreateModal();
    groupCreateModal.classList.add("open");
};
groupCreateCloseBtn.onclick = function () {
    groupCreateModal.classList.remove("open");
};
groupCreateModal.onclick = function (e) {
    if (e.target === groupCreateModal) groupCreateModal.classList.remove("open");
};

// ---------- Gruppenquiz: Beitreten ----------
const groupJoinLink = document.getElementById("groupJoinLink");
const groupJoinModal = document.getElementById("groupJoinModal");
const groupJoinCloseBtn = document.getElementById("groupJoinCloseBtn");
const groupJoinContent = document.getElementById("groupJoinContent");

function renderGroupJoinModal(prefillCode) {
    groupJoinContent.innerHTML =
        "<p>" + t("group.joinModalIntro") + "</p>" +
        "<div style=\"text-align:center;\">" +
        "<input type=\"text\" id=\"groupCodeInput\" maxlength=\"5\" placeholder=\"z. B. A7K3M\" style=\"font-family:var(--font-display);font-size:20px;letter-spacing:3px;text-align:center;text-transform:uppercase;padding:10px;width:160px;border:2px solid #DCE7EA;border-radius:var(--radius-md);\">" +
        "<br><br><button id=\"groupJoinBtn\">" + t("group.joinButton") + "</button>" +
        "<div id=\"groupJoinFeedback\" style=\"margin-top:10px;font-size:14px;\"></div></div>";
    const input = document.getElementById("groupCodeInput");
    if (prefillCode) input.value = prefillCode;
    input.addEventListener("input", () => { input.value = input.value.toUpperCase(); });

    document.getElementById("groupJoinBtn").onclick = async function () {
        const feedback = document.getElementById("groupJoinFeedback");
        this.disabled = true;
        feedback.style.color = "#666";
        feedback.textContent = t("group.checkingCode");
        const result = await joinGroupByCode(input.value);
        this.disabled = false;
        if (result.ok) {
            groupJoinModal.classList.remove("open");
            goToStandardSettings("multi");
            enterGroupPlayerMode(result.code);
        } else {
            let msg = t("group.codeNotFoundOrClosed");
            if (result.reason === "offline") msg = t("group.joinNeedsOnline");
            if (result.reason === "format") msg = t("group.enterFullCode");
            feedback.style.color = "#c62828";
            feedback.textContent = "⚠️ " + msg;
        }
    };
    if (prefillCode) document.getElementById("groupJoinBtn").click();
}

groupJoinLink.onclick = function (e) {
    e.preventDefault();
    if (getLeaderSession() || isGroupPlayer) return;
    renderGroupJoinModal();
    groupJoinModal.classList.add("open");
};
groupJoinCloseBtn.onclick = function () {
    groupJoinModal.classList.remove("open");
};
groupJoinModal.onclick = function (e) {
    if (e.target === groupJoinModal) groupJoinModal.classList.remove("open");
};

// ---------- Gruppenquiz: Bestenliste (Modal für die Gruppenleitung) ----------
const groupHighscoreModal = document.getElementById("groupHighscoreModal");
const groupHighscoreModalContent = document.getElementById("groupHighscoreModalContent");
const groupHighscoreCloseBtn = document.getElementById("groupHighscoreCloseBtn");
groupHighscoreCloseBtn.onclick = function () {
    groupHighscoreModal.classList.remove("open");
    stopGroupHighscoreLive();
};
groupHighscoreModal.onclick = function (e) {
    if (e.target === groupHighscoreModal) {
        groupHighscoreModal.classList.remove("open");
        stopGroupHighscoreLive();
    }
};

// Automatischer Beitritt über den QR-Code-Link (?gruppe=CODE in der URL)
(function checkGroupUrlParam() {
    const params = new URLSearchParams(location.search);
    const code = params.get("gruppe");
    if (code) {
        renderGroupJoinModal(code.toUpperCase());
        groupJoinModal.classList.add("open");
        // Parameter aus der URL entfernen, damit ein Neuladen nicht erneut automatisch beitritt
        history.replaceState({}, "", location.pathname);
    }
})();

// ---------- i18n: gespeicherte Sprache auf alle Ebene-0/Hauptmenü/Einstellungen-Texte anwenden ----------
// Bewusst ganz am Ende von init.js (nach allem anderen Setup), damit alle beteiligten Elemente
// und Funktionen (renderNicknameDisplay, updateMuteButton) garantiert schon existieren.
applyTranslations();

// ---------- PWA: Service Worker registrieren ----------
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("service-worker.js").catch(() => {
            // Registrierung schlägt z. B. fehl, wenn die Datei per file:// statt über einen Webserver geöffnet wird — kein Problem, das Spiel läuft trotzdem normal weiter.
        });
    });
}

