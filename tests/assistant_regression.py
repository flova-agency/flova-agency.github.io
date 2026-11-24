"""Banc de non-régression de l'assistant ✦ Demander (démo publique, bac à sable).
À relancer après toute modification de supabase/functions/flova-assistant : python3 tests/assistant_regression.py
Chaque cas vient d'une vraie erreur vue en test. build by Uxlab.ai"""
import json, time, re
from playwright.sync_api import sync_playwright
CAS = [
  # (demande, type attendu, contrôle)
  ("J'ai une agence de com don il me faut un site dédiée et non un site d'agence de com", "fait", None),   # 19/11 : il demandait de préciser au lieu d'agir
  ("je veux parler aux commercants de la rue", "fait", "titre"),                                             # 19/11 : espace perdue dans le titre
  ("rend le site plus fun", "fait", None),
  ("Ajoute nos vues totales dans les chiffres", None, "periode"),                                           # 19/11 : il changeait la portée du 30 M+
  ("Mets le fond en rouge", "fait", "rouge"),                                                               # 20/11 : Karim trouvait l'assistant trop limité (design refusé)
  ("Change la police du site", "fait", None),
  ("Ajoute une boutique en ligne avec paiement", "hors_champ", None),              # 24/11 : classée « question » (type calculé avant les corrections)
  ("Ajoute un système de réservation", "hors_champ", None),
  ("Quel est le titre de la page ?", "question", None),
  ("Traduis tout le site en anglais", "fait", "bilingue"),                                                # 20/11 : la traduction écrasait le français
  ("Remets les couleurs d'origine", None, None),
  ("Ajoute un client : Boulangerie Saïd", "fait", None),
]
def run():
    ok = True
    with sync_playwright() as p:
        b = p.webkit.launch(); pg = b.new_context(**p.devices['iPhone 15']).new_page()
        for dem, attendu, ctl in CAS:
            pg.goto('https://ineed.shopping/?v=%d' % time.time()); pg.wait_for_timeout(2500); pg.evaluate("document.querySelector('#skip')?.click()"); pg.wait_for_timeout(2800)  # 24/11 : la démo vit sur ineed.shopping
            n0 = pg.evaluate("document.querySelectorAll('#msgs .b.in').length")
            pg.fill('#txt', dem); pg.click('#go')
            pg.wait_for_function(f"document.querySelectorAll('#msgs .b.in').length > {n0} && !document.querySelector('#msgs .typing')", timeout=120000); pg.wait_for_timeout(1200)
            rep = pg.evaluate("[...document.querySelectorAll('#msgs .b.in')].pop().innerText")
            fait = rep.startswith('✓'); hors = ('C’est noté' in rep) or ("C'est noté" in rep) or ('Dans la vraie version' in rep)
            typ = 'fait' if fait else ('hors_champ' if hors else 'question')
            err = []
            if attendu and typ != attendu: err.append(f'type {typ} au lieu de {attendu}')
            if re.search(r'pr[ée]cise[- ]moi', rep, re.I) and not fait: err.append('demande de précision au lieu d’agir')
            if ctl == 'titre':
                h1 = pg.frame_locator('#ifr').locator('header.hero h1').inner_text()
                if re.search(r"[a-zé]d'|[a-zé]l'[a-z]", h1.replace(' ', '¤')) and not re.search(r"\s", h1): err.append('titre collé : ' + h1)
                if re.search(r"[a-zéè]{3,}d’|[a-zéè]{3,}d'", h1): err.append('espace manquante dans le titre : ' + h1)
            if ctl == 'periode':
                figs = pg.frame_locator('#ifr').locator('#L_figs').inner_text()
                if '30 M' in figs and 'été et automne 2026' not in figs: err.append('période du 30 M+ modifiée')
            if ctl == 'rouge':
                bg = pg.frame_locator('#ifr').locator('body').evaluate("b => getComputedStyle(b).backgroundColor")
                r, g, bl = [int(x) for x in re.findall(r'\d+', bg)[:3]]
                if not (r > g + 20 and r > bl + 20): err.append('fond pas rouge : ' + bg)
            if ctl == 'bilingue':
                sw = pg.frame_locator('#ifr').locator('#lgsw')
                if not sw.is_visible(): err.append('sélecteur de langue absent')
                pg.frame_locator('#ifr').locator('#lgsw select').select_option('fr'); pg.wait_for_timeout(600)
                fr = pg.frame_locator('#ifr').locator('header.hero h1').inner_text()
                pg.frame_locator('#ifr').locator('#lgsw select').select_option('en'); pg.wait_for_timeout(600)
                en = pg.frame_locator('#ifr').locator('header.hero h1').inner_text()
                if not re.search(r'cr[ée]ons|attention', fr, re.I) or fr == en: err.append(f'FR « {fr} » / EN « {en} »')
            ok &= not err
            print(('OK  ' if not err else 'ÉCHEC ') + dem[:60], '|', '; '.join(err) or typ)
        b.close()
    return ok

# Cas ajoutés le 20/11 (version 11 h) : testés directement sur le serveur, avec le vrai contenu de la démo.
import urllib.request, os
FN = 'https://nhukbglercraslszazan.supabase.co/functions/v1/flova-assistant'
KEY = 'sb_publishable_Oroyu2rpfCBnjnPxrf6GBQ_dTgkisoB'
SITE = json.load(open(os.path.join(os.path.dirname(__file__), 'site_demo.json')))
def api(instr):
    req = urllib.request.Request(FN, data=json.dumps({'demo': True, 'instruction': instr, 'site': SITE}).encode(), headers={'Content-Type': 'application/json', 'apikey': KEY, 'Authorization': 'Bearer ' + KEY})
    t = time.time(); r = json.load(urllib.request.urlopen(req, timeout=150)); return r, time.time() - t
def run_api():
    ok = True
    CAS2 = [
      ("Analyse mon site et note-le sur 100", lambda r: r['type'] == 'audit' and 0 < r.get('note', 0) <= 100 and len(r.get('criteres', [])) == 5 and r.get('tout')),
      ("Propose-moi 3 styles pour mon site", lambda r: r['type'] == 'styles' and len(r.get('styles', [])) == 3 and len({json.dumps(x['site'].get('theme')) for x in r['styles']}) == 3),
      ("Rends le grand titre plus percutant", lambda r: r['type'] == 'fait' and len(r.get('choix', [])) == 3),
      ("Ajoute l'espagnol", lambda r: r['type'] == 'fait' and 'es' in (r.get('site', {}).get('langs') or {}) and r['site']['t'].get('h1b') == SITE['t'].get('h1b')),
      ("Rends le site plus beau", lambda r: r['type'] in ('fait', 'conseil', 'styles')),
    ]
    for dem, chk in CAS2:
        try: r, dt = api(dem); good = bool(chk(r))
        except Exception as e: r, dt, good = {'type': str(e)[:60]}, 0, False
        ok &= good
        print(('OK  ' if good else 'ÉCHEC ') + dem[:60], '|', r.get('type'), f'{dt:.1f} s')
    return ok
if __name__ == '__main__':
    a = run_api(); b = run()
    raise SystemExit(0 if a and b else 1)
