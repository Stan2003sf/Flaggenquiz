// ---------- Ladder-Modus: globale Flaggen-Statistik (Baustein 1 des Konzepts) ----------
// Eigene Collection "flaggenstatistik" (Dokument "global"), getrennt von der "highscores"-
// Collection — WICHTIG: dafür muss in der Firebase-Konsole eine eigene Security Rule für die
// Collection "flaggenstatistik" angelegt werden (außerhalb dieses Repos, siehe README/Doku).
// Struktur des Dokuments: { stats: { "de": { gesehen: 12, richtig: 9 }, "fr": { ... }, ... } }
//
// Frühere Version lag unter highscores/flagquiz_flaggenstatistik — fetchFlagStats liest diesen
// alten Stand einmalig nach, falls die neue Collection noch leer ist, und schreibt ihn (best-
// effort) in die neue Collection um, damit kein bereits gesammelter Fortschritt verloren geht.
const FLAG_STATS_LEGACY_KEY = "flagquiz_flaggenstatistik"; // alter Schlüssel in der "highscores"-Collection
const FLAG_STATS_LOCAL_KEY = "flagquiz_flaggenstatistik_lokal"; // Offline-Fallback

function getLocalFlagStats() {
    try {
        const raw = localStorage.getItem(FLAG_STATS_LOCAL_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
}
function saveLocalFlagStats(stats) {
    try { localStorage.setItem(FLAG_STATS_LOCAL_KEY, JSON.stringify(stats)); } catch (e) { /* ignorieren */ }
}

function flagStatsDocRef() {
    return firestoreDb.collection("flaggenstatistik").doc("global");
}

// Einmaliger, bestmöglicher Umzug vom alten Speicherort — schlägt still fehl, wenn die neue
// Collection noch keine Schreibrechte hat (siehe Kommentar oben); dann wird beim nächsten Aufruf
// einfach erneut versucht.
async function migrateLegacyFlagStats(legacyStats) {
    try {
        await flagStatsDocRef().set({ stats: legacyStats }, { merge: true });
    } catch (e) {
        console.warn("Alte Flaggen-Statistik konnte nicht in die neue Collection übernommen werden — Sicherheitsregel für 'flaggenstatistik' angelegt?", e);
    }
}

// Lädt die globale Flaggen-Statistik (einmalig pro Ladder-Rundenstart, siehe Konzept Punkt 1).
async function fetchFlagStats() {
    if (!firestoreDb) return { stats: getLocalFlagStats(), online: false };
    try {
        const doc = await flagStatsDocRef().get();
        let stats = (doc.exists && doc.data().stats && typeof doc.data().stats === "object") ? doc.data().stats : null;
        if (!stats) {
            // Neue Collection noch leer -> einmalig am alten Speicherort nachsehen und übernehmen.
            const legacyDoc = await firestoreDb.collection("highscores").doc(FLAG_STATS_LEGACY_KEY).get();
            const legacyStats = (legacyDoc.exists && legacyDoc.data().stats && typeof legacyDoc.data().stats === "object") ? legacyDoc.data().stats : {};
            stats = legacyStats;
            if (Object.keys(legacyStats).length > 0) migrateLegacyFlagStats(legacyStats);
        }
        saveLocalFlagStats(stats);
        return { stats: stats, online: true };
    } catch (e) {
        console.warn("Globale Flaggen-Statistik nicht erreichbar, nutze lokalen Stand.", e);
        return { stats: getLocalFlagStats(), online: false };
    }
}

// Erhöht "gesehen" (und ggf. "richtig") für ein Land um 1. Läuft im Hintergrund (nicht
// abgewartet) und darf ruhig scheitern — die Statistik ist bewusst unkritisch (siehe Konzept:
// Manipulierbarkeit wird in Kauf genommen). Läuft nebenbei auch als lokaler Fallback-Zähler mit.
async function incrementFlagStat(iso, wasCorrect) {
    const local = getLocalFlagStats();
    if (!local[iso]) local[iso] = { gesehen: 0, richtig: 0 };
    local[iso].gesehen++;
    if (wasCorrect) local[iso].richtig++;
    saveLocalFlagStats(local);

    if (!firestoreDb) return;
    try {
        const inc = firebase.firestore.FieldValue.increment(1);
        const update = {};
        update[iso + ".gesehen"] = inc;
        if (wasCorrect) update[iso + ".richtig"] = inc;
        await flagStatsDocRef().set({ stats: update }, { merge: true });
    } catch (e) {
        // Unkritisch — Statistik darf ruhig mal einen Eintrag verpassen.
        console.warn("Flaggen-Statistik konnte nicht zentral aktualisiert werden.", e);
    }
}

// Berechnet die Ladder-Reihenfolge "bekannt -> unbekannt" aus der globalen Statistik.
// Bekanntheit = richtig / gesehen; noch nie gesehene Länder gelten als am wenigsten bekannt
// (Kaltstart-Problem wird laut Konzept bewusst in Kauf genommen).
function computeLadderOrder(stats) {
    const scored = countries.map(c => {
        const s = stats[c.iso];
        const gesehen = (s && typeof s.gesehen === "number") ? s.gesehen : 0;
        const richtig = (s && typeof s.richtig === "number") ? s.richtig : 0;
        const bekanntheit = gesehen > 0 ? (richtig / gesehen) : -1;
        return { name: c.name, iso: c.iso, continent: c.continent, gesehen: gesehen, richtig: richtig, bekanntheit: bekanntheit };
    });
    scored.sort((a, b) => b.bekanntheit - a.bekanntheit || a.iso.localeCompare(b.iso));
    return scored;
}

// ---------- Kurzzeitiger Zwischenspeicher für die Bestenliste (spart Firestore-Anfragen) ----------
// Wird z. B. beim schnellen Durchklicken der Einstellungen genutzt, statt bei jedem Klick
// erneut die zentrale Liste zu laden. Nach Ablauf der TTL wird wieder frisch geladen.
const HIGHSCORE_CACHE_TTL_MS = 60 * 1000;
const highscoreCache = new Map(); // key -> { data: {list, online}, ts }

async function fetchTopListCached(key) {
    const cached = highscoreCache.get(key);
    if (cached && (Date.now() - cached.ts) < HIGHSCORE_CACHE_TTL_MS) {
        return cached.data;
    }
    const data = await fetchTopList(key);
    highscoreCache.set(key, { data: data, ts: Date.now() });
    return data;
}

// Aktualisiert den Cache direkt nach dem Speichern, damit die nächste Anzeige nicht
// nochmal nachladen muss.
function setHighscoreCache(key, list, online) {
    highscoreCache.set(key, { data: { list: list, online: online }, ts: Date.now() });
}

function continentLabel() {
    if (settings.continents.length === continents.length) return t("highscore.allContinents");
    return settings.continents.map(continentDisplayName).join(", ");
}

// Kontinent-Auswahl als Emoji-Kürzel für den kompakten Bestenlisten-Titel (statt Klartext).
function continentIconLabel() {
    if (settings.continents.length === continents.length) return "🌍";
    return continents.filter(c => settings.continents.includes(c)).map(c => CONTINENT_ICONS[c] || "🌐").join(" ");
}

// Profi-/Speedmodus als Emoji-Kürzel für den kompakten Bestenlisten-Titel.
function specialModeIconLabel() {
    const icons = [];
    if (settings.proMode) icons.push("🎯");
    if (settings.speedMode) icons.push("⚡");
    return icons.join(" ");
}

async function updateHighscoreDisplay() {
    // Im Gruppenquiz zählt nur die Gruppen-Bestenliste — die globale Bestenliste wird
    // hier weder angezeigt noch abgerufen (spart unnötige Firestore-Anfragen).
    const highscoreAccordionWrap = document.getElementById("highscoreAccordionWrap");
    if (isGroupPlayer || getLeaderSession()) {
        if (highscoreAccordionWrap) highscoreAccordionWrap.style.display = "none";
        highscoreDisplay.innerHTML = "";
        return;
    }
    if (highscoreAccordionWrap) highscoreAccordionWrap.style.display = "";

    const key = highscoreKey();
    const modeLabelText = modeLabel();
    const modeIcons = specialModeIconLabel();
    // Kompakter Titel: 🚩 Anzahl · Kontinent-Emoji(s) · Antwortmodus ausgeschrieben · Profi-/Speed-Emoji
    // "Bestenliste" entfällt hier bewusst, da das Aufklapp-Menü direkt darüber bereits "🏆 Bestenliste" zeigt.
    const subtitle = `🚩 ${settings.length} · ${continentIconLabel()} · ${modeLabelText}` + (modeIcons ? ` · ${modeIcons}` : "");

    highscoreDisplay.innerHTML = `
        <div class="highscore-card hs-empty">
            <span class="trophy">🏆</span>
            <div>${t("common.loading")}</div>
        </div>`;

    const { list, online } = await fetchTopListCached(key);
    const tierIcons = await getLadderTierDeviceIdMap();
    const titleTexts = await getPlayerTitleDeviceIdMap();
    const statusLine = online
        ? `<span title="${t("common.onlineTitle")}">${t("common.online")}</span>`
        : `<span title="${t("common.offlineTitle")}">${t("common.offline")}</span>`;

    if (list.length === 0) {
        highscoreDisplay.innerHTML = `
            <div class="highscore-card hs-empty">
                <span class="trophy">🏆</span>
                <div class="hs-card-title" style="margin-bottom:4px;">${t("highscore.noneYet")}</div>
                <div>${subtitle}<br>${t("common.beTheFirst")}</div>
                <div class="hs-status">${statusLine}</div>
            </div>`;
        return;
    }

    const medals = ["🥇", "🥈", "🥉"];
    let lastScore = null, lastRank = 0;
    const rowsHtml = list.slice(0, 50).map((entry, i) => {
        // Gleiche Punktzahl = gleicher Rang (Punkt 3); die interne Sortierung entscheidet bei
        // Punktegleichstand bereits per höherem Prestige über die Reihenfolge.
        const rank = (entry.score === lastScore) ? lastRank : (i + 1);
        lastScore = entry.score;
        lastRank = rank;
        const prestige = entry.prestige || 0;
        const tierIcon = tierIcons.get(entry.deviceId);
        const titleText = titleTexts.get(entry.deviceId);
        const nameHtml = nameWithTitleHtml(entry.name || t("common.anonymous"), tierIcon, titleText);
        return `
        <div class="hs-row rank-${rank}">
            <div class="hs-medal">${rank <= 3 ? medals[rank - 1] : rank + "."}</div>
            <div class="hs-row-name">${nameHtml}${prestige > 0 ? ' <span class="hs-prestige" title="' + t("highscore.prestigeTitle") + prestige + '×">💎' + (prestige > 1 ? ' ×' + prestige : '') + '</span>' : ''}</div>
            <div class="hs-row-score">${entry.score} ${t("highscore.points")}</div>
        </div>`;
    }).join("");

    highscoreDisplay.innerHTML = `
        <div class="highscore-card">
            <div class="hs-card-title">${subtitle}</div>
            <div class="hs-row-list">${rowsHtml}</div>
            <div class="hs-status">${statusLine}</div>
        </div>`;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// ---------- Persönliche Lernstatistik (nur lokal auf diesem Gerät) ----------
// ---------- Geräte-ID (zur Wiedererkennung für "nur Bestwert zählt") ----------
const DEVICE_ID_KEY = "flagquiz_device_id";

function getDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
        id = (window.crypto && crypto.randomUUID)
            ? crypto.randomUUID()
            : "dev-" + Date.now() + "-" + Math.random().toString(36).slice(2);
        try { localStorage.setItem(DEVICE_ID_KEY, id); } catch (e) { /* ignorieren */ }
    }
    return id;
}

