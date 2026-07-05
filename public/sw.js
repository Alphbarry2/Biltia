/* Biltia — Service Worker (conservateur, sûr pour un SaaS authentifié).
 *
 * Règles :
 *  - Jamais de cache sur /api (données + auth) ni sur les requêtes non-GET.
 *  - Navigations : réseau d'abord, page /offline en secours (aucune page authentifiée mise en cache).
 *  - Assets statiques immuables (_next/static, icônes, polices) : cache-first + revalidation en arrière-plan.
 */

const VERSION = "biltia-v2";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api")) return; // jamais de cache pour l'API

  // Navigations → réseau d'abord, secours hors-ligne.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Assets statiques → cache-first + revalidation.
  if (/\/_next\/static\/|\/icons\/|\.(?:js|css|woff2?|png|jpe?g|svg|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res && res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});

/* ── Notifications push (Web Push) ─────────────────────────────────────────
 * Le serveur envoie un payload JSON : { title, body, url, tag }.
 * Clic → focus d'un onglet Biltia existant, sinon ouverture de l'URL.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Biltia";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || "biltia",
    data: { url: data.url || "/dashboard" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((tabs) => {
      for (const tab of tabs) {
        if (new URL(tab.url).origin === self.location.origin && "focus" in tab) {
          tab.navigate(url);
          return tab.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
