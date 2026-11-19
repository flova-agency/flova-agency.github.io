// Demandes du site Flova que l'assistant ne sait pas faire : envoi au fondateur, approbation en un clic, suivi.
// Secrets : RESEND_API_KEY (envoi des e-mails), OWNER_EMAIL (facultatif), USINE_KEY (facultatif, accès de l'usine).
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SITE = "https://flovaagency.com";
const OWNER = Deno.env.get("OWNER_EMAIL") || "elbazikarim@gmail.com";
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

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

function page(title: string, body: string, btn?: { href: string; label: string; color?: string }[]) {
  const buttons = (btn || []).map((b) =>
    `<a href="${esc(b.href)}" style="display:inline-block;background:${b.color || "#2f5bff"};color:#fff;text-decoration:none;font:600 16px Arial,sans-serif;padding:14px 26px;border-radius:999px;margin:6px 8px 6px 0">${esc(b.label)}</a>`).join("");
  return `<div style="font:16px/1.55 Arial,sans-serif;color:#06070b;max-width:560px;margin:0 auto;padding:24px">
<h2 style="font:800 22px Arial,sans-serif;margin:0 0 14px">${esc(title)}</h2>${body}${buttons ? `<div style="margin-top:18px">${buttons}</div>` : ""}
<p style="color:#8a90a3;font-size:12px;margin-top:28px">Flova Agency · build by Uxlab.ai</p></div>`;
}
const quote = (t: string) => `<div style="background:#f3f5fb;border-radius:12px;padding:14px 16px;margin:10px 0;white-space:pre-wrap">${esc(t)}</div>`;

async function mail(to: string, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { ok: false, why: "clé d'envoi absente" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Flova Agency <noreply@flovaagency.com>", to: [to], reply_to: OWNER, subject, html }),
  });
  return { ok: r.ok, why: r.ok ? "" : String(r.status) };
}

