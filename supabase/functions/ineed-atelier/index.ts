// Atelier ineed.shopping : l'utilisateur donne un ordre, l'atelier pose 2 à 4 questions à choix,
// puis fabrique seul un produit fini (appli web, site, outil, jeu…) et le livre avec un lien.
// Chaîne : cadrage → plan → construction → contrôle automatique (syntaxe + relecture par un 2e passage) → livraison.
// Secrets lus dans Supabase (aucun ici) : DEEPSEEK_API_KEY ; facultatifs : INEED_MODEL_FORT, NVIDIA_API_KEY + NVIDIA_MODEL.
// Base : SUPABASE_DB_URL (fourni par Supabase). Les tables sont créées au premier appel, sans accès public (RLS sans règle).
import postgres from "npm:postgres@3.4.5";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 3, idle_timeout: 20 });
let pret: Promise<unknown> | null = null;
function schema() {
  pret ??= sql.unsafe(`
    create table if not exists public.ineed_chantiers(
      id uuid primary key default gen_random_uuid(), cree_le timestamptz not null default now(), maj_le timestamptz not null default now(),
      ip_h text, ordre text not null, cadrage jsonb, reponses jsonb, plan jsonb, html text, etape text not null default 'plan',
      journal jsonb not null default '[]'::jsonb, versions jsonb not null default '[]'::jsonb, erreur text, cout_usd numeric not null default 0, tours int not null default 0, note int);
    alter table public.ineed_chantiers add column if not exists tours int not null default 0;
    alter table public.ineed_chantiers add column if not exists note int;
    alter table public.ineed_chantiers add column if not exists brouillon text;
    alter table public.ineed_chantiers add column if not exists tranches int not null default 0;
    alter table public.ineed_chantiers add column if not exists relances int not null default 0;
    create table if not exists public.ineed_appels(id bigserial primary key, le timestamptz not null default now(), ip_h text, action text);
    create index if not exists ineed_appels_ip on public.ineed_appels(ip_h, le desc);
    alter table public.ineed_chantiers enable row level security;
    alter table public.ineed_appels enable row level security;
    revoke all on public.ineed_chantiers, public.ineed_appels from anon, authenticated;`).catch((e) => { pret = null; throw e; });
  return pret;
}

// Limites (protègent la dépense) : par visiteur et par jour, et un plafond global par jour.
const LIM = { cadrer: 60, construire: 12, retoucher: 40, global_construire: 300 };
async function ipHash(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "inconnu";
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("ineed:" + ip));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 24);
}
async function limite(ip: string, action: keyof typeof LIM) {
  const [{ n }] = await sql`select count(*)::int n from ineed_appels where ip_h=${ip} and action=${action} and le > now() - interval '1 day'`;
  if (n >= LIM[action]) return true;
  if (action === "construire") {
    const [{ g }] = await sql`select count(*)::int g from ineed_appels where action='construire' and le > now() - interval '1 day'`;
    if (g >= LIM.global_construire) return true;
  }
  await sql`insert into ineed_appels(ip_h, action) values (${ip}, ${action})`;
  return false;
}

