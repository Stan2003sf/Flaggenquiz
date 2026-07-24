// ---------- Init ----------

let savedNickname = localStorage.getItem("flagquiz_nickname");
if (!savedNickname || containsBlockedContent(savedNickname)) {
    savedNickname = generateFantasyName();
    localStorage.setItem("flagquiz_nickname", savedNickname);
}
nicknameInput.value = savedNickname;

let nicknameGroupSyncTimer = null;
nicknameInput.addEventListener("input", function () {
    localStorage.setItem("flagquiz_nickname", nicknameInput.value.trim());
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

let nicknameCollisionCheckToken = 0;
nicknameInput.addEventListener("blur", function () {
    if (containsBlockedContent(nicknameInput.value)) {
        nicknameInput.value = generateFantasyName();
        localStorage.setItem("flagquiz_nickname", nicknameInput.value);
        nicknameHint.textContent = "Dieser Name war nicht erlaubt und wurde ersetzt.";
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
            nicknameHint.textContent = "Name bereits vergeben – bitte wähle einen anderen Namen.";
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
    // Zusätzlich ein winziges Testbild laden, um langsame oder blockierte Verbindungen zu erkennen
    const myToken = ++connectionCheckToken;
    const img = new Image();
    const timer = setTimeout(() => {
        if (myToken === connectionCheckToken) offlineWarning.style.display = "block";
    }, 5000);
    img.onload = () => {
        clearTimeout(timer);
        if (myToken === connectionCheckToken) offlineWarning.style.display = "none";
    };
    img.onerror = () => {
        clearTimeout(timer);
        if (myToken === connectionCheckToken) offlineWarning.style.display = "block";
    };
    img.src = "https://flagcdn.com/w20/de.png?t=" + Date.now();
}

// ---------- Neue Menüstruktur: Kacheln & Zurück-Pfeile ----------
// Bewusst VOR der Gruppen-Sitzungs-Wiederherstellung verdrahtet: Sollte dort unerwartet ein
// Fehler auftreten, bleiben Navigation und "Zurück"-Buttons trotzdem in jedem Fall nutzbar.
document.getElementById("tileSinglePlayer").onclick = () => goToSinglePlayerMenu();
document.getElementById("tileMultiPlayer").onclick = () => goToMultiPlayerMenu();
document.getElementById("backFromSinglePlayerMenu").onclick = () => goToMainMenu();
document.getElementById("backFromMultiPlayerMenu").onclick = () => goToMainMenu();
document.getElementById("backFromLadderPlaceholder").onclick = () => goToSinglePlayerMenu();
document.getElementById("backFromStandardSettings").onclick = async function () {
    const btn = this;
    if (getLeaderSession()) {
        const sure = confirm("Gruppe wirklich schließen? Alle Mitspieler:innen werden auf ihre eigenen Einstellungen zurückgesetzt.");
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
        const sure = confirm("Gruppenquiz wirklich verlassen? Du spielst danach wieder mit deinen eigenen Einstellungen.");
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
if (getLeaderSession() || getPlayerGroupSession()) {
    goToStandardSettings("multi");
} else {
    goToMainMenu();
}

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

// ---------- Statistik-Modal ----------
statsLink.onclick = function (e) {
    e.preventDefault();
    renderStatsModal();
    statsModal.classList.add("open");
};
statsCloseBtn.onclick = function () {
    statsModal.classList.remove("open");
};
statsModal.onclick = function (e) {
    if (e.target === statsModal) statsModal.classList.remove("open");
};
statsResetBtn.onclick = function () {
    const sure = confirm("Deine persönliche Lernstatistik wirklich löschen? Das betrifft nur diesen Browser, nicht die zentrale Bestenliste.");
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

// ---------- Hilfe-Modal ----------
helpLink.onclick = function (e) {
    e.preventDefault();
    helpModal.classList.add("open");
};
helpCloseBtn.onclick = function () {
    helpModal.classList.remove("open");
};
helpModal.onclick = function (e) {
    if (e.target === helpModal) helpModal.classList.remove("open");
};

// ---------- Gruppenquiz: Erstellen ----------
const groupCreateLink = document.getElementById("groupCreateLink");
const groupCreateModal = document.getElementById("groupCreateModal");
const groupCreateCloseBtn = document.getElementById("groupCreateCloseBtn");
const groupCreateContent = document.getElementById("groupCreateContent");

function renderGroupCreateModal() {
    const session = getLeaderSession();
    if (session) {
        groupCreateContent.innerHTML =
            "<p>Deine Gruppe ist aktiv. Code an die Mitspieler:innen weitergeben oder den QR-Code scannen lassen:</p>" +
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
            "<p>Starte ein Gruppenquiz für deine Klasse oder Gruppe. Du erhältst einen Code, mit dem die Mitspieler:innen beitreten können.</p>" +
            "<div style=\"text-align:center;margin-top:10px;\"><button id=\"groupCreateBtn\">Gruppe erstellen</button></div>";
        document.getElementById("groupCreateBtn").onclick = async function () {
            this.disabled = true;
            this.textContent = "Wird erstellt…";
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
                this.textContent = "Gruppe erstellen";
                alert("Für ein Gruppenquiz wird eine Internetverbindung benötigt.");
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
        "<p>Code von deiner Lehrkraft bzw. Gruppenleitung eingeben:</p>" +
        "<div style=\"text-align:center;\">" +
        "<input type=\"text\" id=\"groupCodeInput\" maxlength=\"5\" placeholder=\"z. B. A7K3M\" style=\"font-family:var(--font-display);font-size:20px;letter-spacing:3px;text-align:center;text-transform:uppercase;padding:10px;width:160px;border:2px solid #DCE7EA;border-radius:var(--radius-md);\">" +
        "<br><br><button id=\"groupJoinBtn\">Beitreten</button>" +
        "<div id=\"groupJoinFeedback\" style=\"margin-top:10px;font-size:14px;\"></div></div>";
    const input = document.getElementById("groupCodeInput");
    if (prefillCode) input.value = prefillCode;
    input.addEventListener("input", () => { input.value = input.value.toUpperCase(); });

    document.getElementById("groupJoinBtn").onclick = async function () {
        const feedback = document.getElementById("groupJoinFeedback");
        this.disabled = true;
        feedback.style.color = "#666";
        feedback.textContent = "Prüfe Code…";
        const result = await joinGroupByCode(input.value);
        this.disabled = false;
        if (result.ok) {
            groupJoinModal.classList.remove("open");
            goToStandardSettings("multi");
            enterGroupPlayerMode(result.code);
        } else {
            let msg = "Code nicht gefunden oder Gruppe bereits geschlossen.";
            if (result.reason === "offline") msg = "Für den Beitritt wird eine Internetverbindung benötigt.";
            if (result.reason === "format") msg = "Bitte den 5-stelligen Code vollständig eingeben.";
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

// ---------- PWA: Service Worker registrieren ----------
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("service-worker.js").catch(() => {
            // Registrierung schlägt z. B. fehl, wenn die Datei per file:// statt über einen Webserver geöffnet wird — kein Problem, das Spiel läuft trotzdem normal weiter.
        });
    });
}

