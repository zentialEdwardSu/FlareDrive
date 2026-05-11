const THUMBNAIL_CACHE = "flaredrive-thumbnail-cache-v1";
const THUMBNAIL_PREFIX = "/webdav/_$flaredrive$/thumbnails/";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("flaredrive-thumbnail-cache-"))
            .filter((key) => key !== THUMBNAIL_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CLEAR_THUMBNAIL_CACHE") return;
  event.waitUntil(caches.delete(THUMBNAIL_CACHE));
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isThumbnail =
    url.origin === self.location.origin && url.pathname.startsWith(THUMBNAIL_PREFIX);

  if (!isThumbnail || event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const cached = response.clone();
          event.waitUntil(
            caches.open(THUMBNAIL_CACHE).then((cache) => cache.put(event.request, cached))
          );
        }
        return response;
      })
      .catch(() => new Response(null, { status: 504 }))
  );
});
