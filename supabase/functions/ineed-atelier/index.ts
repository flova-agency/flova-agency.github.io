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
    alter table public.ineed_chantiers add column if not exists cle_envoi text;
    alter table public.ineed_chantiers add column if not exists user_id uuid;
    alter table public.ineed_chantiers add column if not exists depuis_modele uuid;
    alter table public.ineed_chantiers add column if not exists cache_tente boolean not null default false;
    create table if not exists public.ineed_bibliotheque(
      id uuid primary key default gen_random_uuid(), cree_le timestamptz not null default now(), chantier uuid, genre text, metier text, langue text,
      demande text not null, mots text[] not null default '{}', plan jsonb, html text not null, cout_usd numeric not null default 0, note int, servi int not null default 0);
    alter table public.ineed_bibliotheque enable row level security;
    create index if not exists ineed_chantiers_user on public.ineed_chantiers(user_id, cree_le desc);
    create index if not exists ineed_chantiers_ip on public.ineed_chantiers(ip_h, cree_le desc);
    create table if not exists public.ineed_comptes(
      user_id uuid primary key, email text, cree_le timestamptz not null default now(), stripe_client text, abonnement text,
      statut text, fin_periode timestamptz, resiliation boolean not null default false, verifie_le timestamptz);
    alter table public.ineed_comptes enable row level security;
    alter table public.ineed_chantiers add column if not exists slug text;
    create unique index if not exists ineed_chantiers_slug on public.ineed_chantiers(slug) where slug is not null;
    create table if not exists public.ineed_domaines(
      domaine text primary key, chantier uuid not null, user_id uuid, session text, eur numeric, usd numeric,
      etat text not null default 'paiement', erreur text, projet text, cree_le timestamptz not null default now(), maj_le timestamptz not null default now());
    alter table public.ineed_domaines enable row level security;
    revoke all on public.ineed_domaines from anon, authenticated;
    revoke all on public.ineed_comptes from anon, authenticated;
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

