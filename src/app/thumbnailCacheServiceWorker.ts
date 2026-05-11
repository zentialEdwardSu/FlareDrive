const SERVICE_WORKER_URL = "/thumbnail-cache-sw.js";

function canUseServiceWorker() {
  return (
    "serviceWorker" in navigator &&
    (window.location.protocol === "https:" || window.location.hostname === "localhost")
  );
}

export function registerThumbnailCacheServiceWorker() {
  if (!canUseServiceWorker()) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register(SERVICE_WORKER_URL).catch(() => {
      // Thumbnail caching is opportunistic; the app should work without it.
    });
  });
}

export async function clearThumbnailCache() {
  if (!canUseServiceWorker()) return;

  const registration = await navigator.serviceWorker.getRegistration("/");
  registration?.active?.postMessage({ type: "CLEAR_THUMBNAIL_CACHE" });
}
