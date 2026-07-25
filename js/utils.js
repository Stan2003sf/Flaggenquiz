// ---------- Hilfsfunktionen ----------

// Liefert den lokalen Pfad zum Flaggenbild (SVG, im Repo unter flags/ abgelegt) — zentrale Stelle,
// damit Format/Ablageort nur an einer Stelle geändert werden muss.
function flagImageUrl(iso) {
    return "flags/" + iso + ".svg";
}

// Zeigt eine kurz aufsteigende, ausblendende Text-Anzeige über einem Element (z. B. "+20", "-1
// Leben"), ähnlich den bekannten Schadens-/Punkte-Zahlen in vielen Spielen. variantClass "positive"
// (grün) oder "negative" (rot) steuert die Farbe, alles andere bleibt neutral (aktuelle Textfarbe).
// Einmalig, entfernt sich nach der Animation selbst — kein weiterer Aufräum-Aufruf nötig.
function showFloatingText(text, anchorEl, variantClass) {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const span = document.createElement("span");
    span.className = "floating-text" + (variantClass ? " " + variantClass : "");
    span.textContent = text;
    span.style.left = (rect.left + rect.width / 2) + "px";
    span.style.top = rect.top + "px";
    document.body.appendChild(span);
    setTimeout(() => span.remove(), 1150);
}

// Erzeugt aus einem beliebigen Text einen 32-Bit-Zahlenwert (deterministisch, immer gleiches
// Ergebnis für denselben Text). Wird als "Saatgut" für die Gruppen-Zufallsfolge genutzt.
function stringToSeed(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return h >>> 0;
}

// Deterministischer Zufallszahlen-Generator ("mulberry32"): liefert bei gleichem Saatgut auf
// jedem Gerät exakt dieselbe Folge von Zufallszahlen zwischen 0 und 1 — Grundlage dafür, dass
// alle Mitspieler:innen einer Gruppenrunde dieselben Flaggen in derselben Reihenfolge und
// dieselben Antwortoptionen bekommen, ohne dass die Fragen selbst übertragen werden müssen.
function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
        t = (t + 0x6D2B79F5) | 0;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

// Aktueller Zufallsgenerator für die laufende Gruppenrunde (null außerhalb des Gruppenquiz —
// dann wird ganz normal mit echtem Zufall (Math.random) gespielt wie bisher).
let groupRng = null;

