"use strict";
//
// NOTE: THE SERVICE WORKER "fetch" EVENT WON'T FIRE UNLESS service-worker.js IS AT THE SAME LEVEL AS index.html
//
const VERSION = "0.9";
const CACHE_NAME = `laura-${VERSION}`;
const APP_STATIC_RESOURCES = [
    "/",
    "/index.html",
    "/manifest.json",
    "/service-worker.js",
    "/js/index.js",
    "/teller-180x180.png",
    "/assets/geai-bleu-500x500.jpg",
    "/assets/lady2.jpg",
    "/assets/lady2-map.jpg",
    "/assets/ukulele.mp3",
];
// On install, cache the static resources
self.addEventListener("install", (event) => {
    console.log("install");
    const preCache = async () => {
        const cache = await caches.open(CACHE_NAME);
        return cache.addAll(APP_STATIC_RESOURCES);
    };
    event.waitUntil(preCache());
});
// On activate, delete old caches
self.addEventListener("activate", (event) => {
    console.log("activate");
    const preCached = async () => {
        const names = await caches.keys();
        await Promise.all(names.map(name => {
            if (name !== CACHE_NAME) {
                return caches.delete(name);
            }
            return;
        }));
        return await clients.claim();
    };
    event.waitUntil(preCached());
});
// On fetch, return the fetched/cached Response from the cache
self.addEventListener("fetch", (event) => {
    console.log("fetch", event.request.url);
    // When seeking an HTML page, return to index.html
    if (event.request.mode === "navigate") {
        event.respondWith(caches.match("/"));
        return;
    }
    // Return the cached response if it's available.
    // Respond with a HTTP 404 response status otherwise.
    const cached = async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(event.request.url);
        return cachedResponse !== null && cachedResponse !== void 0 ? cachedResponse : new Response(null, { status: 404 });
    };
    // For every other request type
    event.respondWith(cached());
});
