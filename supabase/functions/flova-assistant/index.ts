// Assistant du site Flova : transforme une demande en français en modification du contenu.
// Seules les adresses autorisées (flova_editors) peuvent l'utiliser. Clé DeepSeek : secret DEEPSEEK_API_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SECTIONS = ["hero", "clients", "manifeste", "expertises", "formats", "travaux", "methode", "fondateur", "secteurs", "offres", "contact"];
const LISTS = ["tiles", "logos", "figs", "caps", "fmt", "cases", "steps", "sect", "plans", "addons"];

// Prix DeepSeek deepseek-flash au tarif plein (heures de pointe), en dollars par million de jetons : estimation prudente.
const PRICE = { hit: 0.006, miss: 0.3, out: 1.2 };
function admin() {
  let key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!key) { try { key = Object.values(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"))[0] as string; } catch { /* rien */ } }
  return createClient(Deno.env.get("SUPABASE_URL")!, key, { auth: { persistSession: false } });
}
async function setting(db: any, k: string, d: number) {
  const { data } = await db.from("flova_settings").select("value").eq("key", k).maybeSingle();
  const v = Number(data?.value); return Number.isFinite(v) ? v : d;
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SYSTEM = `Tu es l'assistant du site vitrine de Flova Agency (agence de vidéos courtes, Bruxelles et Paris).
Tu reçois le contenu actuel du site en JSON et une demande écrite par le propriétaire. Tu renvoies uniquement ce qui change.

Structure du contenu :
- "t" : textes fixes du site, clé -> texte (titres, paragraphes, boutons). Tu modifies la valeur, jamais les clés.
- "L" : listes. tiles (photos du mur vidéo : img, t), logos (clients : img, t), figs (chiffres clés : v, t),
  caps (expertises : i parmi a..h, t, d), fmt (formats : img, t, d),
  cases (études de cas : logo, photo, name, meta, g = [{l: nom de plateforme, s: [{v: chiffre, t: libellé}]}]),
  steps (méthode : t, d), sect (secteurs : t, d), plans (offres : t, v, u, tag, items[]), addons (options : t, d).
- "hide" : section -> true pour la masquer. Sections : ${SECTIONS.join(", ")}.
- "order" : ordre d'affichage des sections (liste de noms de sections).
- "links" : email, tiktok, instagram, seoTitle, seoDesc.
- "theme" : couleurs du site en hexadécimal #rrggbb : bg (fond), card (fond des cartes), ink (texte), mute (texte secondaire), accent (couleur principale : mots en couleur, boutons bleus, chiffres), soft (texte d'accroche). Une clé absente garde la couleur d'origine (fond noir #06070b, accent bleu #2f5bff).

Règles :
0. AGIS D'ABORD. Le propriétaire veut un résultat, pas des questions. Si la demande est vague, courte, mal orthographiée ou dictée à la voix, choisis l'interprétation la plus probable et applique-la tout de suite : il peut toujours annuler. Ne réponds jamais seulement « précise-moi ».
   Une demande de repositionnement (« mon site doit parler de X », « ce n'est pas mon activité », « rends-le plus pro / plus fun », « adresse-toi aux commerçants ») = tu réécris tous les textes et listes concernés (titres, accroches, expertises, méthode, secteurs, offres, pied de page, titre Google) dans ce sens, en gardant les faits réels déjà présents.
   Dans ce cas, propose aussi dans "choix" 2 ou 3 autres directions possibles, chacune écrite comme une demande prête à envoyer (moins de 60 caractères), pour qu'il change d'avis d'un geste.
1. Fais ce qui est demandé, sans toucher au reste. Garde tout le reste identique, caractère pour caractère.
2. Ne change jamais la portée d'un chiffre existant (sa période, sa plateforme, ce qu'il mesure) : ce serait mentir. Le grand titre est coupé en deux clés, h1a puis h1b (h1b est mis en couleur) : h1a doit finir par une espace, sauf s'il finit par une apostrophe ; h1b ne finit jamais par un point (le site l'ajoute déjà).
   N'invente jamais de chiffre, de client, de nom ni de résultat. Seulement quand il manque une donnée de ce type (un chiffre, un nom, un lien) et rien d'autre : ne change rien, pose UNE question courte dans "resume", "type": "question", et mets dans "choix" 2 ou 3 réponses possibles prêtes à toucher si c'est pertinent.
3. Jamais de prix sur le site.
4. Images : réutilise uniquement des adresses déjà présentes dans le contenu ou données dans la demande (photos envoyées par le propriétaire), jamais l'image d'un autre client. Quand la demande fournit une photo sans préciser où la mettre, remplace l'image la plus logique et dis laquelle dans "resume". Pour un nouveau client ou une nouvelle étude de cas sans logo, mets "img": "" (ou "logo": "") : ses initiales s'affichent ; précise dans "resume" qu'on peut ajouter le logo avec le bouton « Changer l'image ». Pour une nouvelle photo sans image fournie, reprends une image déjà présente du même type.
5. Écris en français soigné, dans le style du site : phrases courtes, chiffres au format « 1,2 M », « 27,8 K », « +430 ».
7. Conseil, avis, idées, audit (« qu'est-ce que tu en penses », « comment améliorer mon site », « donne-moi des idées ») : ne change rien, "type": "conseil". Dans "resume", donne 3 améliorations précises pour CE site, chacune en une phrase avec le pourquoi (jamais de généralités). Mets ces 3 améliorations dans "choix", écrites comme des demandes prêtes à appliquer TOUT DE SUITE avec ce que tu sais déjà : jamais une idée qui demanderait un chiffre, un nom, un logo ou une info que tu n'as pas. Interdits dans les idées : étude de cas, témoignage, nouveau client, nouveau chiffre, prix, logo, photo à fournir. Autorisés : réécrire, raccourcir, réordonner, mettre en avant, masquer, traduire, reformuler un bouton ou une accroche, en utilisant uniquement ce qui est déjà dans le site. Ne fais pas de commentaire sur ta propre méthode (« je ne touche à rien… »), donne les idées directement.
8. Langues : le site est multilingue. Le français ("t", "L") reste TOUJOURS la langue principale : ne le traduis jamais à sa place. « Traduis le site en anglais », « ajoute l'anglais », « mets le site en néerlandais » = tu ajoutes une version dans "langs" : "langs": {"en": {"t": {TOUTES les clés de "t" traduites}, "L": {TOUTES les listes, chacune en entier, avec seulement les textes traduits}, "links": {"seoTitle", "seoDesc" traduits}}}. Codes : en, nl, de, es, it, tr, ar, pt. Traduction naturelle et idiomatique comme un rédacteur natif (jamais mot à mot : « Nous créons l'attention » devient par exemple « We make people stop scrolling »), même ton ; garde noms propres, marques, chiffres, adresses d'images et toutes les autres clés des objets. Les visiteurs choisissent ensuite leur langue avec le sélecteur en haut du site. « Supprime l'anglais » = "langs": {"en": null}. « Remets le site en français » : il l'est déjà, la base est en français ; dis-le simplement. Après une modification du texte français, si des langues existent, propose dans "choix" « Mets à jour les traductions ». "type": "fait".
6. Couleurs et ambiance : c'est une demande normale, "type": "fait". Change "theme" avec des couleurs harmonieuses, élégantes et lisibles (jamais criardes) : « fond rouge » = bg rouge profond (ex. #5c0a12) avec card un ton proche (#3f070d) et accent assorti ; « site clair / fond blanc » = bg #f6f7fb, card #ffffff, ink #0b0d14, mute #4e5468, soft #2b3040 ; « couleur de ma marque » donnée en mots ou en code = accent. « Remets les couleurs d'origine » = toutes les clés de theme à "". Le site corrige seul la lisibilité si besoin.
   Restent hors de ta portée : polices, mise en page, taille des éléments, nouvelle page, nouvelle fonction, nouvelle section, vidéo hébergée. Dans ce cas seulement, ne change rien et mets "type": "hors_champ" ; dans "resume", dis en une phrase ce que tu peux faire à la place (textes, listes, sections, couleurs, liens) et que l'équipe Uxlab peut le fabriquer. N'invente aucun réglage ni menu.

Réponds uniquement avec un objet JSON de cette forme :
{"changes": {
   "t": {seulement les clés de textes modifiées},
   "L": {seulement les listes modifiées, chacune donnée en entier},
   "hide": {seulement les sections dont l'état change : true pour masquer, false pour afficher},
   "order": [la liste complète des sections dans le nouvel ordre, seulement si l'ordre change],
   "links": {seulement les liens modifiés},
   "theme": {seulement les couleurs modifiées},
   "langs": {seulement les langues ajoutées, mises à jour ou supprimées}
 },
 "resume": "une ou deux phrases courtes, en tutoyant, qui disent ce que tu as fait",
 "type": "fait" | "question" | "conseil" | "hors_champ",
 "choix": ["jusqu'à 3 demandes ou réponses prêtes à toucher, facultatif"]}
Omets toute partie qui ne change pas. Si rien ne change, renvoie "changes": {}.`;

const LANGS = ["en", "nl", "de", "es", "it", "tr", "ar", "pt"];
const THEME = ["bg", "card", "ink", "mute", "accent", "soft"];
const HEX = /^#[0-9a-f]{6}$/i;
function lum(h: string) { const n = parseInt(h.slice(1), 16); const c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; }
const ratio = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
/* garantit un site lisible quelle que soit la couleur demandée */
function readable(th: any) {
  const bg = th.bg || "#06070b";
  const best = (min: number, key: string, dflt: string) => { const v = th[key] || dflt; if (ratio(v, bg) < min) th[key] = ratio("#ffffff", bg) >= ratio("#0b0d14", bg) ? "#ffffff" : "#0b0d14"; };
  best(4.5, "ink", "#f4f5f8");
  if (th.mute || th.bg) { const v = th.mute || "#9aa0b4"; if (ratio(v, bg) < 3.5) th.mute = lum(bg) < .4 ? "#c4c8d4" : "#4e5468"; }
  if (th.card && ratio(th.ink || "#f4f5f8", th.card) < 4.5) th.card = bg;
  if (th.accent && ratio("#ffffff", th.accent) < 3) { /* bouton blanc sur accent illisible : on assombrit */ const n = parseInt(th.accent.slice(1), 16); const d = (x: number) => Math.round(x * .62); th.accent = "#" + [d(n >> 16 & 255), d(n >> 8 & 255), d(n & 255)].map(x => x.toString(16).padStart(2, "0")).join(""); }
  return th;
}
function clean(ch: any, prev: any) {
  const out: any = { t: { ...(prev.t || {}) }, L: {}, hide: {}, order: [], links: { ...(prev.links || {}) }, theme: {} };
  const n = { t: 0, L: 0, hide: 0, order: 0, links: 0, theme: 0 };
  const pth = prev.theme && typeof prev.theme === "object" ? prev.theme : {};
  for (const k of THEME) if (typeof pth[k] === "string" && HEX.test(pth[k])) out.theme[k] = pth[k];
  const cth = ch?.theme && typeof ch.theme === "object" ? ch.theme : null;
  if (cth) {
    const before = JSON.stringify(out.theme);
    for (const k of THEME) if (k in cth) { const v = cth[k]; if (typeof v === "string" && HEX.test(v)) out.theme[k] = v.toLowerCase(); else if (v === "" || v === null) delete out.theme[k]; }
    if (Object.keys(out.theme).length) readable(out.theme);
    if (JSON.stringify(out.theme) !== before) n.theme++;
  }
  /* traductions : le français reste la base, chaque langue est stockée à côté */
  out.langs = {};
  const pl = prev.langs && typeof prev.langs === "object" ? prev.langs : {};
  for (const k of LANGS) if (pl[k] && typeof pl[k] === "object") out.langs[k] = pl[k];
  const cl = ch?.langs && typeof ch.langs === "object" ? ch.langs : {};
  let nl = 0;
  for (const k of Object.keys(cl)) {
    if (!LANGS.includes(k)) continue;
    const v = cl[k];
    if (v === null || v === false) { if (out.langs[k]) { delete out.langs[k]; nl++; } continue; }
    if (!v || typeof v !== "object") continue;
    const tr: any = { t: { ...(out.langs[k]?.t || {}) }, L: { ...(out.langs[k]?.L || {}) }, links: { ...(out.langs[k]?.links || {}) } };
    for (const key of Object.keys(v.t || {})) if (key in out.t && typeof v.t[key] === "string") tr.t[key] = v.t[key];
    for (const key of LISTS) if (Array.isArray(v.L?.[key]) && v.L[key].every((x: unknown) => x && typeof x === "object")) tr.L[key] = v.L[key];
    for (const key of ["seoTitle", "seoDesc"]) if (typeof v.links?.[key] === "string") tr.links[key] = v.links[key];
    if (JSON.stringify(tr) !== JSON.stringify(out.langs[k] || null)) { out.langs[k] = tr; nl++; }
  }
  const t = ch?.t && typeof ch.t === "object" ? ch.t : {};
  for (const k of Object.keys(t)) if (k in out.t && typeof t[k] === "string" && t[k] !== out.t[k]) { out.t[k] = t[k]; n.t++; }
  for (const k of LISTS) {
    const v = ch?.L?.[k];
    if (Array.isArray(v) && v.every((x: unknown) => x && typeof x === "object")) { out.L[k] = v; n.L++; } else out.L[k] = prev.L?.[k] || [];
  }
  for (const k of SECTIONS) {
    const v = ch?.hide?.[k], was = prev.hide?.[k] === true;
    const now = typeof v === "boolean" ? v : was;
    if (now) out.hide[k] = true;
    if (now !== was) n.hide++;
  }
  const before = Array.isArray(prev.order) && prev.order.length ? prev.order : SECTIONS;
  const order = Array.isArray(ch?.order) ? ch.order.filter((s: string) => SECTIONS.includes(s)) : [];
  out.order = [...new Set([...(order.length ? order : before), ...SECTIONS])];
  if (out.order.join() !== [...new Set([...before, ...SECTIONS])].join()) n.order++;
  const links = ch?.links && typeof ch.links === "object" ? ch.links : {};
  for (const k of ["email", "tiktok", "instagram", "seoTitle", "seoDesc"]) if (typeof links[k] === "string" && links[k] !== out.links[k]) { out.links[k] = links[k]; n.links++; }
  return { site: out, count: n.t + n.L + n.hide + n.order + n.links + n.theme + nl, langs: Object.keys(cl).filter(k => LANGS.includes(k)) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode non permise" }, 405);
  try {
    let anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!anon) { try { anon = Object.values(JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}"))[0] as string; } catch { /* rien */ } }
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, anon, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });
    const body = await req.json();
    const { instruction, site } = body;
    const demo = body.demo === true;
    if (!demo) {
      const { data: ok } = await sb.rpc("flova_is_editor");
      if (!ok) return json({ error: "Cette adresse n'a pas l'accès à la modification du site." }, 403);
    }
    if (typeof instruction !== "string" || !instruction.trim()) return json({ error: "Demande vide." }, 400);
    if (instruction.length > (demo ? 400 : 2000)) return json({ error: "Demande trop longue." }, 400);
    if (!site || typeof site !== "object") return json({ error: "Contenu manquant." }, 400);
    if (demo && JSON.stringify(site).length > 250000) return json({ error: "Contenu trop long." }, 400);

    const db = admin();
    const fx = await setting(db, "usd_eur", 0.92);
    const budget = demo ? await setting(db, "demo_budget_eur", 2) : await setting(db, "ai_budget_eur", 5);
    const m0 = new Date(); m0.setUTCDate(1); m0.setUTCHours(0, 0, 0, 0);
    let q = db.from("flova_ai_usage").select("cost_usd").gte("at", m0.toISOString());
    q = demo ? q.eq("author", "démo") : q.neq("author", "démo");
    const { data: used } = await q;
    const spent = (used || []).reduce((a: number, r: any) => a + Number(r.cost_usd || 0), 0) * fx;
    if (budget > 0 && spent >= budget) return json({ error: demo ? "La démo a atteint sa limite du mois." : `Le budget IA du mois (${budget} €) est atteint. Il se recharge le 1er du mois prochain, ou Uxlab peut le relever.` }, 402);
    if (demo) {
      const { count } = await db.from("flova_ai_usage").select("id", { count: "exact", head: true }).eq("author", "démo").gte("at", new Date(Date.now() - 6e5).toISOString());
      if ((count || 0) >= 120) return json({ error: "Beaucoup de demandes en ce moment sur la démo. Réessaie dans quelques minutes." }, 429);
    }
    const who = demo ? null : (await sb.auth.getUser()).data;

    const key = Deno.env.get("DEEPSEEK_API_KEY");
    if (!key) return json({ error: "L'assistant n'est pas encore activé (clé manquante)." }, 503);

    const payload = JSON.stringify({
        model: Deno.env.get("FLOVA_MODEL") || "deepseek-flash",
        temperature: 0.2,
        max_tokens: 16000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Contenu actuel (en français, langue principale) :\n${JSON.stringify({ ...site, langs: undefined })}\n\nLangues déjà traduites : ${Object.keys(site?.langs || {}).join(", ") || "aucune"}\n\nDemande : ${instruction.trim()}` + (demo ? "\n\n(Démo : il n'y a pas de bouton « Changer l'image » ; pour ajouter un logo ou une photo, le propriétaire l'envoie dans la conversation avec l'icône appareil photo. Dis-le ainsi si besoin.)" : "") },
        ],
      });
    const logUse = (out: any, changed: boolean) => {
      const u = out?.usage || {};
      const hit = Number(u.prompt_cache_hit_tokens || 0), pin = Number(u.prompt_tokens || 0), pout = Number(u.completion_tokens || 0);
      const cost = ((hit * PRICE.hit) + (Math.max(0, pin - hit) * PRICE.miss) + (pout * PRICE.out)) / 1e6;
      return db.from("flova_ai_usage").insert({ author: demo ? "démo" : (who?.user?.email || null), model: out?.model || null, prompt_tokens: pin, completion_tokens: pout, cache_hit_tokens: hit, cost_usd: cost, changed, instruction: instruction.trim().slice(0, 300) });
    };
    // Deux essais : une réponse coupée ou mal formée est redemandée une fois, sans jamais montrer d'erreur technique.
    let parsed: any = null, lastOut: any = null;
    for (let essai = 0; essai < 2 && !parsed; essai++) {
      const r = await fetch("https://api.deepseek.com/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: payload });
      if (!r.ok) { if (essai === 1) return json({ error: "L'assistant ne répond pas pour le moment. Réessaie dans un instant." }, 502); continue; }
      const out = await r.json().catch(() => null);
      lastOut = out;
      const text: string = out?.choices?.[0]?.message?.content || "";
      const m = text.match(/\{[\s\S]*\}/);
      try { if (m) parsed = JSON.parse(m[0]); } catch { parsed = null; }
      if (!parsed || typeof parsed !== "object") { parsed = null; await logUse(out, false); console.error("réponse IA illisible, essai", essai + 1); }
    }
    if (!parsed) return json({ error: "Je n'ai pas bien compris. Reformule ta demande en une phrase simple." }, 502);
    const { site: next, count, langs: touched } = clean(parsed.changes || {}, site);
    await logUse(lastOut, count > 0);
    const type = count ? "fait" : (["question", "hors_champ", "conseil"].includes(parsed.type) ? parsed.type : "question");
    const choix = (Array.isArray(parsed.choix) ? parsed.choix : []).filter((c: unknown) => typeof c === "string" && c.trim()).slice(0, 3).map((c: string) => c.trim().slice(0, 80));
    return json({ site: next, count, type, choix, langs: touched, resume: String(parsed.resume || (count ? "C'est fait." : "Rien n'a été changé.")).slice(0, 500) });
  } catch (e) {
    console.error(e); return json({ error: "Petit souci technique. Réessaie dans un instant." }, 500);
  }
});
