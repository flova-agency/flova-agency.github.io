// Contrôle permanent (faute du 24/11/2026) : un élément caché doit être invisible, et le bandeau « Gardez ce projet » disparaît une fois connecté. Lancer : node tests/atelier_caches_test.js
const { chromium, devices } = require('playwright');
const F = 'https://nhukbglercraslszazan.supabase.co/functions/v1/ineed-atelier', K = 'sb_publishable_Oroyu2rpfCBnjnPxrf6GBQ_dTgkisoB';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage();
  // sans compte : un projet livré montre le bandeau
  await p.goto('https://ineed.shopping/atelier/#c=5a1d7a3c-7102-4f8a-b048-99657b2b63b0'); await p.waitForSelector('#v-livre.on', { timeout: 30000 });
  const avant = await p.isVisible('#garder');
  // connecté (robot) : le bandeau disparaît, sur le même projet
  const l = await fetch(F, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: K, Authorization: 'Bearer ' + K }, body: JSON.stringify({ action: 'lien_robot', email: 'robot-garder01@ineed.shopping' }) }).then(r => r.json());
  await p.goto(l.lien); await p.waitForTimeout(4000);
  await p.goto('https://ineed.shopping/atelier/#c=5a1d7a3c-7102-4f8a-b048-99657b2b63b0'); await p.reload(); await p.waitForSelector('#v-livre.on', { timeout: 30000 }); await p.waitForTimeout(800);
  const apres = await p.isVisible('#garder'), bouton = await p.textContent('#b-compte');
  // tous les éléments marqués « cachés » sont vraiment invisibles
  const fuites = await p.evaluate(() => [...document.querySelectorAll('[hidden]')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.id || e.className));
  await p.screenshot({ path: 'garder.png' });
  console.log(JSON.stringify({ sans_compte_bandeau: avant, connecte_bandeau: apres, bouton, caches_visibles: fuites }));
  await b.close();
})();
