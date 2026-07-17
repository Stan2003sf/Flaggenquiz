// Service Worker: cached die App-Hülle (HTML, Icons) NUR als Offline-Rückfallebene.
// Strategie: "Network First" - bei bestehender Internetverbindung wird IMMER die aktuellste
// Version vom Server geladen. Der Cache wird nur genutzt, wenn das Netzwerk nicht erreichbar ist.
// (Vorherige Version nutzte "Cache First" - dadurch kamen Updates immer erst mit Verzögerung an.)

const CACHE_NAME = "flaggenquiz-cache-v2";
const APP_SHELL = [
    "./Flaggenquiz.html",
    "./index.html",
    "./manifest.json",
    "./icon-192.png",
    "./icon-512.png",
    "./apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);

    // Flaggenbilder von flagcdn.com immer normal aus dem Netz laden, nicht über den Service Worker
    if (url.hostname.includes("flagcdn.com")) {
        return;
    }

    // App-Hülle: IMMER zuerst versuchen, die aktuelle Version aus dem Netz zu laden.
    // Nur bei echtem Verbindungsfehler (offline) wird auf den letzten gecachten Stand zurückgegriffen.
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
