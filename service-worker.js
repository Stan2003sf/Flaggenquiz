// Einfacher Service Worker: cached die App-Hülle (HTML, Icons) für Offline-Start.
// Die Flaggenbilder selbst kommen weiterhin live von flagcdn.com und benötigen eine Internetverbindung.

const CACHE_NAME = "flaggenquiz-cache-v1";
const APP_SHELL = [
    "./Flaggenquiz.html",
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

    // Flaggenbilder von flagcdn.com immer live aus dem Netz laden, nicht cachen
    if (url.hostname.includes("flagcdn.com")) {
        return;
    }

    // App-Hülle: zuerst aus dem Cache, im Hintergrund aktualisieren
    event.respondWith(
        caches.match(event.request).then((cached) => {
            const networkFetch = fetch(event.request)
                .then((response) => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => cached);
            return cached || networkFetch;
        })
    );
});
