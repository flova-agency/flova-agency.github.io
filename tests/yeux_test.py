"""Le chat voit l'écran de droite et y agit en direct (demande 34) + bouton des offres visible en style clair.
python3 tests/yeux_test.py  (serveur local lancé par le test) — build by Uxlab.ai"""
import json, subprocess, sys, time, pathlib
from playwright.sync_api import sync_playwright

RACINE = pathlib.Path(__file__).resolve().parent.parent
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8765"], cwd=RACINE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
ok = ko = 0
def verif(nom, cond):
    global ok, ko
    print(("OK  " if cond else "ÉCHEC ") + nom); ok += bool(cond); ko += (not cond)

APPAREILS = [("ordinateur", dict(viewport={"width": 1440, "height": 900})), ("iPhone 15", "iPhone 15"), ("iPhone SE", "iPhone SE")]
try:
    with sync_playwright() as p:
        nav = p.webkit.launch()
        for nom, app in APPAREILS:
            ctx = nav.new_context(**(p.devices[app] if isinstance(app, str) else app), service_workers="block")
            pg = ctx.new_page()
            envoye = {}
            def route(r):
                if "flova-assistant" in r.request.url and r.request.method == "POST":
                    envoye.update(json.loads(r.request.post_data or "{}"))
                    r.fulfill(status=200, content_type="application/json", body=json.dumps({"type": "question", "resume": "Réponse d'essai."}))
                else:
                    r.continue_()
            pg.route("**/*", route)
            pg.goto("http://localhost:8765/demo.html")
            pg.wait_for_timeout(1500)
            pg.locator("#skip").click()
            pg.wait_for_timeout(3000)
            fr = pg.frame_locator("#ifr")
            # 1) pointer un élément dans l'aperçu
            fr.locator("#offres h2").first.evaluate("e => e.click()")
            pg.wait_for_timeout(500)
            verif(f"{nom} : le chat voit l'élément pointé", pg.locator("text=Je vois l’élément que tu montres").count() >= 1)
            verif(f"{nom} : l'élément pointé est entouré", fr.locator("#offres h2.pointe").count() == 1)
            # 2) la vue (section à l'écran) et le pointage partent avec la demande
            pg.fill("#txt", "Change ça")
            pg.locator("#go").click()
            pg.wait_for_timeout(1500)
            v = envoye.get("vue") or {}
            verif(f"{nom} : la demande emporte l'élément pointé", (v.get("pointe") or {}).get("section") == "offres")
            verif(f"{nom} : le pointage est effacé après la demande", fr.locator(".pointe").count() == 0)
            verif(f"{nom} : la demande emporte une session de démo", bool(envoye.get("session")))
            # 3) bouton des offres lisible en style clair (texte ≠ fond)
            couleurs = fr.locator("#L_plans .plan:not(.rec) .btn").first.evaluate("""b => { document.documentElement.style.setProperty('--bg','#f4f5f8'); document.documentElement.style.setProperty('--ink','#111318'); document.documentElement.style.setProperty('--card','#ffffff'); const c = getComputedStyle(b); return [c.color, getComputedStyle(b.closest('.plan')).backgroundColor]; }""")
            verif(f"{nom} : bouton « Recevoir une proposition » visible en style clair ({couleurs[0]} sur {couleurs[1]})", couleurs[0] != couleurs[1] and "255, 255, 255" not in couleurs[0])
            ctx.close()
        nav.close()
finally:
    srv.terminate()
print(f"\n{ok}/{ok + ko}")
sys.exit(1 if ko else 0)
