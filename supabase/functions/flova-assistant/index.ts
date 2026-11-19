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

Règles :
1. Fais exactement ce qui est demandé, rien de plus. Garde tout le reste identique, caractère pour caractère.
2. N'invente jamais de chiffre, de client ni de résultat. Si la demande en a besoin et ne le donne pas, ne change rien et demande-le dans "resume".
3. Jamais de prix sur le site.
4. Images : réutilise uniquement des adresses déjà présentes dans le contenu. Pour un nouveau client sans logo, reprends "img/l1.jpg" et précise dans "resume" qu'il faudra changer l'image avec le bouton « Changer l'image ».
5. Écris en français soigné, dans le style du site : phrases courtes, chiffres au format « 1,2 M », « 27,8 K », « +430 ».
6. Si la demande touche au design (couleurs, polices, mise en page) ou à quelque chose que ce contenu ne permet pas, ne change rien et explique-le simplement dans "resume".

Réponds uniquement avec un objet JSON de cette forme :
{"changes": {
   "t": {seulement les clés de textes modifiées},
   "L": {seulement les listes modifiées, chacune donnée en entier},
   "hide": {seulement les sections dont l'état change : true pour masquer, false pour afficher},
   "order": [la liste complète des sections dans le nouvel ordre, seulement si l'ordre change],
   "links": {seulement les liens modifiés}
 },
 "resume": "une phrase courte, en tutoyant, qui dit ce que tu as fait"}
Omets toute partie qui ne change pas. Si rien ne change, renvoie "changes": {}.`;

function clean(ch: any, prev: any) {
  const out: any = { t: { ...(prev.t || {}) }, L: {}, hide: {}, order: [], links: { ...(prev.links || {}) } };
  const n = { t: 0, L: 0, hide: 0, order: 0, links: 0 };
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
  return { site: out, count: n.t + n.L + n.hide + n.order + n.links };
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
    const { data: ok } = await sb.rpc("flova_is_editor");
    if (!ok) return json({ error: "Cette adresse n'a pas l'accès à la modification du site." }, 403);

    const { instruction, site } = await req.json();
    if (typeof instruction !== "string" || !instruction.trim()) return json({ error: "Demande vide." }, 400);
    if (instruction.length > 2000) return json({ error: "Demande trop longue." }, 400);
    if (!site || typeof site !== "object") return json({ error: "Contenu manquant." }, 400);

    const key = Deno.env.get("DEEPSEEK_API_KEY");
    if (!key) return json({ error: "L'assistant n'est pas encore activé (clé manquante)." }, 503);

    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: Deno.env.get("FLOVA_MODEL") || "deepseek-flash",
        temperature: 0.2,
        max_tokens: 8000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Contenu actuel :\n${JSON.stringify(site)}\n\nDemande : ${instruction.trim()}` },
        ],
      }),
    });
    if (!r.ok) return json({ error: "L'assistant ne répond pas pour le moment (" + r.status + "). Réessaie dans un instant." }, 502);
    const out = await r.json();
    const text: string = out?.choices?.[0]?.message?.content || "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return json({ error: "Réponse incomprise, reformule ta demande." }, 502);
    const parsed = JSON.parse(m[0]);
    const { site: next, count } = clean(parsed.changes || {}, site);
    return json({ site: next, count, resume: String(parsed.resume || (count ? "C'est fait." : "Rien n'a été changé.")).slice(0, 400) });
  } catch (e) {
    return json({ error: "Erreur de l'assistant : " + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
