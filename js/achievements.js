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
const BATTLE_WIN_THRESHOLDS = [10, 25, 50, 100];

// Eigene Icons, bewusst verschieden von MILESTONE_ICONS/CONTINENT_ICONS (kein 👑/⚔️ -- Letzteres
// ist bereits das generelle Battle-Icon in Überschrift/Tabs/Create-Button, siehe js/i18n.js).
const BATTLE_ACHIEVEMENT_ICONS = { battle_10: "🥊", battle_25: "🏹", battle_50: "🛡️", battle_100: "🏵️" };

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
    BATTLE_WIN_THRESHOLDS.forEach(n => defs.push({ id: "battle_" + n, category: "battle", threshold: n }));
    return defs;
}

// Zählt, wie viele Länder eines Kontinents das jeweilige Kriterium erfüllen (Basis: mind. 1x
// richtig; Profi/Speed/Beide: das jeweilige Flag mind. 1x gesetzt, siehe recordAnswerStat in
// js/group-quiz.js). Nutzt den DEUTSCHEN Ländernamen als Schlüssel, wie STATS_KEY es tut.
// Liefert neben den reinen Zahlen auch die beiden Länderlisten selbst (done/open) -- die
// Detail-Aufklappansicht der Erfolgs-Karten (siehe achievementContinentDetailHtml) baut darauf auf,
// damit die Zuordnung "welches Land fehlt noch" exakt demselben Kriterium folgt wie der Fortschritt.
function countContinentProgress(continent, modifier, stats) {
    const contCountries = countries.filter(c => c.continent === continent);
    const done = [], open = [];
    contCountries.forEach(c => {
        const s = stats[c.name];
        let ok = false;
        if (s) {
            if (modifier === null) ok = s.correct >= 1;
            else if (modifier === "profi") ok = !!s.correctProfi;
            else if (modifier === "speed") ok = !!s.correctSpeed;
            else if (modifier === "both") ok = !!(s.correctProfi && s.correctSpeed);
        }
        (ok ? done : open).push(c);
    });
    return { current: done.length, total: contCountries.length, done: done, open: open };
}

// Berechnet Freischalt-Status + Fortschritt für JEDE Erfolgs-Definition. Reihenfolge entspricht
// buildAchievementDefs() (Kontinente -> Meta -> Gipfelsturm -> Serien).
function computeAchievementStatus() {
    const stats = loadStats();
    const defs = buildAchievementDefs();
    const ladderBest = (getLadderOwnBestCache() && getLadderOwnBestCache().best) || 0;
    const bestStreak = getBestStreak();
    const ownBattleWins = (typeof getOwnBattleWins === "function") ? getOwnBattleWins() : 0;
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
        } else if (def.category === "battle") {
            progress = { current: Math.min(ownBattleWins, def.threshold), total: def.threshold };
        }
        return { def: def, progress: progress, unlocked: progress.total > 0 && progress.current >= progress.total };
    });

    // Meta-Erfolg erst nachträglich auswerten, da er von allen Kontinent-Basis-Ergebnissen abhängt.
    const metaEntry = results.find(r => r.def.id === "meta_world");
    if (metaEntry) {
        // continentDetails hält zusätzlich den Reststand JE Kontinent fest ("noch 12 von 54") --
        // die Aufklappansicht des Meta-Erfolgs zeigt damit nicht nur, WELCHE Kontinente fehlen,
        // sondern auch, wie weit sie jeweils schon sind (siehe achievementMetaDetailHtml).
        metaEntry.continentDetails = CONTINENT_ACHIEVEMENT_IDS.map(id => {
            const base = results.find(r => r.def.id === id);
            return {
                id: id,
                continent: ACHIEVEMENT_CONTINENT_MAP[id],
                current: base ? base.progress.current : 0,
                total: base ? base.progress.total : 0,
                unlocked: !!continentBaseUnlocked[id]
            };
        });
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
    if (category === "battle") return t("achievements.categoryBattle");
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
    if (def.category === "battle") return t("achievements.desc.battle").replace("{n}", def.threshold);
    return t("achievements.desc.streak").replace("{n}", def.threshold);
}

function achievementProgressLine(entry) {
    const p = entry.progress;
    if (entry.def.category === "streak") {
        return t("achievements.progressStreakLine").replace("{current}", p.current).replace("{total}", p.total);
    }
    if (entry.def.category === "battle") {
        return t("achievements.progressWins").replace("{current}", p.current).replace("{total}", p.total);
    }
    // Der Meta-Erfolg zählt KONTINENTE, nicht Länder -- vorher fiel er in den Länder-Zweig und zeigte
    // dadurch fälschlich "3 / 6 Länder" statt "3 / 6 Kontinente".
    const key = entry.def.category === "meta" ? "achievements.progressContinents"
        : entry.def.category === "milestone" ? "achievements.progressFlags"
        : "achievements.progressCountries";
    return t(key).replace("{current}", p.current).replace("{total}", p.total);
}

