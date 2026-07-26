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
        btn.innerHTML = '<span class="menu-tile-icon">' + (CONTINENT_ICONS[cont] || "🌐") + '</span><span class="menu-tile-text"><span class="menu-tile-title">' + continentDisplayName(cont) + '</span></span>';
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
        ["mc", "modeButtons.mc"],
        ["reverse-mc", "modeButtons.reverseMc"],
        ["text", "modeButtons.text"],
        ["mixed", "modeButtons.mixed"]
    ].forEach(([value, labelKey]) => {
        const btn = document.createElement("button");
        btn.className = "option-btn" + (value === hubBrowseSettings.mode ? " selected" : "");
        btn.textContent = t(labelKey);
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
    el.innerHTML = '<div class="highscore-card hs-empty"><span class="trophy">🏆</span><div>' + t("common.loading") + '</div></div>';

    const { list, online } = await fetchTopListCached(key);
    const tierIcons = await getLadderTierDeviceIdMap();
    const titleTexts = await getPlayerTitleDeviceIdMap();
    const statusLine = online
        ? '<span title="' + t("common.onlineTitle") + '">' + t("common.online") + '</span>'
        : '<span title="' + t("common.offlineTitle") + '">' + t("common.offline") + '</span>';

    if (list.length === 0) {
        el.innerHTML =
            '<div class="highscore-card hs-empty"><span class="trophy">🏆</span>' +
            '<div class="hs-card-title" style="margin-bottom:4px;">' + t("hub.noneForCombo") + '</div>' +
            '<div>' + t("common.beTheFirst") + '</div><div class="hs-status">' + statusLine + '</div></div>';
        return;
    }
    const medals = ["🥇", "🥈", "🥉"];
    let lastScore = null, lastRank = 0;
    const rowsHtml = list.slice(0, 50).map((entry, i) => {
        const rank = (entry.score === lastScore) ? lastRank : (i + 1);
        lastScore = entry.score; lastRank = rank;
        const tierIcon = tierIcons.get(entry.deviceId);
        const titleText = titleTexts.get(entry.deviceId);
        const nameHtml = nameWithTitleHtml(entry.name || t("common.anonymous"), tierIcon, titleText);
        const prestige = entry.prestige || 0;
        return '<div class="hs-row rank-' + rank + '">' +
            '<div class="hs-medal">' + (rank <= 3 ? medals[rank - 1] : rank + ".") + '</div>' +
            '<div class="hs-row-name">' + nameHtml +
            (prestige > 0 ? ' <span class="hs-prestige" title="' + t("highscore.prestigeTitle") + prestige + '×">💎' + (prestige > 1 ? ' ×' + prestige : '') + '</span>' : '') + '</div>' +
            '<div class="hs-row-score">' + entry.score + ' ' + t("highscore.points") + '</div></div>';
    }).join("");
    el.innerHTML = '<div class="highscore-card"><div class="hs-row-list">' + rowsHtml + '</div><div class="hs-status">' + statusLine + '</div></div>';
}

function selectHubTab(tab) {
    const tabs = { standard: "hubTabStandard", ladder: "hubTabLadder", battle: "hubTabBattle" };
    const panes = { standard: "hubPaneStandard", ladder: "hubPaneLadder", battle: "hubPaneBattle" };
    Object.keys(tabs).forEach(key => {
        document.getElementById(tabs[key]).classList.toggle("selected", key === tab);
        document.getElementById(panes[key]).style.display = (key === tab) ? "block" : "none";
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