function shuffle(array, rng) {
    const rand = rng || Math.random;
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function normalize(str) {
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");
}

// ---------- Namensfilter (Jugendschutz) ----------
// Liste bewusst nicht abschließend/öffentlich diskutiert - dient nur der technischen Filterung.
const BLOCKED_TERMS = [
    // Deutsch: Vulgär- und Kraftausdrücke, sexuelle Begriffe
    "fick","ficke","fickt","fotze","hure","nutte","schlampe","wichser","wichs",
    "arsch","arschloch","schwanz","penis","vagina","sex","porno","scheisse","scheiße",
    "scheiss","kacke","hurensohn","hurentochter","bastard","drecksau","fresse","hackfresse",

    // Deutsch: diskriminierend / extremistisch
    "nazi","hitler","neger","behindert","spast","mongo","missgeburt","schwuchtel",
    "kanake","bimbo",

    // Deutsch: allgemeine Beleidigungen / aktueller Jugendslang
    "idiot","vollidiot","vollpfosten","spacken","opfer","asi","asozial","npc",

    // Englisch
    "fuck","shit","bitch","asshole","dick","cock","pussy","cunt","whore","slut",
    "nigger","faggot","retard","rape","porn",

    // Türkisch (lateinisch geschrieben, wie üblich getippt)
    "amk","siktir","orospu","piç","yavsak","yavşak","salak","manyak","kahpe","gavat",

    // Arabisch (lateinisch transkribiert)
    "sharmuta","charmuta","kahba","khara","kalb","zeb","kos","manyak",

    // Arabisch (Originalschrift, gängigste Beleidigungen)
    "شرموطة","كسمك","خرا","كلب","ابن الكلب","قحبة"
];

function normalizeForFilter(str) {
    return normalize(str)
        .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e")
        .replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t")
        .replace(/@/g, "a").replace(/\$/g, "s")
        .replace(/[^a-z\u0600-\u06FF]/g, "");
}

function containsBlockedContent(text) {
    const cleaned = normalizeForFilter(text);
    if (!cleaned) return false;
    return BLOCKED_TERMS.some(term => cleaned.includes(term));
}

// ---------- Positive Fantasienamen-Generator (Zielgruppe 8-15 Jahre: lustig statt nur nett) ----------
const NAME_ADJECTIVES = [
    "Lustiger","Kichernder","Quietschiger","Wackeliger","Hüpfender","Zappeliger",
    "Schrulliger","Kribbeliger","Blubbernder","Verpeilter","Mutiger","Goldener",
    "Blitzschneller","Käsiger","Flauschiger","Chaotischer","Geheimnisvoller","Cooler"
];
const NAME_NOUNS = [
    "Lurch","Wackelpudding","Erdmännchen","Waschbär","Flamingo","Faultier",
    "Frosch","Panda","Fuchs","Pinguin","Drache","Ninja","Einhorn","Qualle",
    "Kartoffel","Socke","Keks","Otter"
];
// Ganze witzige Phrasen als Alternative zum Adjektiv+Tier-Muster — sorgt für mehr Abwechslung,
// kurz und ohne Fremdwörter, passend zur Zielgruppe.
const NAME_PHRASES = [
    "Flaggenträger im Urlaub","Kartoffel mit Krone","Ninja im Pyjama",
    "Drache ohne Feuer","Pirat ohne Schiff","Flaggen-Detektiv",
    "Geheimagent Socke","Pommes-Prinzessin","Käse-Kapitän","Chaos-Chef",
    "Wackelpudding-Fan","Held der Pause","Ritter ohne Rüstung","Weltmeister im Kichern"
];

function generateFantasyName() {
    const num = Math.floor(Math.random() * 90) + 10; // 10-99, reduziert Namensdopplungen
    if (Math.random() < 0.35) {
        const phrase = NAME_PHRASES[Math.floor(Math.random() * NAME_PHRASES.length)];
        return `${phrase} ${num}`;
    }
    const adj = NAME_ADJECTIVES[Math.floor(Math.random() * NAME_ADJECTIVES.length)];
    const noun = NAME_NOUNS[Math.floor(Math.random() * NAME_NOUNS.length)];
    return `${adj} ${noun} ${num}`;
}

function levenshtein(a, b) {
    const dp = [];
    for (let i = 0; i <= a.length; i++) dp.push([i]);
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
        }
    }
    return dp[a.length][b.length];
}

function typoThresholdForLength(len) {
    if (len <= 3) return 0;
    if (len <= 5) return 1;
    if (len <= 8) return 2;
    if (len <= 12) return 3;
    return 4;
}

function checkAnswer(userRaw, correctName) {
    const user = normalize(userRaw);
    const correct = normalize(correctName);
    if (!user) return { correct: false, fuzzy: false };
    if (user === correct) return { correct: true, fuzzy: false };
    const threshold = settings.proMode
        ? (correct.length >= 5 ? 1 : 0)
        : typoThresholdForLength(correct.length);
    if (levenshtein(user, correct) <= threshold) return { correct: true, fuzzy: true };
    return { correct: false, fuzzy: false };
}

// ---------- Sound Mute ----------
// Standardmäßig AN (Ton An), außer der/die Spieler:in hat aktiv "Aus" gewählt.
let soundMuted = localStorage.getItem("flagquiz_muted") === "true";

function updateMuteButton() {
    muteBtn.textContent = soundMuted ? "🔇 Ton: AUS" : "🔊 Ton: AN";
    muteBtn.title = soundMuted ? "Sound einschalten" : "Sound ausschalten";
    muteBtn.classList.toggle("selected", !soundMuted);
}

function playTone(freq, dur, type) {
    if (soundMuted) return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type || "sine";
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
        osc.start();
        osc.stop(ctx.currentTime + dur);
    } catch (e) { /* Audio nicht verfügbar, ignorieren */ }
}
function playCorrectSound() {
    playTone(880, 0.15, "sine");
    setTimeout(() => playTone(1200, 0.2, "sine"), 100);
}
function playWrongSound() {
    playTone(180, 0.35, "sawtooth");
}
// Wird bei jedem neuen Siegesserien-Meilenstein gespielt (Bonuspunkt steigt tatsächlich).
// Der Ton wird mit höherer Serie etwas höher/heller, damit lange Serien sich besonders anfühlen.
function playStreakMilestoneSound(level) {
    const freq = 520 + Math.min(level, 12) * 55;
    playTone(freq, 0.16, "triangle");
    setTimeout(() => playTone(freq * 1.35, 0.18, "triangle"), 90);
}