// Emoji der Erfolgs-Karte: Kontinent-Erfolge zeigen das Kontinent-Emoji (CONTINENT_ICONS,
// js/standard-settings.js), Gipfelsturm-Meilensteine das jeweils erhaltene Abzeichen
// (MILESTONE_ICONS oben), Battle-Erfolge ihr eigenes Icon. Meta/Serien bewusst ohne Emoji.
function achievementIcon(def) {
    if (def.category === "continent") return CONTINENT_ICONS[def.continent] || "🌐";
    if (def.category === "milestone") return MILESTONE_ICONS[def.id] || "";
    if (def.category === "battle") return BATTLE_ACHIEVEMENT_ICONS[def.id] || "";
    return "";
}

// Voller Anzeigename eines Erfolgs (alle Titel-Varianten mit "/" verbunden, wie auf der Karte) --
// wird auch von der Freischalt-Benachrichtigung genutzt (siehe checkForNewAchievements).
function achievementDisplayName(entry) {
    const variants = achievementTitleVariants(entry.def.id, currentLang);
    return variants.length ? variants.map(v => v.text).join(" / ") : "";
}

// ---------- Aufklappbare Detail-Liste (welche Länder/Kontinente fehlen noch) ----------

// Nur Kontinent- und Meta-Erfolge haben eine sinnvolle "was fehlt noch"-Liste. Gipfelsturm-
// Meilensteine, Siegesserien und Battle-Siege sind reine Zählstände ohne Einzelposten.
function achievementHasDetail(def) {
    return def.category === "continent" || def.category === "meta";
}

// Merkt sich, welche Karten gerade aufgeklappt sind (nur zur Laufzeit, bewusst nicht gespeichert).
const achievementsExpanded = new Set();

// Alphabetisch nach dem ANZEIGENAMEN sortieren, nicht nach dem deutschen Datensatz-Namen --
// sonst stimmt die Reihenfolge in der englischen Oberfläche nicht.
function sortCountriesByDisplayName(list) {
    const locale = currentLang === "en" ? "en" : "de";
    return list.slice().sort((a, b) => quizCountryNameByIso(a.iso).localeCompare(quizCountryNameByIso(b.iso), locale));
}

// withFlag=false für noch offene Länder: deren Flagge hat man ja noch gar nicht (richtig) gesehen --
// sie hier zu zeigen würde den Erfolg vorwegnehmen.
function achievementCountryChipsHtml(list, withFlag) {
    const chips = sortCountriesByDisplayName(list).map(c => {
        const label = escapeHtml(quizCountryNameByIso(c.iso));
        if (!withFlag) return '<span class="achv-country-chip achv-chip-open">' + label + '</span>';
        return '<span class="achv-country-chip achv-chip-done">' +
            '<img src="' + flagImageUrl(c.iso) + '" alt="" loading="lazy">' + label + '</span>';
    }).join("");
    return '<div class="achv-country-chips">' + chips + '</div>';
}

function achievementContinentDetailHtml(entry) {
    const p = entry.progress;
    const open = p.open || [], done = p.done || [];
    let html = "";
    if (open.length) {
        html += '<div class="achv-detail-label achv-detail-label-open">' + escapeHtml(t("achievements.detailOpenLabel").replace("{n}", open.length)) + '</div>';
        html += achievementCountryChipsHtml(open, false);
    } else {
        html += '<div class="achv-detail-alldone">' + escapeHtml(t("achievements.detailAllDone")) + '</div>';
    }
    if (done.length) {
        html += '<div class="achv-detail-label achv-detail-label-done">' + escapeHtml(t("achievements.detailDoneLabel").replace("{n}", done.length)) + '</div>';
        html += achievementCountryChipsHtml(done, true);
    } else {
        html += '<div class="achv-detail-alldone">' + escapeHtml(t("achievements.detailNoneDone")) + '</div>';
    }
    return html;
}

