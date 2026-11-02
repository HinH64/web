const CACHE = "shiguang-shell-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll([
          "/",
          "/favicon.svg",
          "/manifest.webmanifest",
          "/icon-192.png",
          "/icon-512.png",
        ]),
      ),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("shiguang-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("signin-with-chatgpt") ||
    url.pathname.includes("signout-with-chatgpt") ||
    url.pathname.includes("callback") ||
    event.request.headers.has("RSC")
  )
    return;
  if (event.request.mode === "navigate")
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (
            response.ok &&
            response.type === "basic" &&
            !response.redirected
          ) {
            const clone = response.clone();
            void caches.open(CACHE).then((cache) => cache.put("/", clone));
          }
          return response;
        })
        .catch(() =>
          caches.match("/").then((response) => response || Response.error()),
        ),
    );
  else if (/\.(js|css|svg|png|woff2?)(\?|$)/.test(url.pathname))
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ||
          fetch(event.request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              void caches
                .open(CACHE)
                .then((cache) => cache.put(event.request, clone));
            }
            return response;
          }),
      ),
    );
});
