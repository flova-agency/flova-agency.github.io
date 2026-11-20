// Noms de domaine Flova : prix en direct, paiement par le client (Stripe), achat et branchement automatiques (Vercel).
// Aucune action du fondateur : le paiement du client déclenche tout, et un échec rembourse le client automatiquement.
// Secrets : VERCEL_TOKEN, STRIPE_SECRET_KEY, RESEND_API_KEY (déjà en place). Facultatifs : VERCEL_TEAM_ID, OWNER_EMAIL.
// Réglages (table flova_settings) : domaine_marge_eur (défaut 3), usd_eur (défaut 0.95), domaine_prix_max_eur (défaut 60).
// build by Uxlab.ai
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const SITE = "https://flovaagency.com";
const PROJECT = "flova-site";
const REPO = "flova-agency/flova-agency.github.io";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const DOM = /^(?=.{4,63}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?\.[a-z]{2,10}$/;

function admin() {
  let key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!key) { try { key = Object.values(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"))[0] as string; } catch { /* rien */ } }
  return createClient(Deno.env.get("SUPABASE_URL")!, key, { auth: { persistSession: false } });
}
function anonKey() {
  let k = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!k) { try { k = Object.values(JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}"))[0] as string; } catch { /* rien */ } }
  return k;
}
const db = admin();
async function getSet(k: string) { const { data } = await db.from("flova_settings").select("value").eq("key", k).maybeSingle(); return data?.value ?? null; }
async function putSet(k: string, v: unknown) { await db.from("flova_settings").upsert({ key: k, value: v, updated_at: new Date().toISOString() }); }
async function num(k: string, d: number) { const v = Number(await getSet(k)); return Number.isFinite(v) && v > 0 ? v : d; }

async function mail(to: string, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY"); if (!key || !to) return;
  await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: "Flova Agency <noreply@flovaagency.com>", to: [to], subject, html: `<div style="font:16px/1.55 Arial,sans-serif;color:#06070b;max-width:560px">${html}<p style="color:#888;font-size:12px;margin-top:28px">build by Uxlab.ai</p></div>` }) }).catch(() => {});
}

