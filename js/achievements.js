// ================= Erfolgs-/Titel-System =================
// Siehe Erfolgssystem-Konzept: Kontinent-Erfolge (a), Meta-Erfolg (b), Gipfelsturm-Meilensteine (c)
// und Siegesserien (d). Freischaltung wird NICHT separat gespeichert, sondern bei jedem Aufruf aus
// den bereits vorhandenen Rohdaten (STATS_KEY aus js/group-quiz.js, Ladder-Bestwert aus
// js/ladder-mode.js, Best-Streak aus js/core-state.js) frisch berechnet -- so bleibt die Anzeige
// immer konsistent, auch wenn sich diese Rohdaten z. B. durch "Statistik zurücksetzen" ändern.

// Kontinent-Basis-Erfolge: ID -> deutscher Kontinentname (wie in data-countries.js, c.continent).
const ACHIEVEMENT_CONTINENT_MAP = {
    continent_europe: "Europa",
    continent_africa: "Afrika",
    continent_asia: "Asien",
    continent_northamerica: "Nordamerika",
    continent_southamerica: "Südamerika",
    continent_oceania: "Ozeanien"
};
const CONTINENT_ACHIEVEMENT_IDS = Object.keys(ACHIEVEMENT_CONTINENT_MAP);

const LADDER_MILESTONE_THRESHOLDS = [25, 50, 100, 150]; // "milestone_all" kommt dynamisch dazu (countries.length)
const STREAK_THRESHOLDS = [10, 20, 50];

// Abzeichen, das der/die Spieler:in beim jeweiligen Meilenstein erhält -- 50/100/150 sind dieselben
// Icons wie das bestehende Gipfelsturm-Tier-System (LADDER_TIER_ICONS, js/ladder-mode.js), "all"
// nutzt bewusst dieselbe Krone wie ein gewonnener Durchlauf.
const MILESTONE_ICONS = { milestone_25: "🥾", milestone_50: "🧢", milestone_100: "🎓", milestone_150: "🎩", milestone_all: "👑" };

// Baut die vollständige Liste aller Erfolgs-Definitionen (jede Kontinent-Basis-ID plus ihre drei
// Modus-Modifier-Varianten, siehe Konzept Punkt 3). Rein statisch, unabhängig vom Spielstand.
function buildAchievementDefs() {
    const defs = [];
    CONTINENT_ACHIEVEMENT_IDS.forEach(baseId => {
        const continent = ACHIEVEMENT_CONTINENT_MAP[baseId];
        defs.push({ id: baseId, category: "continent", continent: continent, modifier: null });
        defs.push({ id: baseId + "_profi", category: "continent", continent: continent, modifier: "profi" });
        defs.push({ id: baseId + "_speed", category: "continent", continent: continent, modifier: "speed" });
        defs.push({ id: baseId + "_profi_speed", category: "continent", continent: continent, modifier: "both" });
    });
    defs.push({ id: "meta_world", category: "meta" });
    LADDER_MILESTONE_THRESHOLDS.forEach(n => defs.push({ id: "milestone_" + n, category: "milestone", threshold: n }));
    defs.push({ id: "milestone_all", category: "milestone", threshold: (typeof countries !== "undefined" ? countries.length : 197) });
    STREAK_THRESHOLDS.forEach(n => defs.push({ id: "streak_" + n, category: "streak", threshold: n }));
    return defs;
}

// Zählt, wie viele Länder eines Kontinents das jeweilige Kriterium erfüllen (Basis: mind. 1x
// richtig; Profi/Speed/Beide: das jeweilige Flag mind. 1x gesetzt, siehe recordAnswerStat in
// js/group-quiz.js). Nutzt den DEUTSCHEN Ländernamen als Schlüssel, wie STATS_KEY es tut.
function countContinentProgress(continent, modifier, stats) {
    const contCountries = countries.filter(c => c.continent === continent);
    let current = 0;
    contCountries.forEach(c => {
        const s = stats[c.name];
        if (!s) return;
        if (modifier === null) { if (s.correct >= 1) current++; }
        else if (modifier === "profi") { if (s.correctProfi) current++; }
        else if (modifier === "speed") { if (s.correctSpeed) current++; }
        else if (modifier === "both") { if (s.correctProfi && s.correctSpeed) current++; }
    });
    return { current: current, total: contCountries.length };
}