/* ---------- comptes, offres et abonnement ---------- */
// Offres (décisions de Karim du 24/11/2026) : 1 création offerte, puis Ultra Premium à 99 €/mois = 30 créations par mois, retouches illimitées.
const OFFRE = { gratuites: 1, ultra_mois: 30, prix_centimes: 9900 };
const ILLIMITES = new Set(["elbazikarim@gmail.com"]); // le fondateur teste sans payer
// Empreinte (sha256) du jeton de publication rangé dans le coffre de l'usine (amd_config flova_publication_jeton) — jamais la valeur.
const PUBLICATION_EMPREINTE = "879be0445fff8b3baba810a3821393cbef2d0fed3b24ebaccbc78bf2f2cd7e79";
const ROBOT = /^robot-[a-z0-9]{4,20}@ineed\.shopping$/; // comptes de test du robot de contrôle
const SITE = "https://ineed.shopping/atelier/";
function cleService() {
  let k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!k) { try { k = Object.values(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"))[0] as string; } catch { /* rien */ } }
  return k;
}
function clePublique() {
  let k = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!k) { try { k = Object.values(JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}"))[0] as string; } catch { /* rien */ } }
  return k;
}
type Qui = { id: string; email: string } | null;
async function quiEst(req: Request): Promise<Qui> {
  const a = req.headers.get("authorization") || "";
  const jeton = a.replace(/^Bearer\s+/i, "");
  if (!jeton || jeton.startsWith("sb_") || jeton.split(".").length !== 3) return null;
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, { headers: { apikey: clePublique(), Authorization: `Bearer ${jeton}` } });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? { id: u.id, email: String(u.email || "").toLowerCase() } : null;
  } catch { return null; }
}
async function stripe(chemin: string, params?: Record<string, string>, methode = "POST") {
  const r = await fetch(`https://api.stripe.com/v1${chemin}`, { method: methode, headers: { Authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY") || ""}`, "Content-Type": "application/x-www-form-urlencoded" }, body: params ? new URLSearchParams(params).toString() : undefined });
  return { ok: r.ok, corps: await r.json().catch(() => ({})) as any };
}
async function compte(qui: NonNullable<Qui>) {
  const [c] = await sql`insert into ineed_comptes(user_id, email) values (${qui.id}, ${qui.email})
    on conflict (user_id) do update set email=excluded.email returning *`;
  // État de l'abonnement relu chez Stripe au plus toutes les heures.
  if (c.abonnement && (!c.verifie_le || Date.now() - new Date(c.verifie_le).getTime() > 3600000)) {
    const r = await stripe(`/subscriptions/${c.abonnement}`, undefined, "GET");
    if (r.ok) {
      const fin = r.corps.current_period_end || r.corps.items?.data?.[0]?.current_period_end;
      const [m] = await sql`update ineed_comptes set statut=${r.corps.status}, resiliation=${!!r.corps.cancel_at_period_end},
        fin_periode=${fin ? new Date(fin * 1000) : null}, verifie_le=now() where user_id=${qui.id} returning *`;
      return m;
    }
  }
  return c;
}
async function droits(qui: Qui, ip: string) {
  const debutMois = new Date(); debutMois.setUTCDate(1); debutMois.setUTCHours(0, 0, 0, 0);
  if (qui && ILLIMITES.has(qui.email)) return { offre: "fondateur", restantes: 999, connecte: true, email: qui.email };
  if (qui) {
    const c = await compte(qui);
    if (["active", "trialing"].includes(c.statut)) {
      const [{ n }] = await sql`select count(*)::int n from ineed_chantiers where user_id=${qui.id} and cree_le >= ${debutMois}`;
      return { offre: "ultra", restantes: Math.max(0, OFFRE.ultra_mois - n), connecte: true, email: qui.email, fin_periode: c.fin_periode, resiliation: c.resiliation };
    }
  }
  // Gratuit : 1 création offerte, comptée par compte et par appareil (adresse) sur 30 jours.
  const [{ n }] = qui && ROBOT.test(qui.email) // robot de contrôle : compté par compte seulement (ses essais partagent la même adresse)
    ? await sql`select count(*)::int n from ineed_chantiers where user_id=${qui.id} and cree_le > now() - interval '30 days'`
    : qui
    ? await sql`select count(*)::int n from ineed_chantiers where (user_id=${qui.id} or ip_h=${ip}) and cree_le > now() - interval '30 days'`
    : await sql`select count(*)::int n from ineed_chantiers where ip_h=${ip} and cree_le > now() - interval '30 days'`;
  return { offre: "gratuite", restantes: Math.max(0, OFFRE.gratuites - n), connecte: !!qui, email: qui?.email || null };
}

/* ---------- beau lien et nom de domaine du client ---------- */
function slugifier(t: string) {
  return String(t || "").split(/\s[—–:|-]\s/)[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "") || "projet";
}
async function donnerSlug(id: string, nom: string) {
  const base = slugifier(nom);
  for (let i = 1; i < 50; i++) {
    const s = i === 1 ? base : `${base}-${i}`;
    const r = await sql`update ineed_chantiers set slug=${s} where id=${id} and slug is null and not exists (select 1 from ineed_chantiers where slug=${s}) returning slug`;
    if (r.length) return r[0].slug as string;
    const [d] = await sql`select slug from ineed_chantiers where id=${id}`; if (d?.slug) return d.slug as string;
  }
  return null;
}
const DOM = /^(?=.{4,63}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?\.[a-z]{2,24}$/;
const VT = () => Deno.env.get("VERCEL_TOKEN") || "";
async function vercel(chemin: string, init: RequestInit = {}) {
  const equipe = Deno.env.get("VERCEL_TEAM_ID");
  const url = `https://api.vercel.com${chemin}${equipe ? (chemin.includes("?") ? "&" : "?") + "teamId=" + equipe : ""}`;
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${VT()}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  return { ok: r.ok, status: r.status, corps: await r.json().catch(() => ({})) as any };
}
const MARGE_EUR = 3, PLAFOND_EUR = 60, USD_EUR = 0.95; // règles Flova (20/11/2026) : le client paie, 3 € de marge, 60 € au plus
async function prixDomaine(d: string) {
  const [a, p] = await Promise.all([vercel(`/v1/registrar/domains/${d}/availability`), vercel(`/v1/registrar/domains/${d}/price?years=1`)]);
  if (!a.ok) return { domaine: d, libre: null as boolean | null };
  if (!a.corps.available) return { domaine: d, libre: false };
  const usd = Number(p.corps?.purchasePrice ?? p.corps?.price);
  if (!p.ok || !Number.isFinite(usd) || usd <= 0) return { domaine: d, libre: null };
  const eur = Math.ceil(usd * USD_EUR + MARGE_EUR) - 0.1;
  return { domaine: d, libre: eur <= PLAFOND_EUR, eur: Math.round(eur * 100) / 100, usd, premium: eur > PLAFOND_EUR };
}
async function publierVercel(projet: string, html: string) {
  const pr = await vercel(`/v9/projects/${projet}`);
  if (!pr.ok) { const c = await vercel(`/v10/projects`, { method: "POST", body: JSON.stringify({ name: projet, framework: null }) }); if (!c.ok) throw new Error("projet refusé : " + (c.corps?.error?.message || c.status)); }
  const dep = await vercel(`/v13/deployments`, { method: "POST", body: JSON.stringify({ name: projet, project: projet, target: "production",
    files: [{ file: "index.html", data: html }], projectSettings: { framework: null, buildCommand: null, outputDirectory: null } }) });
  if (!dep.ok) throw new Error("publication refusée : " + (dep.corps?.error?.message || dep.status));
  return dep.corps.url as string;
}
async function mailClient(to: string, sujet: string, html: string) {
  const k = Deno.env.get("RESEND_API_KEY"); if (!k || !to) return;
  await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "ineed.shopping <noreply@flovaagency.com>", to: [to], reply_to: "contact@ineed.shopping", subject: sujet, html }) }).catch(() => {});
}
// Achat et mise en ligne après paiement : idempotent (un domaine déjà en cours ou en ligne n'est jamais racheté).
async function livrerDomaine(sessionId: string) {
  const r = await stripe(`/checkout/sessions/${sessionId}`, undefined, "GET");
  const s2 = r.corps; const d = String(s2?.metadata?.domaine || "");
  if (!r.ok || !DOM.test(d) || s2.payment_status !== "paid") return { etat: "attente" };
  const [pris] = await sql`update ineed_domaines set etat='achat', maj_le=now() where domaine=${d} and etat='paiement' returning *`;
  const [row] = pris ? [pris] : await sql`select * from ineed_domaines where domaine=${d}`;
  if (!pris) return { etat: row?.etat || "inconnu", domaine: d };
  const cd = s2.customer_details || {}; const ad = cd.address || {};
  const [prenom, ...reste] = String(cd.name || "Client ineed").trim().split(/\s+/);
  const tel = String(cd.phone || "").replace(/[^\d+]/g, ""); const intl = tel.startsWith("+") ? tel : "+32" + tel.replace(/^0/, "");
  const contact = { firstName: prenom, lastName: reste.join(" ") || prenom, email: cd.email, phone: intl.replace(/^(\+\d{2})/, "$1."),
    address1: ad.line1 || "", city: ad.city || "", state: ad.state || ad.city || "", zip: ad.postal_code || "", country: (ad.country || "BE").toUpperCase() };
  try {
    const achat = await vercel(`/v1/registrar/domains/${d}/buy`, { method: "POST", body: JSON.stringify({ autoRenew: true, years: 1, expectedPrice: Number(row.usd), contactInformation: contact }) });
    if (!achat.ok) throw new Error("achat refusé : " + (achat.corps?.error?.message || achat.status));
    const [c] = await sql`select html, slug, plan from ineed_chantiers where id=${row.chantier}`;
    const projet = ("ineed-" + (c.slug || String(row.chantier).slice(0, 8))).slice(0, 90);
    await publierVercel(projet, c.html);
    for (const nom of [d, "www." + d]) {
      const a = await vercel(`/v10/projects/${projet}/domains`, { method: "POST", body: JSON.stringify(nom.startsWith("www.") ? { name: nom, redirect: d } : { name: nom }) });
      if (!a.ok && a.status !== 409 && a.corps?.error?.code !== "domain_already_in_use") throw new Error("branchement refusé : " + (a.corps?.error?.message || a.status));
    }
    await sql`update ineed_domaines set etat='en_ligne', projet=${projet}, maj_le=now() where domaine=${d}`;
    await journal(row.chantier, "livre", `En ligne sur ${d}`);
    await mailClient(cd.email, `Votre site est en ligne sur ${d}`, `<p>Bonjour,</p><p>C'est fait : <b>${d}</b> est à votre nom et votre création y est en ligne, avec le cadenas de sécurité. Les premières minutes, l'adresse peut encore mettre un peu de temps à répondre partout.</p><p><a href="https://${d}">https://${d}</a></p><p>L'équipe ineed.shopping</p>`);
    return { etat: "en_ligne", domaine: d };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    if (s2.payment_intent) await stripe("/refunds", { payment_intent: String(s2.payment_intent) });
    await sql`update ineed_domaines set etat='rembourse', erreur=${msg}, maj_le=now() where domaine=${d}`;
    await mailClient(cd.email, `${d} : paiement remboursé`, `<p>Bonjour,</p><p>L'adresse <b>${d}</b> n'a pas pu être achetée (elle vient peut-être d'être prise). Votre paiement est remboursé automatiquement. Choisissez une autre adresse depuis votre projet.</p><p>L'équipe ineed.shopping</p>`);
    await mailClient("contact@ineed.shopping", `ineed : achat de ${d} échoué, client remboursé`, `<p>${msg}</p>`);
    return { etat: "rembourse", domaine: d };
  }
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
    } catch (e) { console.error("deepseek coupé :", (e as Error).message); noter(0, true, modele); }
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
Réponds en JSON : {"nom": "…", "accroche": "…", "ecrans": [{"nom":"…","contenu":"une phrase"}], "fonctions": ["…"], "donnees": ["…"], "style": {"ambiance":"…","reference":"2 ou 3 marques de luxe ou studios dont l'univers inspire le produit (ex. Aesop, Apple, Dior, Aman, Nike)","ouverture":"la première image qui doit couper le souffle : composition, effet, mouvement","couleurs":["#…","#…","#…","#…"],"police":"police Google Fonts des titres","police_texte":"police Google Fonts du texte","signature":"l'effet visuel signature unique de ce produit (ex. dégradé animé, grain photo, typographie géante en surimpression)"}, "criteres": ["critère vérifiable de réussite", "…"]}
6 à 12 fonctions, 5 à 10 critères vérifiables. Langue du produit : celle de l'ordre du client.
Direction artistique : choisis un univers fort, propre au métier et au public (jamais le même gabarit d'un produit à l'autre), digne d'une grande marque. Le premier coup d'œil doit provoquer un « waouh ».`;

const SYS_CONSTRUIRE = `Tu es le développeur principal de l'atelier ineed.shopping, au niveau des meilleurs produits du marché. Tu reçois un plan et tu livres le produit fini.
Règles :
- Un seul fichier HTML complet, de <!doctype html> à </html>, rien d'autre dans ta réponse que ce fichier dans un bloc \`\`\`html.
- CSS et JavaScript dans le fichier ; aucune bibliothèque externe sauf une police Google Fonts. Pas de framework.
- Mobile d'abord (largeur 360 px sans défilement horizontal), parfait aussi sur ordinateur ; finition de très haut niveau (espacements généreux, profondeur, transitions, états vides dessinés, retours visuels après chaque action).
- Toutes les fonctions du plan marchent vraiment ; données dans localStorage (try/catch autour de chaque accès), données d'exemple réalistes au premier lancement, bouton pour réinitialiser.
- Aucune fenêtre alert/confirm/prompt : utiliser des messages intégrés à la page.
- Accessibilité : contrastes suffisants dans TOUS les états (onglet actif et inactif, survol, fond sombre et clair : jamais de texte blanc sur fond blanc), boutons d'au moins 44 px, libellés clairs.
- Aucun mot technique dans l'interface (pas de « JSON », « localStorage », « données »), parler comme à un client : « Sauvegarder mes devis », « Récupérer une sauvegarde ».
- DIRECTION ARTISTIQUE — exigence absolue du fondateur : le produit doit en mettre plein la vue dès la première seconde, au niveau des sites des grandes marques (Apple, Aesop, Dior, Aman, Nike, studios primés Awwwards). Le façadisme est voulu : c'est lui qui fait signer les clients.
  • Ouverture spectaculaire en plein écran : composition audacieuse, typographie géante (titres de 48 à 96 px sur téléphone, clamp()), contrastes forts, profondeur (dégradés riches multi-couches, halos, grain, verre dépoli, formes SVG décoratives), aucune zone fade.
  • Mouvement : animations d'entrée en cascade, apparition au défilement (IntersectionObserver), survols vivants, transitions fluides de 200 à 600 ms ; respecter prefers-reduced-motion.
  • Palette signature du plan appliquée avec audace ; deux polices bien contrastées (titres et texte) ; hiérarchie nette ; grandes respirations.
  • INTERDIT, car vu comme basique : cartes beiges ou grises posées sur fond clair, pastilles arrondies génériques en rangée, boutons à simple contour pâle, listes plates sans relief, emoji en guise d'illustration, rendu « fichier de présentation ».
  • Les écrans de travail (agenda, listes, formulaires) gardent la même richesse : en-têtes illustrés, chiffres mis en scène, états vides dessinés, boutons pleins et éclatants.
- Petite mention discrète en pied de page : « Créé avec ineed.shopping ».
- Code complet : aucun « … », aucun TODO, aucune fonction vide.`;

const SYS_RELIRE = `Tu es le contrôleur qualité de l'atelier ineed.shopping, indépendant du développeur. Tu reçois le plan, les critères et le fichier HTML livré, plus les défauts trouvés par le contrôle automatique.
Vérifie chaque critère et cherche les bogues (texte invisible car de même couleur que son fond dans un état actif ou inactif, mot technique visible par le client, fonction appelée mais absente, bouton sans effet, élément introuvable par son id, données non sauvegardées, débordement sur téléphone).
Corrige par des remplacements exacts : "chercher" doit être un extrait copié à l'identique du fichier (assez long pour être unique), "remplacer" le nouveau texte.
Tu es aussi directeur artistique : note "design" de 0 à 100 l'effet au premier coup d'œil, comme un client exigeant qui compare aux sites des grandes marques (ouverture spectaculaire, typographie, profondeur, mouvement, palette, absence de tout élément basique : cartes beiges, pastilles génériques, boutons à contour pâle, texte peu lisible). En dessous de 85, tes corrections doivent rehausser le design (CSS plus audacieux, ouverture plus forte), pas seulement réparer.
Réponds en JSON : {"note": 0-100, "design": 0-100, "criteres_ok": nombre, "defauts": ["…"], "corrections": [{"chercher":"…","remplacer":"…"}]}`;

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
/* ---------- bibliothèque de modèles (bus 123) : un site validé (note ≥ 90) est gardé anonymisé, et sert de point de départ à une demande équivalente ---------- */
const VIDES = new Set("pour avec dans une des les mon mes son ses sur par qui que est sont pas plus tout tous mais aussi votre vous nous leur aux du de la le un et ou en au a je veux faire site page application outil".split(" "));
function mots(t: string) { return [...new Set((t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((m) => m.length > 2 && !VIDES.has(m)))]; }
// 25/11 : la ressemblance ignore les noms propres (nom du commerce, ville) : « restaurant marocain à Namur » doit retrouver celui de Liège.
function motsMetier(t: string) { return mots(String(t || "").replace(/(^|[^\p{L}])\p{Lu}[\p{L}'’-]*/gu, "$1 ")); }
function proche(a: string[], b: string[]) { if (!a.length || !b.length) return 0; const B = new Set(b); const n = a.filter((m) => B.has(m)).length; return n / Math.min(a.length, b.length); }
function anonymiser(html: string, c: any) {
  let h = html;
  const prives = new Set<string>();
  if (c.plan?.nom) prives.add(String(c.plan.nom));
  const texte = `${c.ordre} ${JSON.stringify(c.reponses || {})}`;
  for (const m of texte.match(/\b[A-ZÀ-Ý][\wÀ-ÿ'’-]{2,}(?:\s+[A-ZÀ-Ý][\wÀ-ÿ'’-]{2,})*/g) || []) prives.add(m); // noms propres tapés par le client
  const echap = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const n of [...prives].sort((x, y) => y.length - x.length)) if (n.length > 2)
    h = h.replace(new RegExp(`(?<![\\p{L}\\p{N}_$])${echap(n)}(?![\\p{L}\\p{N}_$])`, "gu"), "{{NOM}}"); // mot entier seulement : jamais dans un nom de fonction
  h = h.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "contact@exemple.com").replace(/(\+?\d[\d .\/-]{7,}\d)/g, "+32 400 00 00 00")
       .replace(/https?:\/\/(?!fonts\.)[^"'\s)]+/g, "#");
  return h;
}
// Un modèle est cassé si le repère {{NOM}} colle à un nom de code, ou si le code ne passe plus avec un nom à espace et apostrophe.
function modeleCasse(h: string) { return /[\w$]\{\{NOM\}\}|\{\{NOM\}\}[\w$]/.test(h) || controle(h.split("{{NOM}}").join("Le Nom d’Essai")).length > 0; }
async function garderModele(c: any, html: string, note: number) {
  // 25/11 Karim : TOUT site fabriqué est enregistré (quelle que soit sa note) pour servir les demandes proches à coût réduit.
  // Seuls les modèles notés ≥ 85 et dont le code tient une fois anonymisé sont servis (voir chercherModele).
  const h = anonymiser(html, c);
  const casse = modeleCasse(h);
  if (casse) console.error("modèle enregistré mais non servable : l'anonymisation casse le code");
  const demande = anonymiser(c.ordre || "", c).slice(0, 500) || "(demande vide)";
  const mt = motsMetier((c.ordre || "") + " " + (c.cadrage?.titre || ""));
  const plan = (() => { try { return JSON.parse(anonymiser(JSON.stringify({ ...(c.plan || {}), nom: "{{NOM}}" }), c)); } catch { return { nom: "{{NOM}}" }; } })();
  const [deja] = await sql`select id from ineed_bibliotheque where chantier=${c.id} limit 1`;
  if (deja) { // un site retouché remplace sa propre fiche : jamais de doublon, rien n'est supprimé
    await sql`update ineed_bibliotheque set html=${h}, plan=${sql.json(plan)}, note=${note}, mots=${mt}, demande=${demande}, cout_usd=${Number(c.cout_usd) || 0} where id=${deja.id}`;
    return deja.id;
  }
  const [m] = await sql`insert into ineed_bibliotheque(chantier, genre, metier, langue, demande, mots, plan, html, cout_usd, note)
    values (${c.id}, ${c.cadrage?.genre || null}, ${c.plan?.metier || c.cadrage?.titre || null}, ${c.plan?.langue || "fr"}, ${demande},
      ${mt}, ${sql.json(plan)}, ${h}, ${Number(c.cout_usd) || 0}, ${note}) returning id`;
  return m?.id || null;
}
async function chercherModele(c: any) {
  const m = motsMetier(c.ordre + " " + (c.cadrage?.titre || ""));
  const l = await sql`select id, mots, cout_usd, note from ineed_bibliotheque where (genre is not distinct from ${c.cadrage?.genre || null}) and coalesce(note, 0) >= 85 and chantier is distinct from ${c.id} order by note desc, cree_le desc limit 300`;
  const tries = l.map((x: any) => ({ ...x, score: proche(m, x.mots) })).filter((x: any) => x.score >= 0.5).sort((a: any, b: any) => (b.note || 0) - (a.note || 0) || b.score - a.score); // 25/11 : on sert le meilleur modèle proche noté ≥ 85
  for (const x of tries.slice(0, 3)) { // un modèle dont le code casse une fois anonymisé n'est jamais servi
    const [h] = await sql`select html from ineed_bibliotheque where id=${x.id}`;
    if (!modeleCasse(String(h?.html || ""))) return x;
  }
  return null;
}
const SYS_PERSONNALISER = `Tu es le développeur de l'atelier ineed.shopping. Tu reçois un produit déjà validé (HTML, anonymisé : {{NOM}} marque le nom du client précédent, coordonnées remplacées) et la demande d'un NOUVEAU client du même métier.
Adapte-le à ce nouveau client par remplacements ciblés : son nom à la place de {{NOM}}, ses textes, sa ville, ses prestations, ses couleurs si demandées. Garde la structure, le design et le code qui fonctionnent. Ne laisse aucun {{NOM}}.
Réponds en JSON : {"nom": "nom du produit", "corrections": [{"chercher":"texte exact présent dans le fichier","remplacer":"nouveau texte"}]}`;

async function etape(id: string, suite: () => void) {
  const [c] = await sql`select * from ineed_chantiers where id=${id}`;
  if (!c || ["livre", "panne"].includes(c.etape)) return;
  try {
    const contexte = `Ordre du client : ${c.ordre}\n\nCe que le chef de projet a compris : ${JSON.stringify(c.cadrage)}\n\nRéponses du client aux questions : ${JSON.stringify(c.reponses)}`;
    if (!c.plan && !c.cache_tente) {
      await sql`update ineed_chantiers set cache_tente=true where id=${id}`;
      const mod = await chercherModele(c).catch((e) => { console.error("bibliothèque :", (e as Error).message); return null; });
      if (mod) {
        const [m] = await sql`select html, plan, cout_usd, note from ineed_bibliotheque where id=${mod.id}`;
        const r = await ia(SYS_PERSONNALISER, `${contexte}\n\nProduit validé à adapter :\n${m.html}`, { max: 6000, jsonMode: true, temp: 0.2 });
        const v = objet(r.texte) || {};
        // Chaque adaptation n'est gardée que si elle n'ajoute aucun défaut (ex. apostrophe qui casse un script).
        const nom = String(v.nom || c.cadrage?.titre || "");
        const sur = (h: string) => controle(h.split("{{NOM}}").join(nom.replace(/['"\\`]/g, "’"))).length;
        let h0 = m.html, n0 = 0; const base = sur(h0);
        for (const k of Array.isArray(v.corrections) ? v.corrections.slice(0, 60) : []) {
          const t = appliquer(h0, [k]); if (!t.n) continue;
          if (sur(t.html) <= base) { h0 = t.html; n0++; }
        }
        const a2 = { html: h0, n: n0 };
        // le nom n'entre dans le code que sous une forme sans guillemet ni apostrophe droite
        const html = a2.html.replace(/<script\b[\s\S]*?<\/script>/gi, (sc) => sc.split("{{NOM}}").join(nom.replace(/['"\\`]/g, "’"))).split("{{NOM}}").join(nom);
        if (a2.n > 0 && /<html/i.test(html) && !html.includes("{{NOM}}")) {
          await sql`update ineed_chantiers set plan=${sql.json({ nom: v.nom || c.cadrage?.titre || "", resume: c.cadrage?.resume || "", genre: c.cadrage?.genre || "", criteres: (m.plan?.criteres || []), style: (m.plan?.style || {}) })}, html=${html}, depuis_modele=${mod.id}, note=${m.note || null} where id=${id}`;
          await sql`update ineed_bibliotheque set servi=servi+1 where id=${mod.id}`;
          await journal(id, "controle", `Servi depuis la bibliothèque (modèle ${String(mod.id).slice(0, 8)}, ressemblance ${Math.round(mod.score * 100)} %) : ${a2.n} adaptation(s). Coût réel ${r.cout.toFixed(4)} $, coût évité ≈ ${Math.max(0, Number(m.cout_usd) - r.cout).toFixed(4)} $.`, r.cout);
          return suite();
        }
        await journal(id, "construction", "Modèle trouvé mais non adaptable : fabrication complète.", r.cout);
      }
    }
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
    // Contrôle : automatique puis relecture indépendante (qualité + direction artistique), trois tours au plus.
    const tour = c.tours + 1;
    const auto = controle(c.html);
    const r = await relecteur(SYS_RELIRE, `Plan et critères :\n${JSON.stringify(c.plan)}\n\nDéfauts du contrôle automatique : ${auto.length ? auto.join(" | ") : "aucun"}\n\nFichier livré :\n${c.html}`);
    const v = objet(r.texte) || {};
    const lisible = Number.isFinite(Number(v.note)) && Number(v.note) > 0;
    const design = Number(v.design) || 0;
    const note = lisible ? Math.min(Number(v.note), design || 100) : (c.depuis_modele ? 0 : (c.note || 0)); // un site tiré d'un modèle doit être vraiment relu // réponse illisible : on garde la note connue (modèle validé)
    const a = appliquer(c.html, v.corrections);
    const reste = controle(a.html);
    await sql`update ineed_chantiers set html=${a.html}, tours=${tour}, note=${note} where id=${id}`;
    await journal(id, "controle", `Contrôle n° ${tour} : note ${note}/100 (design ${design || "?"}/100), ${a.n} correction(s) appliquée(s)${reste.length ? `, ${reste.length} défaut(s) restant(s)` : ", aucun défaut automatique"}.`, r.cout);
    if (c.depuis_modele && !lisible && tour < 3) { await journal(id, "controle", "Relecture illisible : je relis encore une fois avant de jeter l'adaptation."); return suite(); } // 25/11 : une relecture ratée (~0,003 $) ne doit pas jeter une adaptation et coûter une fabrication neuve (~0,09 $)
    if (tour < (c.depuis_modele ? 1 : 3) && (reste.length || (note < 85 && a.n > 0))) return suite();
    if (c.depuis_modele && (note < 85 || reste.length)) { // 25/11 décision Karim (QCM) : une adaptation est acceptée dès 85, comme l'entrée en bibliothèque (remplace le 90 du bus 144)
      await sql`update ineed_chantiers set plan=null, html=null, depuis_modele=null, tours=0, note=null where id=${id}`;
      await journal(id, "construction", `Adaptation du modèle notée ${note}/100 (< 85) : l'atelier repart sur une fabrication neuve.`);
      return suite();
    }
    await sql`update ineed_chantiers set versions = versions || ${sql.json([{ le: new Date().toISOString(), consigne: "Première livraison", html: a.html }])} where id=${id}`;
    const [cc] = await sql`select * from ineed_chantiers where id=${id}`;
    const gm = await garderModele(cc, a.html, note).catch((e) => { console.error("garder modèle :", (e as Error).message); return null; });
    await journal(id, "livre", `Livré. Note qualité ${note}/100.${cc.depuis_modele ? " Servi depuis la bibliothèque : oui." : " Servi depuis la bibliothèque : non."}${gm ? ` Gardé comme modèle (fiche ${String(gm).slice(0, 8)}).` : ""}`);
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
    { const [cc] = await sql`select * from ineed_chantiers where id=${id}`; if (cc) await garderModele(cc, html, Number(cc.note) || 0).catch((e) => console.error("garder modèle :", (e as Error).message)); } // la bibliothèque garde la dernière version
    const [dm] = await sql`select projet from ineed_domaines where chantier=${id} and etat='en_ligne' and projet is not null limit 1`;
    if (dm && VT()) { try { await publierVercel(dm.projet, html); } catch (e) { console.error("republication :", (e as Error).message); } } // le site en ligne suit la retouche
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
    const qui = await quiEst(req);
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
      // Double envoi (double toucher) : le même ordre du même visiteur dans la minute renvoie le chantier déjà lancé, sans payer deux fois.
      // Clé d'envoi fournie par la page (une par fabrication) ; à défaut, l'adresse du visiteur.
      const cle = typeof b.cle === "string" && /^[0-9a-z-]{8,64}$/i.test(b.cle) ? b.cle : ip;
      const res = await sql.begin(async (t: any) => {
        await t`select pg_advisory_xact_lock(hashtext(${cle + ordre}))`;
        const [deja] = await t`select id from ineed_chantiers where (cle_envoi=${cle} or ip_h=${ip}) and ordre=${ordre} and cree_le > now() - interval '60 seconds' order by cree_le limit 1`;
        if (deja) return { deja: deja.id };
        const d = await droits(qui, ip);
        if (d.restantes <= 0) return { offre: d };
        if (await limite(ip, "construire")) return { limite: true };
        const [n] = await t`insert into ineed_chantiers(ip_h, cle_envoi, user_id, ordre, cadrage, reponses) values (${ip}, ${cle}, ${qui?.id || null}, ${ordre}, ${t.json(b.cadrage || null)}, ${t.json(b.reponses || {})}) returning id`;
        return { id: n.id };
      });
      if (res.deja) return json({ ok: true, id: res.deja, deja: true });
      if (res.offre) return json({ erreur: res.offre.offre === "ultra" ? "Vous avez utilisé vos 30 créations du mois. Elles reviennent le 1er du mois." : "Votre création offerte est déjà utilisée. Passez à l'Ultra Premium pour continuer.", offre: true, droits: res.offre }, 402);
      if (res.limite) return json({ erreur: "L'atelier a atteint sa limite de constructions pour aujourd'hui. Revenez demain." }, 429);
      const c = { id: res.id };
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
    if (b.action === "droits") return json({ ok: true, droits: await droits(qui, ip), prix: "99 € par mois, TVA comprise", creations_mois: OFFRE.ultra_mois });
    if (b.action === "rattacher") { // garde dans « Mes projets » les créations faites avant la connexion
      if (!qui) return json({ erreur: "connexion" }, 401);
      const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x: unknown) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x as string)).slice(0, 50);
      if (ids.length) await sql`update ineed_chantiers set user_id=${qui.id} where id = any(${ids}::uuid[]) and user_id is null`;
      return json({ ok: true });
    }
    if (b.action === "projets") {
      if (!qui) return json({ erreur: "connexion" }, 401);
      const l = await sql`select id, cree_le, maj_le, etape, note, coalesce(plan->>'nom', cadrage->>'titre', left(ordre, 60)) nom, left(ordre, 160) ordre
        from ineed_chantiers where user_id=${qui.id} order by cree_le desc limit 100`;
      return json({ ok: true, projets: l, droits: await droits(qui, ip) });
    }
    if (b.action === "abonner") {
      if (!qui) return json({ erreur: "connexion" }, 401);
      const c = await compte(qui);
      if (["active", "trialing"].includes(c.statut)) return json({ ok: true, deja: true });
      const p: Record<string, string> = {
        mode: "subscription", client_reference_id: qui.id, "metadata[user_id]": qui.id, "subscription_data[metadata][user_id]": qui.id, "subscription_data[metadata][produit]": "ineed-ultra",
        success_url: SITE + "?paiement={CHECKOUT_SESSION_ID}", cancel_url: SITE + "?paiement=annule", locale: "fr",
        "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": "eur", "line_items[0][price_data][unit_amount]": String(OFFRE.prix_centimes),
        "line_items[0][price_data][recurring][interval]": "month", "line_items[0][price_data][tax_behavior]": "inclusive",
        "line_items[0][price_data][product_data][name]": "Ultra Premium — Atelier ineed", "line_items[0][price_data][product_data][description]": "30 créations par mois, retouches illimitées",
        "automatic_tax[enabled]": "true", "tax_id_collection[enabled]": "true", billing_address_collection: "auto", allow_promotion_codes: "true",
      };
      if (c.stripe_client) p.customer = c.stripe_client; else p.customer_email = qui.email;
      if (c.stripe_client) { p["customer_update[address]"] = "auto"; p["customer_update[name]"] = "auto"; }
      if (ROBOT.test(qui.email)) { // contrôle de bout en bout sans argent réel : remise de 100 % sur le premier mois, sans carte
        const cp = await stripe("/coupons", { percent_off: "100", duration: "once", name: "Contrôle robot ineed", max_redemptions: "1" });
        if (cp.ok) { p["discounts[0][coupon]"] = cp.corps.id; delete p.allow_promotion_codes; p.payment_method_collection = "if_required"; }
      }
      let r = await stripe("/checkout/sessions", p);
      if (!r.ok && /tax/i.test(r.corps?.error?.message || "")) { delete p["automatic_tax[enabled]"]; r = await stripe("/checkout/sessions", p); } // repli si la taxe automatique n'est pas prête
      if (!r.ok) { console.error("stripe :", r.corps?.error?.message); return json({ erreur: "Le paiement n'est pas disponible pour le moment. Réessayez dans un instant.", detail: String(r.corps?.error?.message || "").slice(0, 200) }, 502); }
      return json({ ok: true, url: r.corps.url });
    }
    if (b.action === "confirmer") { // retour de la page de paiement : vérifié directement chez Stripe, aucune clé de réception nécessaire
      if (!qui) return json({ erreur: "connexion" }, 401);
      const sid = String(b.session || "");
      if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return json({ erreur: "session" }, 400);
      const r = await stripe(`/checkout/sessions/${sid}?expand[]=subscription`, undefined, "GET");
      const s2 = r.corps;
      if (!r.ok || s2.client_reference_id !== qui.id) return json({ erreur: "Paiement introuvable." }, 404);
      if (s2.status !== "complete" || !s2.subscription) return json({ ok: false, attente: true });
      const sub = s2.subscription;
      const fin = sub.current_period_end || sub.items?.data?.[0]?.current_period_end;
      await sql`insert into ineed_comptes(user_id, email, stripe_client, abonnement, statut, fin_periode, verifie_le)
        values (${qui.id}, ${qui.email}, ${s2.customer}, ${sub.id}, ${sub.status}, ${fin ? new Date(fin * 1000) : null}, now())
        on conflict (user_id) do update set stripe_client=excluded.stripe_client, abonnement=excluded.abonnement, statut=excluded.statut,
          fin_periode=excluded.fin_periode, resiliation=false, verifie_le=now()`;
      return json({ ok: true, droits: await droits(qui, ip) });
    }
    if (b.action === "resilier" || b.action === "reprendre_abonnement") {
      if (!qui) return json({ erreur: "connexion" }, 401);
      const c = await compte(qui);
      if (!c.abonnement) return json({ erreur: "Aucun abonnement." }, 404);
      const r = await stripe(`/subscriptions/${c.abonnement}`, { cancel_at_period_end: b.action === "resilier" ? "true" : "false" });
      if (!r.ok) return json({ erreur: "Impossible pour le moment. Réessayez." }, 502);
      await sql`update ineed_comptes set resiliation=${b.action === "resilier"}, verifie_le=null where user_id=${qui.id}`;
      return json({ ok: true, droits: await droits(qui, ip) });
    }
    if (b.action === "lien_robot") { // connexion du robot de contrôle (adresses robot-…@ineed.shopping uniquement, jamais une vraie personne)
      const email = String(b.email || "").toLowerCase();
      if (!ROBOT.test(email)) return json({ erreur: "refusé" }, 403);
      if (await limite(ip, "cadrer")) return json({ erreur: "limite" }, 429);
      const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: cleService(), Authorization: `Bearer ${cleService()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "magiclink", email, redirect_to: SITE }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return json({ erreur: "lien", detail: j?.msg || j?.error_description || r.status }, 502);
      return json({ ok: true, lien: j.action_link || j.properties?.action_link });
    }
    if (b.action === "bibliotheque_etat") { // lecture seule pour le cerveau et le pilote (même jeton)
      const j = req.headers.get("x-ineed-jeton") || "";
      const h = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(j)))).map((x) => x.toString(16).padStart(2, "0")).join("");
      if (!j || h !== PUBLICATION_EMPREINTE) return json({ erreur: "refusé" }, 403);
      const l = await sql`select id, cree_le, genre, metier, note, servi, cout_usd, mots, length(html) taille from ineed_bibliotheque order by note desc nulls last, cree_le desc limit 300`;
      return json({ ok: true, modeles: l });
    }
    if (b.action === "bibliotheque_rattrapage") { // 25/11 Karim : enregistrer tous les sites déjà faits (même jeton que la publication)
      const j = req.headers.get("x-ineed-jeton") || "";
      const h = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(j)))).map((x) => x.toString(16).padStart(2, "0")).join("");
      if (!j || h !== PUBLICATION_EMPREINTE) return json({ erreur: "refusé" }, 403);
      const l = await sql`select c.* from ineed_chantiers c where c.html is not null and length(c.html) > 500
        and not exists (select 1 from ineed_bibliotheque b where b.chantier = c.id) order by c.cree_le limit 40`;
      const res: any[] = [];
      for (const c of l) {
        try { const id = await garderModele(c, c.html, Number(c.note) || 0); res.push({ chantier: c.id, fiche: id, note: c.note }); }
        catch (e) { res.push({ chantier: c.id, erreur: String((e as Error).message).slice(0, 120) }); }
      }
      let recalcules = 0;
      for (const x of await sql`select b.id, c.ordre, c.cadrage from ineed_bibliotheque b join ineed_chantiers c on c.id = b.chantier`) {
        await sql`update ineed_bibliotheque set mots=${motsMetier((x.ordre || "") + " " + (x.cadrage?.titre || ""))} where id=${x.id}`; recalcules++;
      }
      const [t] = await sql`select count(*)::int n, count(*) filter (where coalesce(note,0) >= 85)::int servables from ineed_bibliotheque`;
      const [r] = await sql`select count(*)::int n from ineed_chantiers c where c.html is not null and length(c.html) > 500 and not exists (select 1 from ineed_bibliotheque b where b.chantier = c.id)`;
      return json({ ok: true, ajoutes: res, recalcules, bibliotheque: t, restants: r.n });
    }
    if (b.action === "sites_publies") { // bus 156 : publication en TIRÉ — usine-2 lit la liste chaque minute et publie <nom>.ineed.shopping
      const j = req.headers.get("x-ineed-jeton") || "";
      const h = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(j)))).map((x) => x.toString(16).padStart(2, "0")).join("");
      if (!j || h !== PUBLICATION_EMPREINTE) return json({ erreur: "refusé" }, 403);
      const depuis = typeof b.depuis === "string" && !isNaN(Date.parse(b.depuis)) ? b.depuis : "1970-01-01";
      const avecHtml = b.html !== false;
      const l = await sql`select c.slug, c.maj_le, c.etape, c.note, (c.html is not null) a_html, ${avecHtml ? sql`c.html` : sql`null::text as html`}
        from ineed_chantiers c left join auth.users u on u.id = c.user_id
        where c.slug is not null and c.slug ~ '^[a-z0-9-]+$' and c.maj_le > ${depuis} and (${b.robots === true} or coalesce(u.email, '') !~ '^robot-')
        order by c.maj_le limit 200`;
      return json({ ok: true, sites: l.map((x: any) => ({ nom: x.slug, html: x.html, maj: x.maj_le, note: x.note == null ? null : Number(x.note), etat: x.etape === "livre" && x.a_html ? "en_ligne" : "retire" })) });
    }
    if (b.action === "par_slug") { // beau lien : ineed.shopping/p/<nom>
      const sl = String(b.slug || "").toLowerCase();
      if (!/^[a-z0-9-]{1,50}$/.test(sl)) return json({ erreur: "introuvable" }, 404);
      const [c] = await sql`select id, plan, html, etape from ineed_chantiers where slug=${sl}`;
      if (!c) return json({ erreur: "introuvable" }, 404);
      return json({ ok: true, chantier: c });
    }
    if (b.action === "domaines") { // adresses proposées pour une création, avec leur prix TTC
      if (!VT()) return json({ ok: false, bientot: true, erreur: "L'achat d'adresse ouvre très bientôt." });
      const brut = String(b.nom || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const voulus: string[] = [];
      if (DOM.test(brut)) voulus.push(brut);
      const racine = (brut.split(".")[0] || "").replace(/[^a-z0-9-]+/g, "").slice(0, 40);
      if (racine) for (const ext of ["be", "com", "shop", "eu", "net", "fr"]) { const x = `${racine}.${ext}`; if (!voulus.includes(x)) voulus.push(x); }
      if (!voulus.length) return json({ erreur: "Tapez le nom voulu, par exemple « darzellige »." }, 400);
      const res = await Promise.all(voulus.slice(0, 7).map(prixDomaine));
      return json({ ok: true, domaines: res });
    }
    if (b.action === "domaine_payer" && id) {
      if (!qui) return json({ erreur: "connexion" }, 401);
      if (!VT()) return json({ erreur: "L'achat d'adresse ouvre très bientôt." }, 503);
      const d = String(b.domaine || "").toLowerCase();
      if (!DOM.test(d)) return json({ erreur: "Adresse non valide." }, 400);
      const [c] = await sql`select user_id, etape from ineed_chantiers where id=${id}`;
      if (!c || c.etape !== "livre") return json({ erreur: "Le projet n'est pas encore livré." }, 409);
      if (c.user_id && c.user_id !== qui.id) return json({ erreur: "Ce projet appartient à un autre compte." }, 403);
      if (!c.user_id) await sql`update ineed_chantiers set user_id=${qui.id} where id=${id} and user_id is null`;
      const p: any = await prixDomaine(d);
      if (!p.libre) return json({ erreur: p.premium ? "Cette adresse est premium. Choisissez-en une autre." : "Cette adresse vient d'être prise. Choisissez-en une autre." }, 409);
      const [deja] = await sql`select etat from ineed_domaines where domaine=${d}`;
      if (deja && deja.etat !== "paiement" && deja.etat !== "rembourse") return json({ erreur: "Cette adresse est déjà en cours d'achat." }, 409);
      const r = await stripe("/checkout/sessions", {
        mode: "payment", locale: "fr", customer_email: qui.email, billing_address_collection: "required", "phone_number_collection[enabled]": "true",
        "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": "eur", "line_items[0][price_data][unit_amount]": String(Math.round(p.eur * 100)),
        "line_items[0][price_data][product_data][name]": `Adresse ${d} — 1 an, mise en ligne comprise`,
        "metadata[domaine]": d, "metadata[chantier]": id, "metadata[user_id]": qui.id,
        success_url: `${SITE}?adresse={CHECKOUT_SESSION_ID}#c=${id}`, cancel_url: `${SITE}#c=${id}`,
      });
      if (!r.ok) return json({ erreur: "Le paiement n'est pas disponible pour le moment.", detail: String(r.corps?.error?.message || "").slice(0, 200) }, 502);
      await sql`insert into ineed_domaines(domaine, chantier, user_id, session, eur, usd, etat) values (${d}, ${id}, ${qui.id}, ${r.corps.id}, ${p.eur}, ${p.usd}, 'paiement')
        on conflict (domaine) do update set chantier=excluded.chantier, user_id=excluded.user_id, session=excluded.session, eur=excluded.eur, usd=excluded.usd, etat='paiement', erreur=null, maj_le=now()`;
      return json({ ok: true, url: r.corps.url, eur: p.eur });
    }
    if (b.action === "domaine_confirmer") {
      const sid = String(b.session || ""); if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return json({ erreur: "session" }, 400);
      const [row] = await sql`select domaine, etat from ineed_domaines where session=${sid}`;
      if (!row) return json({ erreur: "introuvable" }, 404);
      if (row.etat !== "paiement") return json({ ok: true, etat: row.etat, domaine: row.domaine });
      return json({ ok: true, ...(await livrerDomaine(sid)) });
    }
    if (b.action === "suite" && id) {
      lancer(etape(id, relanceur(req, id)));
      return json({ ok: true });
    }
    if (b.action === "retoucher" && id) {
      const consigne = String(b.consigne || "").trim().slice(0, 1500);
      if (consigne.length < 3) return json({ erreur: "consigne" }, 400);
      if (await limite(ip, "retoucher")) return json({ erreur: "Beaucoup de retouches aujourd'hui. Revenez demain." }, 429);
      const [c] = await sql`select etape, user_id from ineed_chantiers where id=${id}`;
      if (!c || c.etape !== "livre") return json({ erreur: "Le produit n'est pas encore livré." }, 409);
      if (c.user_id && c.user_id !== qui?.id) return json({ erreur: "Ce projet appartient à un autre compte. Connectez-vous avec le bon compte Google." }, 403);
      await journal(id, "retouche", `Retouche demandée : ${consigne.slice(0, 200)}`);
      lancer(retouche(id, consigne));
      return json({ ok: true });
    }
    if (b.action === "etat" && id) {
      const [c] = await sql`select id, cree_le, maj_le, ordre, cadrage, plan, etape, journal, cout_usd, note, erreur, slug, jsonb_array_length(versions) nv,
        case when ${!!b.html} then html end html from ineed_chantiers where id=${id}`;
      if (!c) return json({ erreur: "introuvable" }, 404);
      // Une étape muette depuis plus de 70 s (exécution coupée par la plateforme) repart toute seule, 6 fois au plus.
      if (!["livre", "panne", "retouche"].includes(c.etape) && Date.now() - new Date(c.maj_le).getTime() > 70000) {
        const [r] = await sql`update ineed_chantiers set relances=relances+1, maj_le=now() where id=${id} and maj_le < now() - interval '70 seconds' returning relances`;
        if (r && r.relances <= 6) { lancer(etape(id, relanceur(req, id))); }
        else if (r) { await journal(id, "panne", "L'étape a calé plusieurs fois. Touchez « Reprendre »."); c.etape = "panne"; }
      }
      if (c.etape === "livre" && !c.slug) c.slug = await donnerSlug(id, c.plan?.nom || c.cadrage?.titre || c.ordre);
      const [dm] = await sql`select domaine, etat from ineed_domaines where chantier=${id} and etat in ('achat','en_ligne') order by maj_le desc limit 1`;
      return json({ ok: true, chantier: { ...c, cout_usd: Number(c.cout_usd), domaine: dm || null } });
    }
    return json({ erreur: "action" }, 400);
  } catch (e) {
    console.error("atelier :", (e as Error).message);
    return json({ erreur: (e as Error).message === "cle" ? "L'atelier n'est pas encore activé." : "L'atelier ne répond pas pour le moment. Réessayez dans un instant." }, 502);
  }
});
