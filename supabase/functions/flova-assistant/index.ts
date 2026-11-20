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
- "blocks" : sections ajoutées (liste complète, dans l'ordre), chacune {id, type, eyebrow, title, text, button, url, address, phone, items}. Types : "faq" (items: q, a), "avis" (items: name, role, text, stars 1-5), "galerie" (items: img, t), "video" (url d'une vidéo TikTok, YouTube ou Instagram), "horaires" (items: d jour, h heures ; address ; phone ; affiche un plan), "texte" (title, text), "cta" (title, text, button : appel à l'action vers le contact), "equipe" (items: name, role, img), "bandeau" (text, button : annonce tout en haut du site). Une section ajoutée apparaît dans "order" et "hide" sous le nom "x_" + son id.
- "theme" : police des titres "font" parmi archivo (d'origine, large et moderne), serif (Playfair, chic), elegant (DM Serif, luxe), rond (Poppins, chaleureux), grotesk (Space Grotesk, tech), impact (Bebas, street) ; et couleurs du site en hexadécimal #rrggbb : bg (fond), card (fond des cartes), ink (texte), mute (texte secondaire), accent (couleur principale : mots en couleur, boutons bleus, chiffres), soft (texte d'accroche). Une clé absente garde la couleur d'origine (fond noir #06070b, accent bleu #2f5bff).

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
8. Langues : le site est multilingue. Le français ("t", "L") reste TOUJOURS la langue principale : ne le traduis jamais à sa place. « Traduis le site en anglais », « ajoute l'anglais », « mets le site en néerlandais » = tu ajoutes une version dans "langs" : "langs": {"en": "traduire"} (le site fait lui-même la traduction complète, naturelle et idiomatique ; tu n'écris aucune traduction). Codes : en, nl, de, es, it, tr, ar, pt. Les visiteurs choisissent ensuite leur langue avec le sélecteur en haut du site. « Supprime l'anglais » = "langs": {"en": null}. « Remets le site en français » : il l'est déjà, la base est en français ; dis-le simplement. « Mets à jour les traductions » = "langs": {chaque langue existante: "traduire"}. Après une modification du texte français, si des langues existent, propose dans "choix" « Mets à jour les traductions ». "type": "fait".
6. Couleurs et ambiance : c'est une demande normale, "type": "fait". Change "theme" avec des couleurs harmonieuses, élégantes et lisibles (jamais criardes) : « fond rouge » = bg rouge profond (ex. #5c0a12) avec card un ton proche (#3f070d) et accent assorti ; « site clair / fond blanc » = bg #f6f7fb, card #ffffff, ink #0b0d14, mute #4e5468, soft #2b3040 ; « couleur de ma marque » donnée en mots ou en code = accent. « Remets les couleurs d'origine » = toutes les clés de theme à "". Le site corrige seul la lisibilité si besoin.
   Ambiances (« fais plus luxe », « style street », « plus minimal », « plus chaleureux », « mode clair ») : change d'un coup la police ET les couleurs, de façon cohérente. Exemples : luxe = elegant, bg #0b0a08, card #15130f, accent #c9a45c ; street = impact, bg #0a0a0a, accent #ff3b30 ; minimal clair = archivo, bg #ffffff, card #f4f4f6, ink #0b0d14, mute #5b6070, accent #111111 ; chaleureux = rond, bg #1b120c, card #24180f, accent #ff8a3d ; tech = grotesk, bg #05070d, accent #4f7cff.
