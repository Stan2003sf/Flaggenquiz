// ================= Bestenlisten-Hub (Schritt 6) =================
// Zentrale Übersicht aller drei Bestenlisten-Arten (Entdecker-Modus, Gipfelsturm, Battle) an
// einem Ort. Für den Entdecker-Modus gibt es dabei nicht nur EINE Bestenliste, sondern eine pro
// Kombination aus Kontinent(en) + Länge + Modus (+ Profi/Speed) -- deshalb bekommt dieser Reiter
// eine eigene, unabhängige Auswahl (siehe hubBrowseSettings unten), die absichtlich NICHT mit den
// echten Spiel-Einstellungen verknüpft ist: reines Durchstöbern der Bestenlisten darf niemals die
// tatsächlichen Voreinstellungen für die nächste echte Runde verändern.

// Isolierte Kopie der Einstellungen, nur zum Durchstöbern der Entdecker-Modus-Bestenlisten.
let hubBrowseSettings = null;

function initHubBrowseSettings() {
    // Startet mit einer Kopie der aktuellen (echten) Einstellungen, damit man sofort etwas
    // Sinnvolles sieht -- Änderungen hier wirken sich aber nie auf "settings" selbst aus.
    hubBrowseSettings = {
        continents: [...settings.continents],
        length: settings.length,
        mode: settings.mode,
        proMode: settings.proMode,
        speedMode: settings.speedMode
    };
}

function buildHubContinentButtons() {
    const container = document.getElementById("hubContinentButtons");
    container.innerHTML = "";
    continents.forEach(cont => {
        const btn = document.createElement("button");
        btn.className = "menu-tile" + (hubBrowseSettings.continents.includes(cont) ? " selected-battle-tile" : "");
        btn.type = "button";
        btn.innerHTML = '<span class="menu-tile-icon">' + (CONTINENT_ICONS[cont] || "🌐") + '</span><span class="menu-tile-text"><span class="menu-tile-title">' + cont + '</span></span>';
        btn.onclick = () => {
            const idx = hubBrowseSettings.continents.indexOf(cont);
            if (idx !== -1) {
                // Mindestens ein Kontinent muss gewählt bleiben, sonst gäbe es keine sinnvolle Liste.
                if (hubBrowseSettings.continents.length > 1) hubBrowseSettings.continents.splice(idx, 1);
            } else {
                hubBrowseSettings.continents.push(cont);
            }
            buildHubContinentButtons();
            updateHubStandardHighscoreDisplay();
        };
        container.appendChild(btn);
    });
}

function buildHubLengthButtons() {
    const container = document.getElementById("hubLengthButtons");
    container.innerHTML = "";
    [10, 20, 30, 50].forEach(n => {
        const btn = document.createElement("button");
        btn.className = "option-btn" + (n === hubBrowseSettings.length ? " selected" : "");
        btn.textContent = "🚩 " + n;
        btn.onclick = () => {
            hubBrowseSettings.length = n;
            buildHubLengthButtons();
            updateHubStandardHighscoreDisplay();
        };
        container.appendChild(btn);
    });
}

function buildHubModeButtons() {
    const container = document.getElementById("hubModeButtons");
    container.innerHTML = "";
    [
        ["mc", "🔤 Multiple Choice"],
        ["reverse-mc", "🏳️ Umkehr Multiple Choice"],
        ["text", "⌨️ Text eingeben"],
        ["mixed", "🔀 Mixed"]
    ].forEach(([value, label]) => {
        const btn = document.createElement("button");
        btn.className = "option-btn" + (value === hubBrowseSettings.mode ? " selected" : "");
        btn.textContent = label;
        btn.onclick = () => {
            hubBrowseSettings.mode = value;
            buildHubModeButtons();
            updateHubStandardHighscoreDisplay();
        };
        container.appendChild(btn);
    });
}

// Eigenständige, schlanke Rendering-Funktion (statt der bestehenden updateHighscoreDisplay()),
// da diese eng an die echte Einstellungsseite gekoppelt ist (Gruppen-Sonderfall, feste Element-
// Referenzen). Nutzt bewusst dieselbe Bestenlisten-Optik (highscore-card/hs-row) für Konsistenz.
async function updateHubStandardHighscoreDisplay() {
    const el = document.getElementById("hubStandardHighscoreDisplay");
    const key = highscoreKey(hubBrowseSettings);
    el.innerHTML = '<div class="highscore-card hs-empty"><span class="trophy">🏆</span><div>Bestenliste wird geladen …</div></div>';

    const { list, online } = await fetchTopListCached(key);
    const crownedIds = await getCrownedDeviceIdSet();
    const statusLine = online
        ? '<span title="Zentrale, geteilte Bestenliste">🌐 zentrale Bestenliste</span>'
        : '<span title="Keine Verbindung zur zentralen Bestenliste — zeigt deinen lokalen Stand">📴 offline (nur lokal)</span>';

    if (list.length === 0) {
        el.innerHTML =
            '<div class="highscore-card hs-empty"><span class="trophy">🏆</span>' +
            '<div class="hs-card-title" style="margin-bottom:4px;">Noch kein Highscore für diese Kombination</div>' +
            '<div>Sei der Erste!</div><div class="hs-status">' + statusLine + '</div></div>';
        return;
    }
    const medals = ["🥇", "🥈", "🥉"];
    let lastScore = null, lastRank = 0;
    const rowsHtml = list.slice(0, 50).map((entry, i) => {
        const rank = (entry.score === lastScore) ? lastRank : (i + 1);
        lastScore = entry.score; lastRank = rank;
        const crown = crownedIds.has(entry.deviceId) ? '👑 ' : '';
        const prestige = entry.prestige || 0;
        return '<div class="hs-row rank-' + rank + '">' +
            '<div class="hs-medal">' + (rank <= 3 ? medals[rank - 1] : rank + ".") + '</div>' +
            '<div class="hs-row-name">' + crown + escapeHtml(entry.name || "Anonym") +
            (prestige > 0 ? ' <span class="hs-prestige" title="Prestige: ' + prestige + '×">💎' + (prestige > 1 ? ' ×' + prestige : '') + '</span>' : '') + '</div>' +
            '<div class="hs-row-score">' + entry.score + ' Pkt.</div></div>';
    }).join("");
    el.innerHTML = '<div class="highscore-card"><div class="hs-row-list">' + rowsHtml + '</div><div class="hs-status">' + statusLine + '</div></div>';
}

function selectHubTab(tab) {
    const tabs = { standard: "hubTabStandard", ladder: "hubTabLadder", battle: "hubTabBattle" };
    const panes = { standard: "hubPaneStandard", ladder: "hubPaneLadder", battle: "hubPaneBattle" };
    Object.keys(tabs).forEach(t => {
        document.getElementById(tabs[t]).classList.toggle("selected", t === tab);
        document.getElementById(panes[t]).style.display = (t === tab) ? "block" : "none";
    });
    if (tab === "ladder") updateLadderHighscoreDisplay(document.getElementById("hubLadderHighscoreDisplay"));
    if (tab === "battle") updateBattleHighscoreDisplay("hubBattleHighscoreDisplay");
}

function goToHighscoreHub() {
    hideAllScreens();
    setChromeVisible(true);
    document.getElementById("highscoreHubScreen").style.display = "block";
    initHubBrowseSettings();
    buildHubContinentButtons();
    buildHubLengthButtons();
    buildHubModeButtons();
    updateHubStandardHighscoreDisplay();
    selectHubTab("standard");
}
