self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.mode !== "navigate") return;
  event.respondWith(
    fetch(request).catch(
      () =>
        new Response("Bite Sized needs a connection. Open it again when you are online.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }),
    ),
  );
});