const LABEL: Record<string, string> = { recue: "Reçue", approuvee: "Approuvée, en préparation", refusee: "Pas retenue", en_cours: "En fabrication", en_ligne: "En ligne" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode non permise" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const db = admin();

    /* 1. Furkan envoie une demande */
    if (body.action === "send") {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, anonKey(), { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
      const { data: ok } = await sb.rpc("flova_is_editor");
      if (!ok) return json({ error: "Cette adresse n'a pas l'accès à la modification du site." }, 403);
      const { data: u } = await sb.auth.getUser();
      const author = (u?.user?.email || "").toLowerCase();
      const instruction = String(body.instruction || "").trim().slice(0, 2000);
      if (!instruction) return json({ error: "Demande vide." }, 400);
      const since = new Date(Date.now() - 864e5).toISOString();
      const { count } = await db.from("flova_requests").select("id", { count: "exact", head: true }).eq("author", author).gte("created_at", since);
      if ((count || 0) >= 15) return json({ error: "Déjà 15 demandes envoyées aujourd'hui. Réessaie demain." }, 429);
      const { data: row, error } = await db.from("flova_requests")
        .insert({ author, instruction, reply: String(body.reply || "").slice(0, 600) || null }).select("id,token").single();
      if (error) return json({ error: "Enregistrement impossible : " + error.message }, 500);
      const link = (d: string) => `${SITE}/approuver?id=${row.id}&t=${row.token}&d=${d}`;
      const { data: aa } = await db.from("flova_settings").select("value").eq("key", "auto_approve").maybeSingle();
      if (aa?.value === true) {
        await db.from("flova_requests").update({ status: "approuvee", decided_at: new Date().toISOString(), note: "approuvée automatiquement" }).eq("id", row.id);
        const m = await mail(OWNER, `Flova : demande de ${author.split("@")[0]} (partie à l'usine)`, page("Nouvelle demande, approuvée automatiquement",
          `<p><b>${esc(author)}</b> demande :</p>${quote(instruction)}<p>L'approbation automatique est activée : la demande est partie directement à l'usine.</p>`,
          [{ href: link("manuel"), label: "Revenir à l'approbation manuelle", color: "#6b7188" }]));
        await mail(author, "Ta demande est approuvée", page("Demande approuvée ✓", quote(instruction) + "<p>Elle part en fabrication. Tu recevras un e-mail quand elle sera en ligne.</p>"));
        return json({ ok: true, id: row.id, mailed: m.ok, why: m.why, auto: true });
      }
      const m = await mail(OWNER, `Flova : demande de ${author.split("@")[0]}`, page("Nouvelle demande sur le site Flova",
        `<p><b>${esc(author)}</b> demande :</p>${quote(instruction)}` +
        (body.reply ? `<p style="color:#4e5468">Réponse de l'assistant : ${esc(body.reply)}</p>` : "") +
        `<p>Un clic suffit. Approuvée, la demande part à l'usine, qui la fabrique, la teste puis la met en ligne.</p>` +
        `<p style="font-size:14px;color:#4e5468;margin-top:22px">Tu ne veux plus approuver chaque demande ? <a href="${link("auto")}" style="color:#2f5bff">Approuver celle-ci et toutes les suivantes automatiquement</a>. Tu pourras revenir en arrière depuis chaque e-mail.</p>`,
        [{ href: link("ok"), label: "Approuver" }, { href: link("non"), label: "Refuser", color: "#6b7188" }]));
      await mail(author, "Ta demande est bien reçue", page("Demande reçue ✓",
        `<p>Ta demande est transmise :</p>${quote(instruction)}<p>Tu recevras un e-mail dès qu'elle sera approuvée, puis quand elle sera en ligne.</p>`));
      return json({ ok: true, id: row.id, mailed: m.ok, why: m.why });
    }

    /* 2. Le fondateur approuve ou refuse, depuis le bouton de l'e-mail */
    if (body.action === "decide") {
      const { data: r } = await db.from("flova_requests").select("*").eq("id", body.id).maybeSingle();
      if (!r || String(r.token) !== String(body.token)) return json({ error: "Lien non valable." }, 404);
      const mode = body.decision === "auto" ? "auto" : body.decision === "manuel" ? "manuel" : undefined;
      if (mode) await db.from("flova_settings").upsert({ key: "auto_approve", value: mode === "auto", updated_at: new Date().toISOString() });
      if (mode === "manuel") return json({ ok: true, mode, status: r.status, label: LABEL[r.status], instruction: r.instruction });
      if (r.status !== "recue") return json({ ok: true, already: true, mode, status: r.status, label: LABEL[r.status], instruction: r.instruction });
      const status = body.decision === "non" ? "refusee" : "approuvee";
      await db.from("flova_requests").update({ status, decided_at: new Date().toISOString() }).eq("id", r.id).eq("status", "recue");
      await mail(r.author, status === "approuvee" ? "Ta demande est approuvée" : "Ta demande n'est pas retenue pour l'instant",
        page(status === "approuvee" ? "Demande approuvée ✓" : "Demande pas retenue pour l'instant",
          quote(r.instruction) + (status === "approuvee"
            ? "<p>Elle part en fabrication. Tu recevras un e-mail quand elle sera en ligne.</p>"
            : "<p>Tu peux en parler directement en répondant à cet e-mail.</p>")));
      return json({ ok: true, status, mode, label: LABEL[status], instruction: r.instruction });
    }

    /* 3. L'usine prend les demandes approuvées et annonce la mise en ligne */
    if (body.action === "next" || body.action === "done") {
      const k = Deno.env.get("USINE_KEY");
      if (!k || body.key !== k) return json({ error: "accès refusé" }, 403);
      if (body.action === "next") {
        const { data } = await db.from("flova_requests").select("id,created_at,author,instruction,reply").eq("status", "approuvee").order("created_at").limit(10);
        for (const r of data || []) await db.from("flova_requests").update({ status: "en_cours" }).eq("id", r.id).eq("status", "approuvee");
        return json({ ok: true, items: data || [] });
      }
      const { data: r } = await db.from("flova_requests").select("*").eq("id", body.id).maybeSingle();
      if (!r) return json({ error: "inconnue" }, 404);
      await db.from("flova_requests").update({ status: "en_ligne", done_at: new Date().toISOString(), note: String(body.note || "").slice(0, 500) || null }).eq("id", r.id);
      await mail(r.author, "Ta demande est en ligne", page("C'est en ligne ✓", quote(r.instruction) + (body.note ? `<p>${esc(body.note)}</p>` : "") + `<p>Tu peux le voir sur ton site.</p>`, [{ href: SITE, label: "Voir mon site" }]));
      return json({ ok: true });
    }

    return json({ error: "action inconnue" }, 400);
  } catch (e) {
    return json({ error: "Erreur : " + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
