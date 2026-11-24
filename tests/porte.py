"""Porte de bout en bout de Flova (palier 1 du conseil, 24/11/2026).
Lancée par GitHub après chaque déploiement de l'assistant : si un seul contrôle échoue,
le workflow remet en ligne la dernière version verte. Sur iPhone 15, en production (ineed.shopping).
Contrôles : demande → modification visible → annuler → vue visiteur ; hors portée ; question.
build by Uxlab.ai"""
import sys, time
from playwright.sync_api import sync_playwright

URL = 'https://ineed.shopping/'
erreurs = []

def ouvrir(pg):
    pg.goto(URL + '?porte=%d' % time.time(), wait_until='networkidle'); pg.wait_for_timeout(2500)
    pg.evaluate("document.querySelector('#skip')?.click()"); pg.wait_for_timeout(2500)

def demander(pg, texte):
    n0 = pg.evaluate("document.querySelectorAll('#msgs .b.in').length")
    pg.evaluate("t => { const i = document.querySelector('#txt'); i.value = t; document.querySelector('#go').click(); }", texte)
    pg.wait_for_function(f"document.querySelectorAll('#msgs .b.in').length > {n0} && !document.querySelector('#msgs .typing')", timeout=120000)
    pg.wait_for_timeout(1500)
    return pg.evaluate("[...document.querySelectorAll('#msgs .b.in')].pop().innerText")

def titre(pg):
    return pg.frame_locator('#ifr').locator('h1').first.inner_text().strip()

with sync_playwright() as p:
    b = p.webkit.launch()
    pg = b.new_context(**p.devices['iPhone 15']).new_page()
    ouvrir(pg)
    avant = titre(pg)
    # 1. une demande change le site, visiblement
    rep = demander(pg, 'Change le grand titre en Bienvenue chez Porte Test')
    apres = titre(pg)
    if not rep.startswith('✓'): erreurs.append('modification refusée : ' + rep[:120])
    if 'Porte Test' not in apres: erreurs.append('titre pas changé à l’écran : ' + apres[:80])
    # 2. annuler remet le titre d'avant
    pg.evaluate("[...document.querySelectorAll('#msgs [data-undo]')].pop()?.click()"); pg.wait_for_timeout(2000)
    if titre(pg) != avant: erreurs.append('annuler ne remet pas le titre : ' + titre(pg)[:80])
    # 3. hors portée : noté, jamais « question »
    rep = demander(pg, 'Ajoute une boutique en ligne avec paiement')
    if 'noté' not in rep: erreurs.append('boutique pas classée hors portée : ' + rep[:120])
    # 4. question : une réponse, sans rien changer
    t0 = titre(pg); rep = demander(pg, 'Quel est le titre de la page ?')
    if rep.startswith('✓') or 'très demandé' in rep or titre(pg) != t0: erreurs.append('question mal traitée : ' + rep[:120])
    # 5. vue visiteur : le site d'exemple s'affiche seul, sans outils d'édition
    v = b.new_context(**p.devices['iPhone 15']).new_page(); v.goto(URL + 'exemple/', wait_until='networkidle')
    if not v.locator('h1').first.inner_text().strip(): erreurs.append('vue visiteur vide')
    if v.locator('.secbar:visible, .edbar:visible').count(): erreurs.append('outils d’édition visibles pour le visiteur')
    b.close()

print('PORTE', 'VERTE' if not erreurs else 'ROUGE')
for e in erreurs: print(' -', e)
sys.exit(1 if erreurs else 0)