function achievementMetaDetailHtml(entry) {
    const details = entry.continentDetails || [];
    const locale = currentLang === "en" ? "en" : "de";
    const byName = arr => arr.slice().sort((a, b) => continentDisplayName(a.continent).localeCompare(continentDisplayName(b.continent), locale));
    const open = byName(details.filter(d => !d.unlocked));
    const done = byName(details.filter(d => d.unlocked));
    const rowHtml = d => {
        const state = d.unlocked
            ? t("achievements.detailContinentDone").replace("{total}", d.total)
            : t("achievements.detailContinentRemaining").replace("{n}", d.total - d.current).replace("{total}", d.total);
        return '<div class="achv-continent-row' + (d.unlocked ? ' achv-row-done' : ' achv-row-open') + '">' +
            '<span class="achv-continent-row-name">' + (CONTINENT_ICONS[d.continent] || "🌐") + ' ' + escapeHtml(continentDisplayName(d.continent)) + '</span>' +
            '<span class="achv-continent-row-state">' + escapeHtml(state) + '</span></div>';
    };
    let html = "";
    if (open.length) {
        html += '<div class="achv-detail-label achv-detail-label-open">' + escapeHtml(t("achievements.detailOpenLabel").replace("{n}", open.length)) + '</div>';
        html += '<div class="achv-continent-rows">' + open.map(rowHtml).join("") + '</div>';
    } else {
        html += '<div class="achv-detail-alldone">' + escapeHtml(t("achievements.detailAllContinentsDone")) + '</div>';
    }
    if (done.length) {
        html += '<div class="achv-detail-label achv-detail-label-done">' + escapeHtml(t("achievements.detailDoneLabel").replace("{n}", done.length)) + '</div>';
        html += '<div class="achv-continent-rows">' + done.map(rowHtml).join("") + '</div>';
    }
    return html;
}

function achievementDetailHtml(entry) {
    if (entry.def.category === "meta") return achievementMetaDetailHtml(entry);
    return achievementContinentDetailHtml(entry);
}

function achievementCardHtml(entry) {
    const titleText = achievementDisplayName(entry);
    const pct = entry.progress.total > 0 ? Math.min(100, Math.round((entry.progress.current / entry.progress.total) * 100)) : 0;
    const icon = achievementIcon(entry.def);
    const iconPrefix = icon ? (icon + " ") : "";

    // Detailinhalt wird NUR im aufgeklappten Zustand erzeugt: über alle 24 Kontinent-Karten hinweg
    // kämen sonst mehrere hundert Flaggenbilder auf einmal ins DOM.
    let detailHtml = "";
    if (achievementHasDetail(entry.def)) {
        const isOpen = achievementsExpanded.has(entry.def.id);
        detailHtml =
            '<button type="button" class="achv-detail-toggle" data-achv-toggle="' + entry.def.id + '">' +
                escapeHtml(isOpen ? t("achievements.detailHide") : t("achievements.detailShow")) +
            '</button>' +
            '<div class="achv-detail-body" data-achv-body="' + entry.def.id + '"' + (isOpen ? '' : ' style="display:none;"') + '>' +
                (isOpen ? achievementDetailHtml(entry) : '') +
            '</div>';
    }

    return '<div class="achv-card' + (entry.unlocked ? ' achv-unlocked' : '') + '">' +
        '<div class="achv-card-title">' + iconPrefix + escapeHtml(titleText) + (entry.unlocked ? ' <span class="achv-badge">' + t("achievements.unlockedBadge") + '</span>' : '') + '</div>' +
        '<div class="achv-card-desc">' + escapeHtml(achievementDescription(entry)) + '</div>' +
        '<div class="achv-progress-outer"><div class="achv-progress-inner" style="width:' + pct + '%;"></div></div>' +
        '<div class="achv-card-progress-line">' + escapeHtml(achievementProgressLine(entry)) + '</div>' +
        detailHtml +
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

    const categories = ["continent", "meta", "milestone", "streak", "battle"];
    let cardsHtml = "";
    categories.forEach(cat => {
        const entries = statusList.filter(e => e.def.category === cat);
        if (!entries.length) return;
        cardsHtml += '<div class="achv-category-heading">' + achievementCategoryLabel(cat) + '</div>';
        cardsHtml += entries.map(achievementCardHtml).join("");
    });

    // cachedTierIcon ist in js/init.js deklariert (dort auch aktuell gehalten, siehe
    // refreshCrownStatus()) -- funktioniert hier nur, weil alle <script>-Tags dieses Projekts
    // denselben globalen Gültigkeitsbereich teilen UND init.js in index.html vor dem ersten
    // möglichen Aufruf dieser Funktion (Klick auf "Erfolge") bereits vollständig geladen ist.
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

    // Auf-/Zuklappen bewusst OHNE kompletten Neuaufbau des Bildschirms: sonst würden beim Öffnen
    // einer Karte alle bereits geladenen Flaggenbilder der anderen Karten kurz neu aufflackern.
    Array.from(container.querySelectorAll("[data-achv-toggle]")).forEach(btn => {
        btn.onclick = function () {
            const id = btn.getAttribute("data-achv-toggle");
            const entry = statusList.find(e => e.def.id === id);
            const body = container.querySelector('[data-achv-body="' + id + '"]');
            if (!entry || !body) return;
            const nowOpen = !achievementsExpanded.has(id);
            if (nowOpen) achievementsExpanded.add(id); else achievementsExpanded.delete(id);
            body.innerHTML = nowOpen ? achievementDetailHtml(entry) : "";
            body.style.display = nowOpen ? "block" : "none";
            btn.textContent = nowOpen ? t("achievements.detailHide") : t("achievements.detailShow");
        };
    });
}

