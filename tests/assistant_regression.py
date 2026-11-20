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
  ("Ajoute une boutique en ligne avec paiement", "hors_champ", None),
  ("Traduis tout le site en anglais", "fait", "bilingue"),                                                # 20/11 : la traduction écrasait le français
  ("Remets les couleurs d'origine", None, None),
  ("Ajoute un client : Boulangerie Saïd", "fait", None),
]
def run():
    ok = True
    with sync_playwright() as p:
        b = p.webkit.launch(); pg = b.new_context(**p.devices['iPhone 15']).new_page()
        for dem, attendu, ctl in CAS:
            pg.goto('https://flovaagency.com/demo?v=%d' % time.time()); pg.wait_for_timeout(2500); pg.click('#skip'); pg.wait_for_timeout(2800)
            n0 = pg.evaluate("document.querySelectorAll('#msgs .b.in').length")
            pg.fill('#txt', dem); pg.click('#go')
            pg.wait_for_function(f"document.querySelectorAll('#msgs .b.in').length > {n0} && !document.querySelector('#msgs .typing')", timeout=120000); pg.wait_for_timeout(1200)
            rep = pg.evaluate("[...document.querySelectorAll('#msgs .b.in')].pop().innerText")
            fait = rep.startswith('✓'); hors = 'Dans la vraie version' in rep
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
if __name__ == '__main__':
    raise SystemExit(0 if run() else 1)
