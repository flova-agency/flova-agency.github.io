/* Service worker minimal : rend le site installable comme une appli. Il ne met rien en cache et n'intercepte
   aucune requête : chaque ouverture montre la dernière version du site. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
