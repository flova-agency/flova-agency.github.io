"""Banc de non-régression de l'assistant ✦ Demander (démo publique, bac à sable).
À relancer après toute modification de supabase/functions/flova-assistant : python3 tests/assistant_regression.py
Chaque cas vient d'une vraie erreur vue en test. build by Uxlab.ai

25 cas. Deux passages complets : python3 tests/assistant_regression.py --passes 2
La démo accepte au plus 100 appels par 10 minutes : le banc espace les appels (pace()).
"""
import json, time, re, sys, argparse
from playwright.sync_api import sync_playwright

DEMO = 'https://flovaagency.com/demo'
# au plus 100 appels par 10 minutes : on garde une marge (90) et un écart mini entre deux appels
MAX_APPELS = 90
FENETRE = 600.0
ECART_MINI = 6.5
_appels = []

def pace():
    """Respecte la limite de la démo : au plus MAX_APPELS par FENETRE secondes."""
    now = time.time()
    while _appels and now - _appels[0] > FENETRE:
        _appels.pop(0)
    if len(_appels) >= MAX_APPELS:
        attente = FENETRE - (now - _appels[0]) + 1.0
        print(f'  … pause {attente:.0f}s (limite de la démo)')
        time.sleep(attente)
        now = time.time()
        while _appels and now - _appels[0] > FENETRE:
            _appels.pop(0)
    if _appels:
        reste = ECART_MINI - (now - _appels[-1])
        if reste > 0:
            time.sleep(reste)
    _appels.append(time.time())

# mots français qui ne doivent plus apparaître après une traduction complète en anglais
FR_MOTS = re.compile(
    r"\b(nous|vous|votre|vos|notre|nos|les|des|une|avec|pour|dans|sur|par|est|sont|"
    r"et|ou|au|aux|du|de|la|le|un|ce|cette|ces|qui|que|quoi|dont|où|"
    r"vidéos?|clients?|offres?|travaux|expertises?|méthode|contact|secteurs?|"
    r"fondateur|accueil|demander|proposition|abonnés|vues|j'aime|partages|"
    r"commentaires|boutique|restauration|marques?|territoires?|rue|"
    r"stratégie|contenu|création|production|diffusion|performance)\b",
    re.I)

CAS = [
  # (demande, type attendu, contrôle)
  ("J'ai une agence de com don il me faut un site dédiée et non un site d'agence de com", "fait", None),   # 19/11 : il demandait de préciser au lieu d'agir
  ("je veux parler aux commercants de la rue", "fait", "titre"),                                             # 19/11 : espace perdue dans le titre
  ("rend le site plus fun", "fait", None),
  ("Ajoute nos vues totales dans les chiffres", None, "periode"),                                           # 19/11 : il changeait la portée du 30 M+
  ("Mets le fond en rouge", "hors_champ", None),
  ("Ajoute un client : Boulangerie Saïd", "fait", None),
  # --- 19 cas ajoutés (fiche flova-regression-25) ---
  ("Traduis tout le site en anglais", "fait", "english"),
  ("Mets tout le site en anglais, y compris les offres et les chiffres", "fait", "english"),
  ("Change le 16 M de Caftan Factory en 20 M", "fait", "portee"),
  ("Passe les vues TikTok de Mr. Pacha Kebab à 3 M", "fait", "portee"),
  ("Fais quelque chose de mieux", None, "vague"),
  ("Améliore le site", None, "vague"),
  ("Rends ça plus pro", None, "vague"),
  ("Masque la section Offres", "fait", "masque"),
  ("Mets la section Contact juste après les Travaux", "fait", "ordre"),
  ("Retire le client Crousty Factory", "fait", "client_retire"),
  ("Ajoute une offre Premium à 30 vidéos par mois", "fait", "offre_ajoutee"),
  ("Réécris l'accroche du premier écran pour qu'elle soit plus directe", "fait", "accroche"),
  ("Donne-moi 3 idées de vidéos pour une boulangerie", "conseil", "idees"),
  ("Voici la photo de notre boutique : https://exemple.be/boutique.jpg, mets-la dans les formats", "fait", "photo"),
  ("Peux-tu me faire un logo ?", "hors_champ", None),
  ("Écris-moi un poème sur l'automne", "hors_champ", None),
  ("Enlève le point final du grand titre", "fait", "titre_point"),
  ("Vérifie qu'il y a bien un espace entre les deux parties du grand titre", "fait", "espace_h1"),
  ("Ajoute un client : Pharmacie du Centre", "fait", None),
]

def _site(pg):
    """État du site dans l'aperçu (t et L) pour les contrôles de contenu."""
    try:
        return pg.frame_locator('#ifr').locator('body').evaluate(
            "() => { const s = window.__flovaSite; return s ? s() : null; }")
    except Exception:
        return None

def _figs(pg):
    try:
        return pg.frame_locator('#ifr').locator('#L_figs').inner_text()
    except Exception:
        return ''

def _h1(pg):
    try:
        return pg.frame_locator('#ifr').locator('header.hero h1').inner_text()
    except Exception:
        return ''

def _cases(pg):
    try:
        return pg.frame_locator('#ifr').locator('#L_cases').inner_text()
    except Exception:
        return ''

def _plans(pg):
    try:
        return pg.frame_locator('#ifr').locator('#L_plans').inner_text()
    except Exception:
        return ''