10. Nom de domaine (« je veux mon nom de domaine », « trouve-moi un nom de domaine », « est-ce que fukay.be est libre ? ») : ne change rien, "type": "domaine", et mets dans "domaine" le nom souhaité (tel quel s'il en donne un, sinon le nom de la marque du site). Dans "resume", une phrase courte : « Je regarde tout de suite quelles adresses sont libres. »
9. Nouvelles sections : « ajoute une FAQ », « mets nos horaires et le plan », « ajoute ma vidéo TikTok <lien> », « ajoute un bandeau promo », « présente l'équipe », « ajoute une galerie », « ajoute un appel à l'action » = tu ajoutes un bloc dans "blocks" (donne la liste complète, en gardant les blocs existants) et tu le places au bon endroit dans "order". Pour une FAQ, écris 4 à 6 questions-réponses utiles à partir des faits du site. N'invente jamais d'avis clients, d'adresse, d'horaires, de téléphone, de membres d'équipe ou de lien vidéo : s'il manque ces infos, pose UNE question ("type": "question") avec 2 ou 3 réponses possibles dans "choix". Galerie : uniquement des images déjà présentes ou envoyées. « Supprime la FAQ » = retire le bloc de la liste.
11. Après chaque modification faite ("type": "fait"), mets TOUJOURS dans "choix" 3 idées suivantes pour CE site, courtes (moins de 60 caractères), applicables tout de suite avec ce que tu sais déjà, dans l'esprit de ce qui vient d'être fait (mêmes interdits qu'au point 7). Si des langues existaient DÉJÀ avant cette demande et que le texte français a changé, la première idée est « Mets à jour les traductions » (jamais juste après avoir ajouté ou traduit une langue).
12. Analyse ou note du site (« analyse mon site », « note mon site », « audit », « qu'est-ce qui ne va pas sur mon site ») : ne change rien, "type": "audit". Mets "note" (entier de 0 à 100, honnête et exigeant : un bon site vitrine fait 70 à 85), et "criteres" : exactement 5 objets {"nom", "note" (0 à 100), "pourquoi" (une phrase précise sur CE site)} pour : « Message clair en 5 secondes », « Appel à l'action », « Confiance et preuves », « Référencement Google », « Confort sur téléphone ». Mets dans "choix" 3 à 5 corrections prêtes à appliquer tout de suite (mêmes interdits qu'au point 7), et dans "tout" une seule demande qui les applique toutes d'un coup. "resume" : une phrase qui donne la note et le point fort.
13. Plusieurs styles au choix (« propose-moi 3 styles », « montre-moi des ambiances », « je ne sais pas quel style choisir ») : ne change rien, "type": "styles", et mets dans "styles" exactement 3 propositions très différentes entre elles et adaptées à CE métier, chacune {"nom" (2 ou 3 mots), "desc" (une phrase courte qui dit l'effet produit sur le visiteur), "theme" {bg, card, ink, mute, accent, soft, font}}. Couleurs harmonieuses, élégantes, lisibles. "resume" : une phrase qui invite à toucher pour voir chaque style sur le site.
   Restent hors de ta portée : taille des éléments, mise en page fine, nouvelle page, paiement, réservation, nouvelle fonction, vidéo hébergée sur le site. Dans ce cas seulement, ne change rien et mets "type": "hors_champ" ; dans "resume", dis en une phrase ce que tu peux faire à la place (textes, sections, couleurs, polices, ambiances, nouvelles sections, langues) et que l'équipe Uxlab peut le fabriquer. N'invente aucun réglage ni menu.

Réponds uniquement avec un objet JSON de cette forme :
{"changes": {
   "t": {seulement les clés de textes modifiées},
   "L": {seulement les listes modifiées, chacune donnée en entier},
   "hide": {seulement les sections dont l'état change : true pour masquer, false pour afficher},
   "order": [la liste complète des sections dans le nouvel ordre, seulement si l'ordre change],
   "links": {seulement les liens modifiés},
   "theme": {seulement les couleurs ou la police modifiées},
   "blocks": [la liste complète des sections ajoutées, seulement si elle change],
   "langs": {seulement les langues ajoutées, mises à jour ou supprimées}
 },
 "resume": "une ou deux phrases courtes, en tutoyant, qui disent ce que tu as fait",
 "type": "fait" | "question" | "conseil" | "hors_champ" | "domaine" | "audit",
 "note": "entier 0-100, seulement si type audit",
 "criteres": "seulement si type audit",
 "tout": "seulement si type audit",
 "styles": "seulement si type styles",
 "domaine": "nom souhaité, seulement si type domaine",
 "choix": ["jusqu'à 3 demandes ou réponses prêtes à toucher, facultatif"]}
Omets toute partie qui ne change pas. Si rien ne change, renvoie "changes": {}.`;

const LANGS = ["en", "nl", "de", "es", "it", "tr", "ar", "pt"];
const THEME = ["bg", "card", "ink", "mute", "accent", "soft"];
const FONTS = ["archivo", "serif", "rond", "grotesk", "impact", "elegant"];
const BTYPES = ["faq", "avis", "galerie", "video", "horaires", "texte", "cta", "equipe", "bandeau"];
const S = (v: unknown, n = 600) => typeof v === "string" ? v.slice(0, n) : "";
function blocksOk(list: unknown) {
  if (!Array.isArray(list)) return null;
  return list.filter((b: any) => b && BTYPES.includes(b.type)).slice(0, 12).map((b: any, i: number) => ({
    id: /^[a-z0-9]{1,12}$/.test(b.id || "") ? b.id : "b" + Date.now().toString(36).slice(-4) + i,
    type: b.type, eyebrow: S(b.eyebrow, 60), title: S(b.title, 140), text: S(b.text, 1200), button: S(b.button, 40), url: S(b.url, 400), address: S(b.address, 200), phone: S(b.phone, 40),
    items: (Array.isArray(b.items) ? b.items : []).slice(0, 12).filter((x: any) => x && typeof x === "object").map((x: any) => ({ q: S(x.q, 200), a: S(x.a, 900), name: S(x.name, 80), role: S(x.role, 80), text: S(x.text, 500), stars: Math.max(0, Math.min(5, Number(x.stars) || 0)), img: S(x.img, 400), t: S(x.t, 120), d: S(x.d, 60), h: S(x.h, 80) })),
  }));
}
/* ce que chaque offre permet (décision du conseil du 19/11, détaillée le 20/11) */
const PLANS: Record<string, { label: string; quota: number; theme: boolean; blocks: boolean; langs: number }> = {
  gratuit: { label: "Gratuit", quota: 30, theme: false, blocks: false, langs: 1 },
  pro: { label: "Pro", quota: 300, theme: true, blocks: true, langs: 3 },
  commerce: { label: "Commerce", quota: 1000, theme: true, blocks: true, langs: 8 },
};
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
  /* accent clair : le site met un texte foncé sur les boutons, on garde la couleur choisie */
  return th;
}
function clean(ch: any, prev: any) {
  const out: any = { t: { ...(prev.t || {}) }, L: {}, hide: {}, order: [], links: { ...(prev.links || {}) }, theme: {} };
  const n = { t: 0, L: 0, hide: 0, order: 0, links: 0, theme: 0 };
  const pth = prev.theme && typeof prev.theme === "object" ? prev.theme : {};
  for (const k of THEME) if (typeof pth[k] === "string" && HEX.test(pth[k])) out.theme[k] = pth[k];
  if (FONTS.includes(pth.font)) out.theme.font = pth.font;
  out.blocks = blocksOk(prev.blocks) || [];
  let nb = 0;
  const cb = blocksOk(ch?.blocks);
  if (cb && JSON.stringify(cb) !== JSON.stringify(out.blocks)) { out.blocks = cb; nb++; }
  const SECS = [...SECTIONS, ...out.blocks.filter((b: any) => b.type !== "bandeau").map((b: any) => "x_" + b.id)];
  const cth = ch?.theme && typeof ch.theme === "object" ? ch.theme : null;
  if (cth) {
    const before = JSON.stringify(out.theme);
    for (const k of THEME) if (k in cth) { const v = cth[k]; if (typeof v === "string" && HEX.test(v)) out.theme[k] = v.toLowerCase(); else if (v === "" || v === null) delete out.theme[k]; }
    if ("font" in cth) { if (FONTS.includes(cth.font) && cth.font !== "archivo") out.theme.font = cth.font; else delete out.theme.font; }
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
    if (typeof v === "string") { out.pending = [...(out.pending || []), k]; continue; }
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
  for (const k of SECS) {
    const v = ch?.hide?.[k], was = prev.hide?.[k] === true;
    const now = typeof v === "boolean" ? v : was;
    if (now) out.hide[k] = true;
    if (now !== was) n.hide++;
  }
  const before = (Array.isArray(prev.order) && prev.order.length ? prev.order : SECTIONS).filter((x: string) => SECS.includes(x));
  const order = Array.isArray(ch?.order) ? ch.order.filter((x: string) => SECS.includes(x)) : [];
  out.order = [...new Set([...(order.length ? order : before), ...SECS])];
  if (out.order.join() !== [...new Set([...before, ...SECS])].join()) n.order++;
  const links = ch?.links && typeof ch.links === "object" ? ch.links : {};
  for (const k of ["email", "tiktok", "instagram", "seoTitle", "seoDesc"]) if (typeof links[k] === "string" && links[k] !== out.links[k]) { out.links[k] = links[k]; n.links++; }
  return { site: out, count: n.t + n.L + n.hide + n.order + n.links + n.theme + nl + nb, used: { theme: n.theme > 0, blocks: nb > 0, langs: Object.keys(out.langs).length }, langs: Object.keys(cl).filter(k => LANGS.includes(k)) };
}

const LANG_FULL: Record<string, string> = { en: "anglais", nl: "néerlandais", de: "allemand", es: "espagnol", it: "italien", tr: "turc", ar: "arabe", pt: "portugais" };
const TR_SYSTEM = (lang: string) => `Tu es un traducteur professionnel, rédacteur natif en ${lang}. Tu reçois un objet JSON de textes d'un site vitrine d'agence de vidéos courtes.
Traduis chaque valeur texte en ${lang}, de façon naturelle et idiomatique (jamais mot à mot : « Nous créons l'attention » devient par exemple en anglais « We make people stop scrolling »), même ton, phrases courtes.
Garde à l'identique : toutes les clés, les noms propres, les marques, les chiffres et leur format, les adresses (img, logo, photo, liens), les champs vides et la structure (mêmes listes, même nombre d'éléments, même ordre).
Une clé dont le nom est "img", "logo", "photo" ou "i" ne se traduit jamais.
Réponds uniquement avec l'objet JSON traduit, de même forme.`;
async function callJson(key: string, system: string, user: string, max = 8000) {
  for (let essai = 0; essai < 2; essai++) {
    const r = await fetch("https://api.deepseek.com/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: Deno.env.get("FLOVA_MODEL") || "deepseek-flash", temperature: 0.2, max_tokens: max, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }) });
    if (!r.ok) continue;
    const out = await r.json().catch(() => null);
    const m = (out?.choices?.[0]?.message?.content || "").match(/\{[\s\S]*\}/);
    try { if (m) return { data: JSON.parse(m[0]), out }; } catch { /* nouvel essai */ }
  }
  return { data: null, out: null };
}
/* traduit tout le site en deux appels parallèles (textes fixes, listes) : rapide et fiable */
async function translateSite(key: string, code: string, base: any, log: (o: any) => unknown) {
  const lang = LANG_FULL[code] || code;
  const textL: any = {};
  for (const k of LISTS) if (Array.isArray(base.L?.[k])) textL[k] = base.L[k];
  const blk = Array.isArray(base.blocks) && base.blocks.length ? base.blocks.map((x: any) => ({ eyebrow: x.eyebrow, title: x.title, text: x.text, button: x.button, items: (x.items || []).map((i: any) => ({ q: i.q, a: i.a, name: i.name, role: i.role, text: i.text, t: i.t, d: i.d, h: i.h })) })) : null;
  /* découpage fin : chaque liste et chaque moitié des textes partent en parallèle */
  const tk = Object.keys(base.t || {}), CH = 14;
  const tParts: any[] = []; for (let i = 0; i < tk.length; i += CH) tParts.push(Object.fromEntries(tk.slice(i, i + CH).map((k) => [k, base.t[k]])));
  const lkeys = Object.keys(textL).filter((k) => textL[k].length);
  const lParts: [string, number, any[]][] = []; for (const k of lkeys) for (let i = 0; i < textL[k].length; i += 6) lParts.push([k, i, textL[k].slice(i, i + 6)]);
  const pc = callJson(key, TR_SYSTEM(lang), JSON.stringify({ seoTitle: base.links?.seoTitle || "", seoDesc: base.links?.seoDesc || "" }), 600);
  const pd = blk ? callJson(key, TR_SYSTEM(lang), JSON.stringify({ blocks: blk }), 6000) : Promise.resolve({ data: null, out: null });
  const all = await Promise.all([
    ...tParts.map((part) => callJson(key, TR_SYSTEM(lang), JSON.stringify({ t: part }), 4000)),
    ...lParts.map(([k, , items]) => callJson(key, TR_SYSTEM(lang), JSON.stringify({ L: { [k]: items } }), 4000)),
  ]);
  await Promise.all(all.filter((x) => x.out).map((x) => log(x.out)));
  const ts = all.slice(0, tParts.length), ls = all.slice(tParts.length);
  const tOf = (d: any) => (d && typeof d.t === "object" ? d.t : d && typeof d === "object" && !d.L ? d : null);
  /* un morceau raté est redemandé une fois de plus, seul */
  for (let i = 0; i < tParts.length; i++) if (!tOf(ts[i].data)) ts[i] = await callJson(key, TR_SYSTEM(lang), JSON.stringify({ t: tParts[i] }), 4000);
  const a = { data: { t: Object.assign({}, ...ts.map((x) => tOf(x.data) || {})) } };
  const bL: any = {};
  for (const k of lkeys) { const arr: any[] = []; let ok = true; lParts.forEach(([kk, i, items], j) => { if (kk !== k) return; const dd = ls[j].data, v = Array.isArray(dd?.L?.[k]) ? dd.L[k] : Array.isArray(dd?.[k]) ? dd[k] : Array.isArray(dd) ? dd : null; if (Array.isArray(v) && v.length === items.length) arr.splice(i, items.length, ...v); else ok = false; }); if (ok && arr.length === textL[k].length) bL[k] = arr; }
  const b = { data: { L: bL } };
  const [c, d] = await Promise.all([pc, pd]);
  for (const x of [c, d]) if (x.out) await log(x.out);
  if (!a.data?.t || !b.data?.L) return null;
  const tr: any = { t: {}, L: {}, links: {} };
  for (const k of Object.keys(base.t || {})) if (typeof a.data.t[k] === "string") tr.t[k] = a.data.t[k];
  for (const k of LISTS) {
    const src = base.L?.[k], dst = b.data.L[k];
    if (!Array.isArray(src) || !Array.isArray(dst) || dst.length !== src.length) continue;
    /* on garde les images et champs techniques de la version française */
    tr.L[k] = dst.map((x: any, i: number) => { const o = { ...src[i], ...(x && typeof x === "object" ? x : {}) }; for (const f of ["img", "logo", "photo", "i"]) if (f in src[i]) o[f] = src[i][f]; return o; });
  }
  if (blk && Array.isArray(d.data?.blocks) && d.data.blocks.length === base.blocks.length) tr.blocks = base.blocks.map((o: any, i: number) => { const x = d.data.blocks[i] || {}; return { ...o, eyebrow: S(x.eyebrow) || o.eyebrow, title: S(x.title) || o.title, text: S(x.text, 1200) || o.text, button: S(x.button) || o.button, items: (o.items || []).map((it: any, j: number) => { const y = x.items?.[j] || {}; const r: any = { ...it }; for (const f of ["q", "a", "name", "role", "text", "t", "d", "h"]) if (typeof y[f] === "string" && y[f]) r[f] = y[f]; return r; }) }; });
  if (typeof c.data?.seoTitle === "string") tr.links.seoTitle = c.data.seoTitle;
  if (typeof c.data?.seoDesc === "string") tr.links.seoDesc = c.data.seoDesc;
  return Object.keys(tr.t).length > Object.keys(base.t || {}).length * 0.8 ? tr : null;
}

/* ---------- noms de domaine : disponibilité en direct ---------- */
const TLDS = ["com", "be", "fr", "eu", "shop", "store", "net", "co"];
const RDAP_OK = ["com", "net", "fr", "shop", "store", "co"];
function slugs(raw: string) {
  const base = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^(https?:\/\/)?(www\.)?/, "");
  const m = base.match(/^([a-z0-9-]+)\.([a-z]{2,6})$/);
  const words = (m ? m[1] : base).replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, 5);
  if (!words.length) return { names: [], tld: null as string | null };
  const out = new Set<string>([words.join(""), words.join("-")]);
  return { names: [...out].filter(x => x.length >= 3 && x.length <= 40), tld: m ? m[2] : null };
}
async function isFree(d: string): Promise<boolean | null> {
  try {
    const r = await fetch(`https://dns.google/resolve?name=${d}&type=NS`, { signal: AbortSignal.timeout(4000) });
    const j = await r.json();
    if (j.Status === 0) return false;
    if (j.Status !== 3) return null;
    const tld = d.split(".").pop()!;
    if (!RDAP_OK.includes(tld)) return true;
    const q = await fetch(`https://rdap.org/domain/${d}`, { signal: AbortSignal.timeout(5000) });
    return q.status === 404 ? true : q.status === 200 ? false : null;
  } catch { return null; }
}
async function checkDomains(raw: string) {
  const { names, tld } = slugs(raw);
  const list: string[] = [];
  for (const n of names) for (const t of (tld ? [tld, ...TLDS.filter(x => x !== tld)] : TLDS)) list.push(`${n}.${t}`);
  const uniq = [...new Set(list)].slice(0, 14);
  const res = await Promise.all(uniq.map(async d => ({ d, libre: await isFree(d) })));
  return res.sort((a, b) => Number(b.libre === true) - Number(a.libre === true)).slice(0, 8);
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
      const { count } = await db.from("flova_ai_usage").select("id", { count: "exact", head: true }).eq("author", "démo").gte("at", new Date(Date.now() - 6e5).toISOString()).not("instruction", "like", "[traduction]%");
      if ((count || 0) >= 120) return json({ error: "Beaucoup de demandes en ce moment sur la démo. Réessaie dans quelques minutes." }, 429);
    }
    const who = demo ? null : (await sb.auth.getUser()).data;

    if (!demo) {
      const pk = String((await db.from("flova_settings").select("value").eq("key", "plan").maybeSingle()).data?.value || "commerce").replace(/"/g, "");
      const pl = PLANS[pk] || PLANS.commerce;
      const debut = new Date(); debut.setUTCDate(1); debut.setUTCHours(0, 0, 0, 0);
      const { count: faites } = await db.from("flova_ai_usage").select("id", { count: "exact", head: true }).gte("at", debut.toISOString()).neq("author", "démo").not("instruction", "like", "[traduction]%");
      if ((faites || 0) >= pl.quota) return json({ count: 0, type: "offre", choix: [], resume: `Tu as utilisé tes ${pl.quota} demandes du mois avec l'offre ${pl.label}. Elles se rechargent le 1er du mois, ou passe à l'offre supérieure pour continuer tout de suite.` });
    }
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
    const logUse = (out: any, changed: boolean, tag = "") => {
      const u = out?.usage || {};
      const hit = Number(u.prompt_cache_hit_tokens || 0), pin = Number(u.prompt_tokens || 0), pout = Number(u.completion_tokens || 0);
      const cost = ((hit * PRICE.hit) + (Math.max(0, pin - hit) * PRICE.miss) + (pout * PRICE.out)) / 1e6;
      return db.from("flova_ai_usage").insert({ author: demo ? "démo" : (who?.user?.email || null), model: out?.model || null, prompt_tokens: pin, completion_tokens: pout, cache_hit_tokens: hit, cost_usd: cost, changed, instruction: (tag + instruction.trim()).slice(0, 300) });
    };
    // Deux essais : une réponse coupée ou mal formée est redemandée une fois, sans jamais montrer d'erreur technique.
    let parsed: any = null, lastOut: any = null;
    {
      const q = instruction.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const STEM: [RegExp, string, string][] = [[/\bangl/, "en", "l'anglais"], [/\b(neerland|flamand)/, "nl", "le néerlandais"], [/\ballemand/, "de", "l'allemand"], [/\bespagnol/, "es", "l'espagnol"], [/\bitalien/, "it", "l'italien"], [/\bturc/, "tr", "le turc"], [/\barabe/, "ar", "l'arabe"], [/\bportugais/, "pt", "le portugais"]];
      const hits = STEM.filter(([re]) => re.test(q));
      if (hits.length === 1 && q.length <= 70 && /^(ajoute|traduis|mets|fais|passe|je veux|cree)\b/.test(q) && !/( et |,|;|puis|aussi | sauf|seulement|uniquement|titre|bouton|section)/.test(q) && !(site?.langs || {})[hits[0][1]]) {
        const [, code, nom] = hits[0];
        parsed = { changes: { langs: { [code]: "traduire" } }, type: "fait", resume: `J'ai ajouté ${nom} : le site est traduit en entier et tes visiteurs choisissent leur langue en haut de page. Le français reste la version principale.`, choix: [code === "nl" ? "Ajoute aussi l'anglais" : "Ajoute aussi le néerlandais", "Donne-moi 3 idées pour mon site", "Analyse mon site et note-le sur 100"] };
      }
    }
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
    if (parsed.type === "domaine") {
      await logUse(lastOut, false);
      const voulu = String(parsed.domaine || instruction).slice(0, 80);
      const domaines = await checkDomains(voulu);
      const libres = domaines.filter(x => x.libre === true).length;
      const exact = (voulu.toLowerCase().match(/[a-z0-9-]+\.[a-z]{2,6}/) || [])[0];
      const ex = exact ? domaines.find(x => x.d === exact) : null;
      if (ex && ex.libre === false) return json({ count: 0, type: "domaine", choix: [], domaines, resume: libres ? `${exact} est déjà prise, mais ${libres} variante${libres > 1 ? "s sont libres" : " est libre"}. Touche celle que tu veux, je la réserve et la branche sur ton site.` : `${exact} est déjà prise. Donne-moi une variante et je cherche à nouveau.` });
      if (ex && ex.libre === true) return json({ count: 0, type: "domaine", choix: [], domaines, resume: `${exact} est libre ! Touche « Je la prends » et je la réserve et la branche sur ton site.` });
      return json({ count: 0, type: "domaine", choix: [], domaines, resume: libres ? `Bonne nouvelle : ${libres} adresse${libres > 1 ? "s" : ""} libre${libres > 1 ? "s" : ""} pour « ${voulu} ». Touche celle que tu veux, je la réserve et la branche sur ton site.` : `Les adresses pour « ${voulu} » sont déjà prises. Donne-moi une variante (ville, métier, autre mot) et je cherche à nouveau.` });
    }
    const planKey = demo ? "commerce" : String((await db.from("flova_settings").select("value").eq("key", "plan").maybeSingle()).data?.value || "commerce").replace(/"/g, "");
    const plan = PLANS[planKey] || PLANS.commerce;
    const cleaned = clean(parsed.changes || {}, site);
    const usage: any = (cleaned as any).used || {};
    const locked = (usage.theme && !plan.theme) ? "les couleurs, les polices et les ambiances" : (usage.blocks && !plan.blocks) ? "les nouvelles sections" : (usage.langs > plan.langs) ? `plus de ${plan.langs} langue${plan.langs > 1 ? "s" : ""} en plus du français` : "";
    if (parsed.type === "styles" && Array.isArray(parsed.styles)) {
      if (!plan.theme) { await logUse(lastOut, false); return json({ count: 0, type: "offre", choix: [], resume: `Avec l'offre ${plan.label}, les couleurs, les polices et les ambiances ne sont pas incluses. Passe à l'offre Pro (9 € par mois) pour les essayer en un message.` }); }
      const styles = parsed.styles.slice(0, 3).map((st: any) => { const c = clean({ theme: st?.theme || {} }, site); return { nom: String(st?.nom || "Style").slice(0, 30), desc: String(st?.desc || "").slice(0, 140), site: c.site }; }).filter((x: any) => x.site?.theme && Object.keys(x.site.theme).length);
      await logUse(lastOut, false);
      if (styles.length) return json({ count: 0, type: "styles", styles, choix: [], resume: String(parsed.resume || "Touche un style pour le voir sur ton site.").slice(0, 300) });
    }
    if (locked) { await logUse(lastOut, false); return json({ count: 0, type: "offre", choix: [], resume: `Avec l'offre ${plan.label}, ${locked} ne sont pas inclus. Passe à l'offre ${planKey === "gratuit" ? "Pro (9 € par mois)" : "Commerce (19 € par mois)"} pour le faire en un message.` }); }
    const next = cleaned.site, touched = cleaned.langs;
    let count = cleaned.count;
    const pending: string[] = next.pending || []; delete next.pending;
    let failed: string[] = [];
    if (pending.length) {
      const res = await Promise.all(pending.map(code => translateSite(key, code, next, (o: any) => logUse(o, true, "[traduction] "))));
      res.forEach((tr, i) => { if (tr) { next.langs[pending[i]] = tr; count++; } else failed.push(pending[i]); });
    }
    await logUse(lastOut, count > 0);
    if (failed.length && !count) return json({ error: "La traduction n'a pas abouti. Réessaie dans un instant." }, 502);
    const type = count ? "fait" : (["question", "hors_champ", "conseil", "audit"].includes(parsed.type) ? parsed.type : "question");
    if (!count && parsed.type === "fait") parsed.resume = "Je n'ai rien trouvé à changer avec cette demande. Dis-moi plus précisément quoi modifier, ou touche une idée.";
    const choix = (Array.isArray(parsed.choix) ? parsed.choix : []).filter((c: unknown) => typeof c === "string" && c.trim()).slice(0, type === "audit" ? 5 : 3).map((c: string) => c.trim().slice(0, 90));
    if (type === "audit") {
      const n = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
      const criteres = (Array.isArray(parsed.criteres) ? parsed.criteres : []).slice(0, 5).map((c: any) => ({ nom: String(c?.nom || "").slice(0, 40), note: n(c?.note), pourquoi: String(c?.pourquoi || "").slice(0, 200) })).filter((c: any) => c.nom);
      const note = parsed.note != null ? n(parsed.note) : (criteres.length ? Math.round(criteres.reduce((a: number, c: any) => a + c.note, 0) / criteres.length) : 0);
      return json({ count: 0, type, note, criteres, tout: String(parsed.tout || "").slice(0, 400), choix, resume: String(parsed.resume || "").slice(0, 300) });
    }
    return json({ site: next, count, type, choix, langs: touched, resume: String(parsed.resume || (count ? "C'est fait." : "Rien n'a été changé.")).slice(0, 500) });
  } catch (e) {
    console.error(e); return json({ error: "Petit souci technique. Réessaie dans un instant." }, 500);
  }
});
