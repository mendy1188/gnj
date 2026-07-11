const CACHE_NAME = "jah-oil-pos-offline-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_URLS" || !Array.isArray(event.data?.urls)) {
    return;
  }

  const urls = Array.from(
    new Set(
      event.data.urls.filter(
        (url) => typeof url === "string" && url.startsWith(self.location.origin),
      ),
    ),
  );

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        urls.map((url) =>
          cache.add(
            new Request(url, {
              credentials: "same-origin",
            }),
          ),
        ),
      );
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);

  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith("/api/")) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkRequest = fetch(request)
        .then((response) => {
          if (response?.ok) {
            const responseClone = response.clone();

            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(request, responseClone))
              .catch(() => undefined);
          }

          return response;
        })
        .catch(() => cachedResponse);

      if (request.mode === "navigate") {
        return networkRequest.then((response) => response || cachedResponse);
      }

      return cachedResponse || networkRequest;
    }),
  );
});