def _hero(pg):
    try:
        return pg.frame_locator('#ifr').locator('header.hero .lead').inner_text()
    except Exception:
        return ''

def _sections(pg):
    try:
        return pg.frame_locator('#ifr').locator('body').evaluate(
            "() => [...document.querySelectorAll('[data-s]')].map(s => [s.dataset.s, s.dataset.hide])")
    except Exception:
        return []

def _texte_site(pg):
    """Tout le texte visible de l'aperçu, pour le contrôle anglais."""
    try:
        return pg.frame_locator('#ifr').locator('body').inner_text()
    except Exception:
        return ''

def run(passes=1):
    ok = True
    with sync_playwright() as p:
        b = p.webkit.launch(); pg = b.new_context(**p.devices['iPhone 15']).new_page()
        for passe in range(1, passes + 1):
            print(f'--- passage {passe}/{passes} ---')
            for dem, attendu, ctl in CAS:
                pace()
                pg.goto(DEMO + '?v=%d' % time.time()); pg.wait_for_timeout(2500); pg.click('#skip'); pg.wait_for_timeout(2800)
                n0 = pg.evaluate("document.querySelectorAll('#msgs .b.in').length")
                pg.fill('#txt', dem); pg.click('#go')
                pg.wait_for_function(f"document.querySelectorAll('#msgs .b.in').length > {n0} && !document.querySelector('#msgs .typing')", timeout=120000); pg.wait_for_timeout(1200)
                rep = pg.evaluate("[...document.querySelectorAll('#msgs .b.in')].pop().innerText")
                fait = rep.startswith('✓'); hors = 'Dans la vraie version' in rep
                conseil = (not fait) and (not hors) and bool(re.search(r'\b(id[ée]es?|conseils?|suggestions?)\b', rep, re.I))
                typ = 'fait' if fait else ('hors_champ' if hors else ('conseil' if conseil else 'question'))
                err = []
                if attendu and typ != attendu: err.append(f'type {typ} au lieu de {attendu}')
                if re.search(r'pr[ée]cise[- ]moi', rep, re.I) and not fait: err.append('demande de précision au lieu d’agir')
                if ctl == 'titre':
                    h1 = _h1(pg)
                    if re.search(r"[a-zé]d'|[a-zé]l'[a-z]", h1.replace(' ', '¤')) and not re.search(r"\s", h1): err.append('titre collé : ' + h1)
                    if re.search(r"[a-zéè]{3,}d’|[a-zéè]{3,}d'", h1): err.append('espace manquante dans le titre : ' + h1)
                if ctl == 'periode':
                    figs = _figs(pg)
                    if '30 M' in figs and 'été et automne 2026' not in figs: err.append('période du 30 M+ modifiée')
                if ctl == 'english':
                    txt = _texte_site(pg)
                    reste = sorted(set(m.group(0).lower() for m in FR_MOTS.finditer(txt)))
                    if reste: err.append('mots français restants : ' + ', '.join(reste[:8]))
                if ctl == 'portee':
                    figs = _figs(pg)
                    if '30 M' in figs and 'été et automne 2026' not in figs: err.append('portée du 30 M+ modifiée')
                    if '3 M' in figs and 'abonnés TikTok' not in figs: err.append('portée du 3 M modifiée')
                if ctl == 'vague':
                    if typ == 'question': err.append('question vague au lieu d’agir ou de conseiller')
                if ctl == 'masque':
                    secs = dict(_sections(pg))
                    if secs.get('offres') != '1': err.append('section Offres non masquée')
                if ctl == 'ordre':
                    secs = [s for s, _ in _sections(pg)]
                    if 'contact' in secs and 'travaux' in secs and secs.index('contact') != secs.index('travaux') + 1:
                        err.append('Contact pas juste après Travaux : ' + ','.join(secs))
                if ctl == 'client_retire':
                    if 'Crousty Factory' in _cases(pg): err.append('Crousty Factory encore présent')
                if ctl == 'offre_ajoutee':
                    if 'Premium' not in _plans(pg): err.append('offre Premium absente')
                if ctl == 'accroche':
                    if not _hero(pg).strip(): err.append('accroche vide')
                if ctl == 'idees':
                    if typ != 'conseil': err.append('type ' + typ + ' au lieu de conseil')
                    choix = pg.evaluate("[...document.querySelectorAll('#msgs .b.in')].pop().querySelectorAll('button').length")
                    if choix < 3: err.append(f'{choix} choix applicables au lieu de 3')
                if ctl == 'photo':
                    if 'exemple.be/boutique.jpg' not in _texte_site(pg) and 'exemple.be/boutique.jpg' not in rep:
                        err.append('adresse de la photo non reprise')
                if ctl == 'titre_point':
                    h1 = _h1(pg).strip()
                    if h1.endswith('.'): err.append('point final encore présent : ' + h1)
                if ctl == 'espace_h1':
                    h1 = _h1(pg)
                    if re.search(r"[a-zéè]{3,}d’|[a-zéè]{3,}d'", h1): err.append('espace manquante dans le titre : ' + h1)
                ok &= not err
                print(('OK  ' if not err else 'ÉCHEC ') + dem[:60], '|', '; '.join(err) or typ)
        b.close()
    return ok

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--passes', type=int, default=1)
    a = ap.parse_args()
    raise SystemExit(0 if run(a.passes) else 1)