/* ---------- moteurs ---------- */
// $ par million de jetons, tarif plein (heures de pointe) relevé sur api-docs.deepseek.com le 24/11/2026 : estimation prudente.
const PRIX: Record<string, { hit: number; miss: number; out: number }> = {
  "deepseek-flash": { hit: 0.006, miss: 0.3, out: 1.2 },
  "deepseek-v4-pro": { hit: 0.044, miss: 1.32, out: 3.96 },
};
const ROUTEUR = "https://blaehmatdmobhwlhqfjo.supabase.co/rest/v1/rpc/";
const ROUTEUR_CLE = "sb_publishable_c1ovcVD1pbOGPedrJfDU3g_jtS1bY73";
function noter(cout: number, erreur = false, moteur = "deepseek-flash") {
  fetch(ROUTEUR + "usine_noter", { method: "POST", headers: { apikey: ROUTEUR_CLE, "Content-Type": "application/json" }, body: JSON.stringify({ p_moteur: moteur, p_ajout: cout, p_erreur: erreur }), signal: AbortSignal.timeout(1500) }).catch(() => {});
}
type Rep = { texte: string; cout: number; modele: string; fini: boolean };
async function ia(system: string, user: string, o: { max?: number; jsonMode?: boolean; fort?: boolean; temp?: number; delaiMs?: number; debut?: string; progres?: (t: string) => Promise<unknown> } = {}): Promise<Rep> {
  const key = Deno.env.get("DEEPSEEK_API_KEY");
  if (!key) throw new Error("cle");
  // Moteur rapide pour comprendre et planifier, moteur fort pour construire, contrôler et retoucher ; mode réflexion coupé (10 fois plus rapide, mesuré).
  const modele = o.fort ? (Deno.env.get("INEED_MODEL_FORT") || "deepseek-v4-pro") : (Deno.env.get("FLOVA_MODEL") || "deepseek-flash");
  const PRICE = PRIX[modele] || PRIX["deepseek-v4-pro"];
  // Réponse en flux continu : la connexion ne reste jamais muette pendant une longue fabrication.
  for (let essai = 0; essai < 2; essai++) {
    try {
      // Suite d'un texte déjà commencé : complétion par préfixe (point d'accès bêta de DeepSeek).
      const msgs: any[] = [{ role: "system", content: system }, { role: "user", content: user }];
      if (o.debut) msgs.push({ role: "assistant", content: o.debut, prefix: true });
      const ctl = new AbortController();
      const r = await fetch(o.debut ? "https://api.deepseek.com/beta/chat/completions" : "https://api.deepseek.com/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, signal: ctl.signal,
        body: JSON.stringify({ model: modele, temperature: o.temp ?? 0.3, max_tokens: o.max ?? 4000, stream: true, stream_options: { include_usage: true }, thinking: { type: "disabled" },
          ...(o.jsonMode ? { response_format: { type: "json_object" } } : {}), messages: msgs }),
      });
      const limiteT = o.delaiMs ? Date.now() + o.delaiMs : 0;
      if (!r.ok || !r.body) { console.error("deepseek", r.status, (await r.text().catch(() => "")).slice(0, 300)); noter(0, true, modele); continue; }
      const rd = r.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "", texte = "", u: any = {}, nom = modele, fini = false, coupe = false, vu = Date.now();
      for (;;) {
        if (limiteT && Date.now() > limiteT) { coupe = true; try { ctl.abort(); } catch { /* rien */ } break; }
        let lu;
        try { lu = await rd.read(); } catch { coupe = !!limiteT; break; }
        const { value, done } = lu;
        if (done) break;
        if (o.progres && Date.now() - vu > 12000) { vu = Date.now(); o.progres(texte).catch(() => {}); }
        buf += value;
        let i: number;
        while ((i = buf.indexOf("\n")) >= 0) {
          const ligne = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!ligne.startsWith("data:")) continue;
          const d = ligne.slice(5).trim();
          if (d === "[DONE]") continue;
          try { const o2 = JSON.parse(d); texte += o2?.choices?.[0]?.delta?.content || ""; if (o2?.choices?.[0]?.finish_reason) fini = true; if (o2.usage) u = o2.usage; if (o2.model) nom = o2.model; } catch { /* morceau incomplet */ }
        }
      }
      // Sans compte rendu (flux coupé), coût estimé à partir de la longueur : environ 3,5 caractères par jeton.
      const pin = Number(u.prompt_tokens || Math.round((system.length + user.length + (o.debut || "").length) / 3.5));
      const hit = Number(u.prompt_cache_hit_tokens || 0), pout = Number(u.completion_tokens || Math.round(texte.length / 3.5));
      const cout = (hit * PRICE.hit + Math.max(0, pin - hit) * PRICE.miss + pout * PRICE.out) / 1e6;
      noter(cout, false, modele);
      if (texte || coupe) return { texte, cout, modele: nom, fini: fini && !coupe };
    } catch (e) { console.error("deepseek coupé :", (e as Error).message); noter(0, true); }
  }
  throw new Error("moteur");
}
// Relecteur indépendant : un autre moteur si une clé NVIDIA est branchée, sinon DeepSeek avec un autre rôle.
async function relecteur(system: string, user: string): Promise<Rep> {
  const k = Deno.env.get("NVIDIA_API_KEY"), m = Deno.env.get("NVIDIA_MODEL");
  if (k && m) {
    try {
      const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${k}` },
        body: JSON.stringify({ model: m, temperature: 0.1, max_tokens: 4000, messages: [{ role: "system", content: system }, { role: "user", content: user }] }), signal: AbortSignal.timeout(90000) });
      if (r.ok) { const o = await r.json(); const t = o?.choices?.[0]?.message?.content || ""; if (t) return { texte: t, cout: 0, modele: m, fini: true }; }
    } catch { /* repli sur DeepSeek */ }
  }
  return ia(system, user, { max: 6000, jsonMode: true, temp: 0.1, delaiMs: 130000, fort: true });
}
const objet = (t: string) => { const m = t.match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } };
function extraireHtml(t: string) {
  const f = t.match(/```(?:html)?\s*([\s\S]*?)```/i);
  let h = (f ? f[1] : t).trim();
  const i = h.search(/<!doctype html|<html/i);
  if (i > 0) h = h.slice(i);
  return h;
}
// Contrôle automatique : chaque script classique doit se compiler (on ne l'exécute pas).
function controle(html: string): string[] {
  const d: string[] = [];
  if (!/<html[\s>]/i.test(html) || !/<\/html>/i.test(html)) d.push("La page n'est pas complète (balise html manquante ou coupée).");
  if (!/<meta[^>]+viewport/i.test(html)) d.push("Il manque la balise meta viewport (affichage téléphone).");
  if (/lorem ipsum/i.test(html)) d.push("Il reste du faux texte « lorem ipsum ».");
  const re = /<script(?![^>]*\bsrc=)(?![^>]*type=["'](?:module|application\/ld\+json|text\/template)["'])[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null, n = 0;
  while ((m = re.exec(html))) {
    n++;
    try { new Function(m[1]); } catch (e) { d.push(`Erreur de syntaxe JavaScript dans le script n° ${n} : ${(e as Error).message}`); }
  }
  return d;
}
function appliquer(html: string, corr: any[]): { html: string; n: number } {
  let n = 0;
  for (const c of Array.isArray(corr) ? corr.slice(0, 40) : []) {
    if (typeof c?.chercher === "string" && typeof c?.remplacer === "string" && c.chercher && html.includes(c.chercher)) { html = html.replace(c.chercher, c.remplacer); n++; }
  }
  return { html, n };
}

/* ---------- consignes ---------- */
const SYS_CADRER = `Tu es le chef de projet de l'atelier ineed.shopping. Un client grand public (aucune connaissance technique) te donne un ordre de travail.
Ton rôle : comprendre ce qu'il veut et poser les 2 à 4 questions à choix qui changent vraiment le résultat (public, contenu, style, fonctions clés…). Jamais de question technique (langage, hébergement, base de données).
Chaque question a 3 à 5 choix courts, concrets, en français simple ; "multi" vaut true si plusieurs choix peuvent se cumuler.
Si l'ordre est déjà complet, pose au moins 2 questions de finition (style, ton).
Ce que l'atelier sait livrer aujourd'hui : une application ou un site web complet en une page, qui marche tout de suite sur téléphone et ordinateur, données gardées sur l'appareil (pas de comptes ni de paiements réels pour l'instant). Si l'ordre demande autre chose (appli native, paiement réel, envoi de SMS), propose la version web la plus proche et dis-le dans "limite".
Réponds en JSON : {"titre": "nom court du projet", "resume": "ce que tu as compris, en une phrase", "genre": "appli|site|outil|jeu|document|autre", "limite": "" ou une phrase, "questions": [{"id":"q1","q":"…","choix":["…","…","…"],"multi":false}]}`;

const SYS_PLAN = `Tu es l'architecte de l'atelier ineed.shopping. À partir de l'ordre du client et de ses réponses, écris le plan précis d'un produit web fini, livrable en un seul fichier HTML (HTML + CSS + JavaScript sans framework, données gardées dans localStorage).
Le produit doit être réellement utilisable, pas une maquette : chaque bouton fait quelque chose, les données saisies restent après rechargement, il y a des données d'exemple réalistes pour que ce ne soit pas vide.
Réponds en JSON : {"nom": "…", "accroche": "…", "ecrans": [{"nom":"…","contenu":"une phrase"}], "fonctions": ["…"], "donnees": ["…"], "style": {"ambiance":"…","couleurs":["#…","#…","#…"],"police":"une police Google Fonts"}, "criteres": ["critère vérifiable de réussite", "…"]}
6 à 12 fonctions, 5 à 10 critères vérifiables. Langue du produit : celle de l'ordre du client.`;

const SYS_CONSTRUIRE = `Tu es le développeur principal de l'atelier ineed.shopping, au niveau des meilleurs produits du marché. Tu reçois un plan et tu livres le produit fini.
Règles :
- Un seul fichier HTML complet, de <!doctype html> à </html>, rien d'autre dans ta réponse que ce fichier dans un bloc \`\`\`html.
- CSS et JavaScript dans le fichier ; aucune bibliothèque externe sauf une police Google Fonts. Pas de framework.
- Mobile d'abord (largeur 360 px sans défilement horizontal), parfait aussi sur ordinateur ; finition soignée (espacements, ombres légères, transitions, états vides, retours visuels après chaque action).
- Toutes les fonctions du plan marchent vraiment ; données dans localStorage (try/catch autour de chaque accès), données d'exemple réalistes au premier lancement, bouton pour réinitialiser.
- Aucune fenêtre alert/confirm/prompt : utiliser des messages intégrés à la page.
- Accessibilité : contrastes suffisants dans TOUS les états (onglet actif et inactif, survol, fond sombre et clair : jamais de texte blanc sur fond blanc), boutons d'au moins 44 px, libellés clairs.
- Aucun mot technique dans l'interface (pas de « JSON », « localStorage », « données »), parler comme à un client : « Sauvegarder mes devis », « Récupérer une sauvegarde ».
- Petite mention discrète en pied de page : « Créé avec ineed.shopping ».
- Code complet : aucun « … », aucun TODO, aucune fonction vide.`;

const SYS_RELIRE = `Tu es le contrôleur qualité de l'atelier ineed.shopping, indépendant du développeur. Tu reçois le plan, les critères et le fichier HTML livré, plus les défauts trouvés par le contrôle automatique.
Vérifie chaque critère et cherche les bogues (texte invisible car de même couleur que son fond dans un état actif ou inactif, mot technique visible par le client, fonction appelée mais absente, bouton sans effet, élément introuvable par son id, données non sauvegardées, débordement sur téléphone).
Corrige par des remplacements exacts : "chercher" doit être un extrait copié à l'identique du fichier (assez long pour être unique), "remplacer" le nouveau texte.
Réponds en JSON : {"note": 0-100, "criteres_ok": nombre, "defauts": ["…"], "corrections": [{"chercher":"…","remplacer":"…"}]}`;

const SYS_RETOUCHER = `Tu es le développeur de l'atelier ineed.shopping. Le client demande une modification de son produit (fichier HTML ci-dessous).
Fais exactement ce qu'il demande, sans rien casser du reste.
Si la modification est locale, réponds en JSON : {"mode":"corrections","resume":"ce que tu as fait, une phrase simple","corrections":[{"chercher":"extrait exact et unique du fichier","remplacer":"…"}]}
Préfère toujours des corrections ciblées, même nombreuses ; le mode complet est réservé à une refonte totale : {"mode":"complet","resume":"…","html":"le fichier complet"}`;

/* ---------- journal et étapes ---------- */
async function journal(id: string, etape: string, texte: string, cout = 0) {
  await sql`update ineed_chantiers set etape=${etape}, maj_le=now(), cout_usd=cout_usd+${cout},
    journal = journal || ${sql.json([{ le: new Date().toISOString(), etape, texte }])} where id=${id}`;
}
// Une étape par appel : chaque étape a ainsi tout le temps d'exécution d'un appel, puis l'atelier se relance lui-même.
async function etape(id: string, suite: () => void) {
  const [c] = await sql`select * from ineed_chantiers where id=${id}`;
  if (!c || ["livre", "panne"].includes(c.etape)) return;
  try {
    const contexte = `Ordre du client : ${c.ordre}\n\nCe que le chef de projet a compris : ${JSON.stringify(c.cadrage)}\n\nRéponses du client aux questions : ${JSON.stringify(c.reponses)}`;
    if (!c.plan) {
      let r = await ia(SYS_PLAN, contexte, { max: 8000, jsonMode: true });
      let plan = objet(r.texte);
      if (!plan) { console.error("plan illisible :", r.texte.slice(0, 300), "…", r.texte.slice(-200)); r = await ia(SYS_PLAN, contexte + "\n\nSois bref : phrases courtes, JSON valide uniquement.", { max: 8000, jsonMode: true, temp: 0.1 }); plan = objet(r.texte); }
      if (!plan) throw new Error("plan illisible : " + r.texte.slice(-120));
      await sql`update ineed_chantiers set plan=${sql.json(plan)} where id=${id}`;
      await journal(id, "construction", `Plan prêt : ${plan.ecrans?.length || 0} écrans, ${plan.fonctions?.length || 0} fonctions. Le développeur construit.`, r.cout);
      return suite();
    }
    if (!c.html) {
      // Construction par tranches de 45 s : le brouillon est gardé, l'appel suivant reprend exactement où il s'est arrêté.
      const debut = c.brouillon || "";
      const r = await ia(SYS_CONSTRUIRE, `${contexte}\n\nPlan à réaliser :\n${JSON.stringify(c.plan)}`, { max: debut ? 8000 : 14000, fort: true, temp: 0.4, delaiMs: 45000, debut: debut || undefined,
        progres: (t) => sql`update ineed_chantiers set maj_le=now(), journal = journal || ${sql.json([{ le: new Date().toISOString(), etape: "construction", texte: `Construction en cours : ${Math.round((debut.length + t.length) / 1024)} Ko écrits.` }])}, brouillon=${debut + t} where id=${id}` });
      const tout = debut + r.texte;
      const termine = r.fini || /<\/html>\s*(```)?\s*$/i.test(tout);
      if (!termine) {
        if (c.tranches >= 12) throw new Error("construction trop longue");
        await sql`update ineed_chantiers set brouillon=${tout}, tranches=tranches+1 where id=${id}`;
        await journal(id, "construction", `Construction en cours : ${Math.round(tout.length / 1024)} Ko écrits.`, r.cout);
        return suite();
      }
      const html = extraireHtml(tout);
      if (!/<html/i.test(html)) throw new Error("construction vide");
      await sql`update ineed_chantiers set html=${html}, brouillon=null where id=${id}`;
      await journal(id, "controle", `Produit construit (${Math.round(html.length / 1024)} Ko). Le contrôleur qualité le vérifie.`, r.cout);
      return suite();
    }
    // Contrôle : automatique puis relecture indépendante, deux tours au plus.
    const tour = c.tours + 1;
    const auto = controle(c.html);
    const r = await relecteur(SYS_RELIRE, `Plan et critères :\n${JSON.stringify(c.plan)}\n\nDéfauts du contrôle automatique : ${auto.length ? auto.join(" | ") : "aucun"}\n\nFichier livré :\n${c.html}`);
    const v = objet(r.texte) || {};
    const note = Number(v.note) || c.note || 0;
    const a = appliquer(c.html, v.corrections);
    const reste = controle(a.html);
    await sql`update ineed_chantiers set html=${a.html}, tours=${tour}, note=${note} where id=${id}`;
    await journal(id, "controle", `Contrôle n° ${tour} : note ${note}/100, ${a.n} correction(s) appliquée(s)${reste.length ? `, ${reste.length} défaut(s) restant(s)` : ", aucun défaut automatique"}.`, r.cout);
    if (tour < 2 && (reste.length || (note < 85 && a.n > 0))) return suite();
    await sql`update ineed_chantiers set versions = versions || ${sql.json([{ le: new Date().toISOString(), consigne: "Première livraison", html: a.html }])} where id=${id}`;
    await journal(id, "livre", `Livré. Note qualité ${note}/100.`);
  } catch (e) {
    await sql`update ineed_chantiers set erreur=${String((e as Error).message).slice(0, 300)}, maj_le=now() where id=${id}`;
    await journal(id, "panne", "Une étape a échoué. Touchez « Reprendre » : l'atelier repart de la dernière étape réussie.");
  }
}
async function retouche(id: string, consigne: string) {
  const [c] = await sql`select html, plan from ineed_chantiers where id=${id}`;
  try {
    const r = await ia(SYS_RETOUCHER, `Plan d'origine : ${JSON.stringify(c.plan)}\n\nDemande du client : ${consigne}\n\nFichier actuel :\n${c.html}`, { max: 8000, jsonMode: true, temp: 0.2, delaiMs: 130000, fort: true });
    const v = objet(r.texte) || {};
    let html = c.html, n = 0;
    if (v.mode === "complet" && typeof v.html === "string" && /<html/i.test(v.html)) { html = extraireHtml(v.html); n = 1; }
    else { const a = appliquer(html, v.corrections); html = a.html; n = a.n; }
    if (!n) throw new Error("rien appliqué");
    const d = controle(html);
    if (d.some((x) => x.startsWith("Erreur de syntaxe"))) throw new Error("syntaxe après retouche");
    await sql`update ineed_chantiers set html=${html}, versions = versions || ${sql.json([{ le: new Date().toISOString(), consigne, html }])} where id=${id}`;
    await journal(id, "livre", `Retouche faite : ${String(v.resume || consigne).slice(0, 200)}`, r.cout);
  } catch {
    await journal(id, "livre", "Je n'ai pas réussi cette retouche sans risquer de casser le reste. Reformulez-la plus simplement : le produit est resté comme avant.");
  }
}
const lancer = (p: Promise<unknown>) => { try { (globalThis as any).EdgeRuntime?.waitUntil(p); } catch { /* exécution directe */ } };
// Relance l'atelier dans un nouvel appel (mêmes en-têtes que l'appel reçu).
function relanceur(req: Request, id: string) {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  for (const k of ["apikey", "authorization"]) { const v = req.headers.get(k); if (v) h[k] = v; }
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ineed-atelier`;
  return () => lancer(fetch(url, { method: "POST", headers: h, body: JSON.stringify({ action: "suite", id }) }).then((r) => r.text()).catch(() => {}));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erreur: "methode" }, 405);
  let b: any;
  try { b = await req.json(); } catch { return json({ erreur: "requete" }, 400); }
  try {
    await schema();
    const ip = await ipHash(req);
    const id = typeof b.id === "string" && /^[0-9a-f-]{36}$/i.test(b.id) ? b.id : null;

    if (b.action === "cadrer") {
      const ordre = String(b.ordre || "").trim().slice(0, 2000);
      if (ordre.length < 8) return json({ erreur: "Décrivez ce que vous voulez en une phrase au moins." }, 400);
      if (await limite(ip, "cadrer")) return json({ erreur: "Vous avez beaucoup utilisé l'atelier aujourd'hui. Revenez demain." }, 429);
      const r = await ia(SYS_CADRER, ordre, { max: 1500, jsonMode: true });
      const c = objet(r.texte);
      if (!c?.questions?.length) return json({ erreur: "Je n'ai pas bien compris. Reformulez en une phrase simple." }, 502);
      c.questions = c.questions.slice(0, 4).map((q: any, i: number) => ({ id: q.id || "q" + (i + 1), q: String(q.q || ""), choix: (q.choix || []).slice(0, 5).map(String), multi: !!q.multi }));
      return json({ ok: true, cadrage: c });
    }
    if (b.action === "construire") {
      const ordre = String(b.ordre || "").trim().slice(0, 2000);
      if (ordre.length < 8) return json({ erreur: "ordre" }, 400);
      if (await limite(ip, "construire")) return json({ erreur: "L'atelier a atteint sa limite de constructions pour aujourd'hui. Revenez demain." }, 429);
      const [c] = await sql`insert into ineed_chantiers(ip_h, ordre, cadrage, reponses) values (${ip}, ${ordre}, ${sql.json(b.cadrage || null)}, ${sql.json(b.reponses || {})}) returning id`;
      await journal(c.id, "plan", "Ordre reçu. L'atelier se met au travail.");
      lancer(etape(c.id, relanceur(req, c.id)));
      return json({ ok: true, id: c.id });
    }
    if (b.action === "reprendre" && id) {
      const [c] = await sql`select etape, (plan is not null) a_plan, (html is not null) a_html from ineed_chantiers where id=${id}`;
      if (!c) return json({ erreur: "introuvable" }, 404);
      if (c.etape !== "panne") return json({ ok: true });
      await sql`update ineed_chantiers set erreur=null, tranches=0, relances=0 where id=${id}`;
      await journal(id, c.a_html ? "controle" : c.a_plan ? "construction" : "plan", "Reprise demandée : l'atelier repart de la dernière étape réussie.");
      lancer(etape(id, relanceur(req, id)));
      return json({ ok: true });
    }
    if (b.action === "modeles") { // liste publique des moteurs disponibles (aucun secret renvoyé)
      const r = await fetch("https://api.deepseek.com/models", { headers: { Authorization: `Bearer ${Deno.env.get("DEEPSEEK_API_KEY")}` } });
      const j = await r.json().catch(() => ({}));
      return json({ ok: r.ok, modeles: (j.data || []).map((m: any) => m.id), defaut: Deno.env.get("FLOVA_MODEL") || "deepseek-flash", fort: Deno.env.get("INEED_MODEL_FORT") || null, nvidia: !!Deno.env.get("NVIDIA_API_KEY") });
    }
    if (b.action === "suite" && id) {
      lancer(etape(id, relanceur(req, id)));
      return json({ ok: true });
    }
    if (b.action === "retoucher" && id) {
      const consigne = String(b.consigne || "").trim().slice(0, 1500);
      if (consigne.length < 3) return json({ erreur: "consigne" }, 400);
      if (await limite(ip, "retoucher")) return json({ erreur: "Beaucoup de retouches aujourd'hui. Revenez demain." }, 429);
      const [c] = await sql`select etape from ineed_chantiers where id=${id}`;
      if (!c || c.etape !== "livre") return json({ erreur: "Le produit n'est pas encore livré." }, 409);
      await journal(id, "retouche", `Retouche demandée : ${consigne.slice(0, 200)}`);
      lancer(retouche(id, consigne));
      return json({ ok: true });
    }
    if (b.action === "etat" && id) {
      const [c] = await sql`select id, cree_le, maj_le, ordre, cadrage, plan, etape, journal, cout_usd, note, erreur, jsonb_array_length(versions) nv,
        case when ${!!b.html} then html end html from ineed_chantiers where id=${id}`;
      if (!c) return json({ erreur: "introuvable" }, 404);
      // Une étape muette depuis plus de 70 s (exécution coupée par la plateforme) repart toute seule, 6 fois au plus.
      if (!["livre", "panne", "retouche"].includes(c.etape) && Date.now() - new Date(c.maj_le).getTime() > 70000) {
        const [r] = await sql`update ineed_chantiers set relances=relances+1, maj_le=now() where id=${id} and maj_le < now() - interval '70 seconds' returning relances`;
        if (r && r.relances <= 6) { lancer(etape(id, relanceur(req, id))); }
        else if (r) { await journal(id, "panne", "L'étape a calé plusieurs fois. Touchez « Reprendre »."); c.etape = "panne"; }
      }
      return json({ ok: true, chantier: { ...c, cout_usd: Number(c.cout_usd) } });
    }
    return json({ erreur: "action" }, 400);
  } catch (e) {
    console.error("atelier :", (e as Error).message);
    return json({ erreur: (e as Error).message === "cle" ? "L'atelier n'est pas encore activé." : "L'atelier ne répond pas pour le moment. Réessayez dans un instant." }, 502);
  }
});