/* ---------- Vercel ---------- */
const VT = () => Deno.env.get("VERCEL_TOKEN") || "";
const team = () => (Deno.env.get("VERCEL_TEAM_ID") ? `teamId=${Deno.env.get("VERCEL_TEAM_ID")}` : "");
async function vercel(path: string, init: RequestInit = {}) {
  const sep = path.includes("?") ? "&" : "?";
  const r = await fetch(`https://api.vercel.com${path}${team() ? sep + team() : ""}`, { ...init, headers: { Authorization: `Bearer ${VT()}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body };
}
async function priceOf(d: string) {
  const [a, p] = await Promise.all([vercel(`/v1/registrar/domains/${d}/availability`), vercel(`/v1/registrar/domains/${d}/price?years=1`)]);
  if (!a.ok || !p.ok) return { error: a.body?.error?.message || p.body?.error?.message || "prix indisponible" };
  const usd = Number(p.body.purchasePrice ?? p.body.price);
  if (!a.body.available) return { available: false };
  if (!Number.isFinite(usd) || usd <= 0) return { error: "prix indisponible" };
  const eur = Math.ceil(usd * (await num("usd_eur", 0.95)) + (await num("domaine_marge_eur", 3))) - 0.1;
  return { available: true, usd, eur: Math.round(eur * 100) / 100 };
}
/* le site est aussi servi par Vercel pour accueillir les adresses achetées ; il est reconstruit depuis le dépôt */
const SKIP = /^(supabase|tests|usine|\.github)\/|\.(md|py|sh|ts)$|^\./;
async function sha1(buf: ArrayBuffer) { const h = await crypto.subtle.digest("SHA-1", buf); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
async function deploySite() {
  const tree = await fetch(`https://api.github.com/repos/${REPO}/git/trees/main?recursive=1`, { headers: { "User-Agent": "flova" } }).then((r) => r.json());
  const files: { file: string; sha: string; size: number }[] = [];
  for (const it of (tree.tree || []).filter((x: any) => x.type === "blob" && !SKIP.test(x.path) && x.size < 8_000_000)) {
    const buf = await fetch(`https://raw.githubusercontent.com/${REPO}/main/${it.path}`).then((r) => r.arrayBuffer());
    const sha = await sha1(buf);
    const up = await fetch(`https://api.vercel.com/v2/files${team() ? "?" + team() : ""}`, { method: "POST", headers: { Authorization: `Bearer ${VT()}`, "x-vercel-digest": sha, "Content-Type": "application/octet-stream" }, body: buf });
    if (!up.ok && up.status !== 409) throw new Error("envoi de fichier refusé : " + it.path);
    files.push({ file: it.path, sha, size: buf.byteLength });
  }
  const p = await vercel(`/v9/projects/${PROJECT}`);
  if (!p.ok) { const c = await vercel(`/v10/projects`, { method: "POST", body: JSON.stringify({ name: PROJECT, framework: null }) }); if (!c.ok) throw new Error("création du projet refusée"); }
  const dep = await vercel(`/v13/deployments`, { method: "POST", body: JSON.stringify({ name: PROJECT, project: PROJECT, target: "production", files, projectSettings: { framework: null, buildCommand: null, outputDirectory: null } }) });
  if (!dep.ok) throw new Error("mise en ligne refusée : " + (dep.body?.error?.message || dep.status));
  await putSet("vercel_deploy", { at: new Date().toISOString(), url: dep.body.url });
  return dep.body.url;
}
async function attach(d: string) {
  for (const name of [d, "www." + d]) {
    const r = await vercel(`/v10/projects/${PROJECT}/domains`, { method: "POST", body: JSON.stringify(name.startsWith("www.") ? { name, redirect: d } : { name }) });
    if (!r.ok && r.body?.error?.code !== "domain_already_in_use" && r.status !== 409) throw new Error("branchement refusé : " + (r.body?.error?.message || r.status));
  }
}

/* ---------- Stripe ---------- */
const SK = () => Deno.env.get("STRIPE_SECRET_KEY") || "";
async function stripe(path: string, params?: Record<string, string>, method = "POST") {
  const r = await fetch(`https://api.stripe.com/v1${path}`, { method, headers: { Authorization: `Bearer ${SK()}`, "Content-Type": "application/x-www-form-urlencoded" }, body: params ? new URLSearchParams(params).toString() : undefined });
  return { ok: r.ok, body: await r.json().catch(() => ({})) };
}
const HOOK = () => `${Deno.env.get("SUPABASE_URL")}/functions/v1/flova-domaine?action=webhook`;
async function ensureWebhook() {
  if (await getSet("stripe_whsec")) return;
  const r = await stripe("/webhook_endpoints", { url: HOOK(), "enabled_events[0]": "checkout.session.completed", description: "Flova : achat de nom de domaine" });
  if (!r.ok) throw new Error("réception des paiements impossible à installer");
  await putSet("stripe_whsec", r.body.secret);
}
async function verifySig(raw: string, header: string) {
  const sec = String(await getSet("stripe_whsec") || ""); if (!sec || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((x) => x.split("=") as [string, string]));
  if (!parts.t || !parts.v1 || Math.abs(Date.now() / 1000 - Number(parts.t)) > 600) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(sec), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${parts.t}.${raw}`));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === parts.v1;
}

/* ---------- achat complet après paiement ---------- */
async function fulfil(session: any) {
  const d = String(session.metadata?.domaine || ""); if (!DOM.test(d)) return;
  const key = "domaine:" + d, prev: any = await getSet(key);
  if (prev?.etat === "en_ligne" || prev?.etat === "achat") return; // déjà traité
  const contact = JSON.parse(session.metadata?.contact || "{}");
  await putSet(key, { ...prev, etat: "achat", paiement: session.payment_intent, at: new Date().toISOString() });
  try {
    const usd = Number(session.metadata?.usd);
    const buy = await vercel(`/v1/registrar/domains/${d}/buy`, { method: "POST", body: JSON.stringify({ autoRenew: true, years: 1, expectedPrice: usd, contactInformation: contact }) });
    if (!buy.ok) throw new Error("achat refusé : " + (buy.body?.error?.message || buy.body?.message || buy.status));
    if (!(await getSet("vercel_deploy"))) await deploySite();
    await attach(d);
    await putSet(key, { ...prev, etat: "en_ligne", commande: buy.body.orderId, at: new Date().toISOString() });
    await mail(contact.email, `Ton adresse ${d} est à toi`, `<p>Bonjour ${esc(contact.firstName)},</p><p>C'est fait : <b>${esc(d)}</b> est achetée à ton nom et branchée sur ton site. Elle s'affiche avec le cadenas de sécurité dans quelques minutes, le temps qu'internet la découvre.</p><p>Elle se renouvelle automatiquement chaque année.</p>`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (session.payment_intent) await stripe("/refunds", { payment_intent: String(session.payment_intent) });
    await putSet(key, { ...prev, etat: "rembourse", erreur: msg, at: new Date().toISOString() });
    await mail(contact.email, `Ton adresse ${d} : paiement remboursé`, `<p>Bonjour ${esc(contact.firstName)},</p><p>L'adresse <b>${esc(d)}</b> n'a pas pu être achetée (elle vient peut-être d'être prise). Ton paiement est remboursé en totalité. Tu peux en choisir une autre depuis la conversation de ton site.</p>`);
    const owner = Deno.env.get("OWNER_EMAIL") || "";
    if (owner) await mail(owner, `Flova : achat de ${d} échoué, client remboursé`, `<p>${esc(msg)}</p><p>Rien à faire : le client a été remboursé automatiquement.</p>`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  try {
    if (url.searchParams.get("action") === "webhook") {
      const raw = await req.text();
      if (!(await verifySig(raw, req.headers.get("stripe-signature") || ""))) return json({ error: "signature" }, 400);
      const ev = JSON.parse(raw);
      if (ev.type === "checkout.session.completed" && ev.data?.object?.payment_status === "paid") await fulfil(ev.data.object);
      return json({ ok: true });
    }
    const body = await req.json().catch(() => ({}));
    const d = String(body.domaine || "").toLowerCase().trim();
    if (body.action === "etat") { const v: any = DOM.test(d) ? await getSet("domaine:" + d) : null; return json({ etat: v?.etat || "inconnu" }); }
    if (body.action === "pret") return json({ pret: !!(VT() && SK()) });
    if (!VT() || !SK()) return json({ error: "L'achat en direct ouvre très bientôt.", pret: false }, 503);
    if (!DOM.test(d)) return json({ error: "Adresse non valide." }, 400);

    if (body.action === "prix") {
      const p: any = await priceOf(d);
      const max = await num("domaine_prix_max_eur", 60);
      if (p.eur && p.eur > max) return json({ available: false, error: `Cette adresse est premium (plus de ${max} €). Choisis-en une autre.` });
      return json(p);
    }

    if (body.action === "payer") {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, anonKey(), { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
      const { data: ok } = await sb.rpc("flova_is_editor");
      if (!ok) return json({ error: "Connecte-toi pour réserver ton adresse." }, 403);
      const c = body.contact || {};
      const need = ["firstName", "lastName", "email", "phone", "address1", "city", "zip", "country"];
      for (const k of need) if (!String(c[k] || "").trim()) return json({ error: "Il manque une information pour acheter l'adresse à ton nom." }, 400);
      const digits = String(c.phone).replace(/[^\d+]/g, "");
      const intl = digits.startsWith("+") ? digits : digits.startsWith("0") ? "+32" + digits.slice(1) : "+" + digits;
      const contact = { firstName: String(c.firstName).trim(), lastName: String(c.lastName).trim(), email: String(c.email).trim(), phone: intl.replace(/^(\+\d{2})/, "$1."), address1: String(c.address1).trim(), city: String(c.city).trim(), state: String(c.state || c.city).trim(), zip: String(c.zip).trim(), country: String(c.country).trim().toUpperCase().slice(0, 2) };
      const p: any = await priceOf(d);
      if (!p.available) return json({ error: "Cette adresse vient d'être prise. Choisis-en une autre." }, 409);
      if (p.eur > (await num("domaine_prix_max_eur", 60))) return json({ error: "Cette adresse est premium. Choisis-en une autre." }, 400);
      await ensureWebhook();
      const s = await stripe("/checkout/sessions", {
        mode: "payment", "payment_method_types[0]": "card", "payment_method_types[1]": "bancontact",
        "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": "eur",
        "line_items[0][price_data][unit_amount]": String(Math.round(p.eur * 100)),
        "line_items[0][price_data][product_data][name]": `Adresse ${d} (1 an, renouvelable)`,
        customer_email: contact.email,
        success_url: `${SITE}/studio?domaine=${encodeURIComponent(d)}&paye=1`, cancel_url: `${SITE}/studio?domaine=${encodeURIComponent(d)}&paye=0`,
        "metadata[domaine]": d, "metadata[usd]": String(p.usd), "metadata[contact]": JSON.stringify(contact).slice(0, 500),
      });
      if (!s.ok) return json({ error: "Le paiement n'est pas disponible pour le moment." }, 502);
      await putSet("domaine:" + d, { etat: "paiement", eur: p.eur, at: new Date().toISOString() });
      return json({ url: s.body.url, eur: p.eur });
    }

    if (body.action === "deployer") {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, anonKey(), { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
      const { data: ok } = await sb.rpc("flova_is_editor"); if (!ok) return json({ error: "non autorisé" }, 403);
      return json({ url: await deploySite() });
    }
    return json({ error: "action inconnue" }, 400);
  } catch (e) {
    console.error(e); return json({ error: "Petit souci technique. Réessaie dans un instant." }, 500);
  }
});