// Berechnet Freischalt-Status + Fortschritt für JEDE Erfolgs-Definition. Reihenfolge entspricht
// buildAchievementDefs() (Kontinente -> Meta -> Gipfelsturm -> Serien).
function computeAchievementStatus() {
    const stats = loadStats();
    const defs = buildAchievementDefs();
    const ladderBest = (getLadderOwnBestCache() && getLadderOwnBestCache().best) || 0;
    const bestStreak = getBestStreak();
    const continentBaseUnlocked = {};

    const results = defs.map(def => {
        let progress = { current: 0, total: 1 };
        if (def.category === "continent") {
            progress = countContinentProgress(def.continent, def.modifier, stats);
            if (def.modifier === null) continentBaseUnlocked[def.id] = progress.total > 0 && progress.current >= progress.total;
        } else if (def.category === "milestone") {
            progress = { current: Math.min(ladderBest, def.threshold), total: def.threshold };
        } else if (def.category === "streak") {
            progress = { current: Math.min(bestStreak, def.threshold), total: def.threshold };
        }
        return { def: def, progress: progress, unlocked: progress.total > 0 && progress.current >= progress.total };
    });

    // Meta-Erfolg erst nachträglich auswerten, da er von allen Kontinent-Basis-Ergebnissen abhängt.
    const metaEntry = results.find(r => r.def.id === "meta_world");
    if (metaEntry) {
        const unlockedCount = CONTINENT_ACHIEVEMENT_IDS.filter(id => continentBaseUnlocked[id]).length;
        metaEntry.progress = { current: unlockedCount, total: CONTINENT_ACHIEVEMENT_IDS.length };
        metaEntry.unlocked = unlockedCount >= CONTINENT_ACHIEVEMENT_IDS.length;
    }
    return results;
}

// ---------- Aktiver Titel (nur lokal -- die Remote-Kopie dient ausschließlich der Anzeige bei
// ANDEREN Spieler:innen, siehe getPlayerTitleDeviceIdMap weiter unten) ----------
const ACHIEVEMENTS_KEY = "flagquiz_erfolge";

function getActiveTitle() {
    try {
        const raw = localStorage.getItem(ACHIEVEMENTS_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return (parsed && parsed.activeTitle) ? parsed.activeTitle : null;
    } catch (e) { return null; }
}

function setActiveTitle(id, variant) {
    try {
        localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify({ activeTitle: id ? { id: id, variant: variant } : null }));
    } catch (e) { /* ignorieren */ }
}

// Liefert den aufgelösten Titeltext für die EIGENE Anzeige (Ebene 0), rein lokal, ohne Firestore-
// Zugriff -- siehe js/init.js renderNicknameDisplay().
function getOwnActiveTitleText() {
    const active = getActiveTitle();
    if (!active) return "";
    return achievementTitleText(active.id, active.variant, currentLang);
}

// ---------- Remote-Sync (analog zum Gipfelsturm-Tier-System, siehe js/ladder-mode.js
// getLadderTierDeviceIdMap), damit der Titel auch bei ANDEREN Spieler:innen (Bestenlisten,
// Gruppenquiz, Battle) erscheint. Eigene Collection mit EINEM Dokument pro Geräte-ID (wie
// "gruppen/{code}/teilnehmer/{deviceId}") statt eines gedeckelten Listen-Dokuments -- die Anzahl
// an Geräten, die je einen Titel wählen, ist NICHT auf 50 begrenzbar wie bei echten Bestenlisten. ----------
const ACHIEVEMENT_TITLES_COLLECTION = "erfolgstitel";
const ACHIEVEMENT_TITLES_LOCAL_KEY = "flagquiz_erfolgstitel_lokal"; // Offline-Fallback, Map deviceId -> {titleId, variant}