function goToAchievementsScreen() {
    hideAllScreens();
    setChromeVisible(true);
    setAchievementsNewFlag(false); // "Neu"-Punkt auf der Kachel verschwindet, sobald man hier war
    renderAchievementsScreen();
    document.getElementById("achievementsScreen").style.display = "block";
}

// ---------- Benachrichtigung bei neu freigeschalteten Erfolgen ----------
// computeAchievementStatus() rechnet bei jedem Aufruf frisch aus den Rohdaten -- es gibt also von
// sich aus kein "das war vorher schon freigeschaltet"-Wissen. Dafür merken wir uns hier den zuletzt
// bekannten Stand der freigeschalteten IDs und vergleichen bei den Rundenenden dagegen.
const ACHIEVEMENTS_SEEN_KEY = "flagquiz_erfolge_gesehen";
const ACHIEVEMENTS_NEW_FLAG_KEY = "flagquiz_erfolge_neu";

// null = noch nie befüllt (wichtig zu unterscheiden von [] = befüllt, aber nichts freigeschaltet).
function loadSeenAchievementIds() {
    try {
        const raw = localStorage.getItem(ACHIEVEMENTS_SEEN_KEY);
        if (raw === null) return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
}
function saveSeenAchievementIds(ids) {
    try { localStorage.setItem(ACHIEVEMENTS_SEEN_KEY, JSON.stringify(ids)); } catch (e) { /* ignorieren */ }
}
// Wird beim "Statistik zurücksetzen" mit aufgerufen (siehe js/init.js): die Erfolge selbst fallen
// dadurch weg, also soll ihr erneutes Erspielen auch wieder gemeldet werden.
function clearSeenAchievementIds() {
    try {
        localStorage.removeItem(ACHIEVEMENTS_SEEN_KEY);
        localStorage.removeItem(ACHIEVEMENTS_NEW_FLAG_KEY);
    } catch (e) { /* ignorieren */ }
    renderAchievementsNewDot();
}

// Einmalige stille Erst-Befüllung beim App-Start: ohne sie würden Bestandsspieler:innen beim ersten
// Rundenende nach diesem Update auf einen Schlag ALLE längst erfüllten Erfolge gemeldet bekommen.
function seedSeenAchievementsIfMissing() {
    if (loadSeenAchievementIds() !== null) return;
    saveSeenAchievementIds(computeAchievementStatus().filter(e => e.unlocked).map(e => e.def.id));
}

function setAchievementsNewFlag(on) {
    try {
        if (on) localStorage.setItem(ACHIEVEMENTS_NEW_FLAG_KEY, "1");
        else localStorage.removeItem(ACHIEVEMENTS_NEW_FLAG_KEY);
    } catch (e) { /* ignorieren */ }
    renderAchievementsNewDot();
}

// Roter Punkt auf der Erfolge-Kachel im Hauptmenü -- fängt den Fall ab, dass die Einblendung am
// Rundenende übersehen wurde.
function renderAchievementsNewDot() {
    const tile = document.getElementById("tileAchievements");
    if (!tile) return;
    let on = false;
    try { on = localStorage.getItem(ACHIEVEMENTS_NEW_FLAG_KEY) === "1"; } catch (e) { /* ignorieren */ }
    tile.classList.toggle("has-new-dot", on);
}

// Wird an den Rundenenden aufgerufen (Entdecker-Modus, Gipfelsturm, Battle -- siehe dort). Meldet
// jeden Erfolg genau einmal und gibt die neu freigeschalteten Einträge zurück.
function checkForNewAchievements() {
    const seen = loadSeenAchievementIds();
    const unlockedNow = computeAchievementStatus().filter(e => e.unlocked);
    const unlockedIds = unlockedNow.map(e => e.def.id);
    saveSeenAchievementIds(unlockedIds);
    if (seen === null) return []; // erster Aufruf überhaupt: nur merken, nichts melden
    const fresh = unlockedNow.filter(e => seen.indexOf(e.def.id) === -1);
    if (!fresh.length) return [];
    setAchievementsNewFlag(true);
    fresh.forEach(entry => {
        const icon = achievementIcon(entry.def);
        showAchievementToast((icon ? icon + " " : "") + achievementDisplayName(entry));
    });
    return fresh;
}