function getLocalTitlesMap() {
    try {
        const raw = localStorage.getItem(ACHIEVEMENT_TITLES_LOCAL_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
}
function saveLocalTitlesMap(map) {
    try { localStorage.setItem(ACHIEVEMENT_TITLES_LOCAL_KEY, JSON.stringify(map)); } catch (e) { /* ignorieren */ }
}

async function saveActiveTitleRemote(titleId, variant) {
    const deviceId = getDeviceId();
    const local = getLocalTitlesMap();
    if (titleId) local[deviceId] = { titleId: titleId, variant: variant || null }; else delete local[deviceId];
    saveLocalTitlesMap(local);

    if (!firestoreDb) return;
    try {
        await firestoreDb.collection(ACHIEVEMENT_TITLES_COLLECTION).doc(deviceId)
            .set({ titleId: titleId || null, variant: variant || null });
        achievementTitlesCache = null; // eigener Titel geändert -> beim nächsten Rendern frisch laden
    } catch (e) {
        console.warn("Erfolgs-Titel konnte nicht zentral gespeichert werden, nur lokal gesichert.", e);
    }
}

// Kurzzeitiger Zwischenspeicher (Muster wie highscoreCache in js/highscore-ladder-stats.js), damit
// nicht bei jedem Bestenlisten-Rendern die komplette Collection neu geladen wird.
let achievementTitlesCache = null; // { map: Map<deviceId,text>, ts: number }
const ACHIEVEMENT_TITLES_CACHE_TTL_MS = 60 * 1000;

// Map deviceId -> fertiger Titeltext (in der aktuellen UI-Sprache), zum Voranstellen bei jeder
// Namensanzeige. Pendant zu getLadderTierDeviceIdMap() in js/ladder-mode.js.
async function getPlayerTitleDeviceIdMap() {
    if (achievementTitlesCache && (Date.now() - achievementTitlesCache.ts) < ACHIEVEMENT_TITLES_CACHE_TTL_MS) {
        return achievementTitlesCache.map;
    }
    let raw = {};
    if (firestoreDb) {
        try {
            const snap = await firestoreDb.collection(ACHIEVEMENT_TITLES_COLLECTION).get();
            snap.forEach(doc => { raw[doc.id] = doc.data(); });
            saveLocalTitlesMap(raw);
        } catch (e) {
            console.warn("Erfolgs-Titel nicht erreichbar, nutze lokalen Stand.", e);
            raw = getLocalTitlesMap();
        }
    } else {
        raw = getLocalTitlesMap();
    }
    const map = new Map();
    Object.keys(raw).forEach(deviceId => {
        const entry = raw[deviceId];
        if (entry && entry.titleId) map.set(deviceId, achievementTitleText(entry.titleId, entry.variant, currentLang));
    });
    achievementTitlesCache = { map: map, ts: Date.now() };
    return map;
}

// Baut die HTML-Namensanzeige für ALLE Stellen, an denen ein Titel neben einem Namen erscheinen
// kann (Bestenlisten, Ebene 0, Battle, Gruppenquiz): Tier-Abzeichen bleibt VOR dem Namen, der
// Erfolgs-Titel steht NACH dem Namen und deutlich kleiner (.player-title-suffix), damit der Name
// selbst im Vordergrund bleibt.
function nameWithTitleHtml(name, tierIcon, titleText) {
    const tierPrefix = tierIcon ? (tierIcon + " ") : "";
    const titleSuffix = titleText ? (' <span class="player-title-suffix">' + escapeHtml(titleText) + '</span>') : "";
    return tierPrefix + escapeHtml(name) + titleSuffix;
}

// ---------- Anzeige-Bildschirm ----------

function achievementCategoryLabel(category) {
    if (category === "continent") return t("achievements.categoryContinent");
    if (category === "meta") return t("achievements.categoryMeta");
    if (category === "milestone") return t("achievements.categoryMilestone");
    return t("achievements.categoryStreak");
}

function achievementDescription(entry) {
    const def = entry.def;
    if (def.category === "continent") {
        const contName = continentDisplayName(def.continent);
        const key = def.modifier === null ? "achievements.desc.continentBase"
            : def.modifier === "profi" ? "achievements.desc.continentProfi"
            : def.modifier === "speed" ? "achievements.desc.continentSpeed"
            : "achievements.desc.continentBoth";
        return t(key).replace("{continent}", contName);
    }
    if (def.category === "meta") return t("achievements.desc.meta");
    if (def.category === "milestone") return t("achievements.desc.milestone").replace("{n}", def.threshold);
    return t("achievements.desc.streak").replace("{n}", def.threshold);
}

function achievementProgressLine(entry) {
    const p = entry.progress;
    if (entry.def.category === "streak") {
        return t("achievements.progressStreakLine").replace("{current}", p.current).replace("{total}", p.total);
    }
    const key = entry.def.category === "milestone" ? "achievements.progressFlags" : "achievements.progressCountries";
    return t(key).replace("{current}", p.current).replace("{total}", p.total);
}

function achievementCardHtml(entry) {
    const variants = achievementTitleVariants(entry.def.id, currentLang);
    const titleText = variants.length ? variants.map(v => v.text).join(" / ") : "";
    const pct = entry.progress.total > 0 ? Math.min(100, Math.round((entry.progress.current / entry.progress.total) * 100)) : 0;
    // Kontinent-Erfolge zeigen das Kontinent-Emoji (CONTINENT_ICONS, js/standard-settings.js),
    // Gipfelsturm-Meilensteine das jeweils erhaltene Abzeichen (MILESTONE_ICONS oben).
    const icon = entry.def.category === "continent" ? (CONTINENT_ICONS[entry.def.continent] || "🌐")
        : entry.def.category === "milestone" ? (MILESTONE_ICONS[entry.def.id] || "")
        : "";
    const iconPrefix = icon ? (icon + " ") : "";
    return '<div class="achv-card' + (entry.unlocked ? ' achv-unlocked' : '') + '">' +
        '<div class="achv-card-title">' + iconPrefix + escapeHtml(titleText) + (entry.unlocked ? ' <span class="achv-badge">' + t("achievements.unlockedBadge") + '</span>' : '') + '</div>' +
        '<div class="achv-card-desc">' + escapeHtml(achievementDescription(entry)) + '</div>' +
        '<div class="achv-progress-outer"><div class="achv-progress-inner" style="width:' + pct + '%;"></div></div>' +
        '<div class="achv-card-progress-line">' + escapeHtml(achievementProgressLine(entry)) + '</div>' +
        '</div>';
}

// Baut die Optionen für das Titel-Auswahl-Dropdown: jede freigeschaltete Erfolgs-ID mit all ihren
// Varianten (m/w einzeln, Konzept Punkt 4) als eigene Option, plus "Kein Titel".
function buildTitleSelectOptionsHtml(statusList, active) {
    let html = '<option value=""' + (!active ? ' selected' : '') + '>' + escapeHtml(t("achievements.noTitle")) + '</option>';
    statusList.filter(e => e.unlocked).forEach(entry => {
        achievementTitleVariants(entry.def.id, currentLang).forEach(v => {
            const value = entry.def.id + "|" + v.variant;
            const selected = active && active.id === entry.def.id && active.variant === v.variant;
            html += '<option value="' + value + '"' + (selected ? ' selected' : '') + '>' + escapeHtml(v.text) + '</option>';
        });
    });
    return html;
}

function renderAchievementsScreen() {
    const container = document.getElementById("achievementsContent");
    if (!container) return;
    const statusList = computeAchievementStatus();
    let active = getActiveTitle();

    // Absicherung: falls der aktive Titel zu einem Erfolg gehört, der (z. B. nach "Statistik
    // zurücksetzen") nicht mehr freigeschaltet ist, Auswahl zurücksetzen -- sonst würde die
    // Namensvorschau weiterhin einen Titel zeigen, der im Dropdown gar nicht mehr wählbar ist.
    if (active && !statusList.some(e => e.unlocked && e.def.id === active.id)) {
        setActiveTitle(null, null);
        saveActiveTitleRemote(null, null);
        active = null;
    }

    const name = nicknameInput.value.trim() || t("nicknameFallback");
    const previewTitle = active ? achievementTitleText(active.id, active.variant, currentLang) : "";

    const categories = ["continent", "meta", "milestone", "streak"];
    let cardsHtml = "";
    categories.forEach(cat => {
        const entries = statusList.filter(e => e.def.category === cat);
        if (!entries.length) return;
        cardsHtml += '<div class="achv-category-heading">' + achievementCategoryLabel(cat) + '</div>';
        cardsHtml += entries.map(achievementCardHtml).join("");
    });

    container.innerHTML =
        '<div class="achv-name-preview">' +
            '<div class="hint-small" style="margin-bottom:6px;">' + t("achievements.namePreviewHint") + '</div>' +
            '<div class="achv-name-preview-value">' + nameWithTitleHtml(name, cachedTierIcon, previewTitle) + '</div>' +
        '</div>' +
        '<div class="achv-title-select-row">' +
            '<label for="achievementsTitleSelect" class="hint-small">' + t("achievements.titleSelectLabel") + '</label>' +
            '<select id="achievementsTitleSelect">' + buildTitleSelectOptionsHtml(statusList, active) + '</select>' +
        '</div>' +
        cardsHtml +
        '<div class="achv-scroll-top-row"><button type="button" class="achv-scroll-top-btn" id="achievementsScrollTopBtn">' + t("achievements.scrollToTop") + '</button></div>';

    document.getElementById("achievementsTitleSelect").onchange = function () {
        const val = this.value;
        if (!val) {
            setActiveTitle(null, null);
            saveActiveTitleRemote(null, null);
        } else {
            const [id, variant] = val.split("|");
            setActiveTitle(id, variant);
            saveActiveTitleRemote(id, variant);
        }
        renderNicknameDisplay();
        renderAchievementsScreen();
    };
    document.getElementById("achievementsScrollTopBtn").onclick = function () {
        window.scrollTo({ top: 0, behavior: "smooth" });
    };
}

function goToAchievementsScreen() {
    hideAllScreens();
    setChromeVisible(true);
    renderAchievementsScreen();
    document.getElementById("achievementsScreen").style.display = "block";
}
