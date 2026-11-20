"""Robot du scénario de présentation de Flova, joué sur le VRAI site (production).
Scénario défini par le conseil (20/11) : connexion → ✦ Demander → modifications → annuler → vue visiteur,
sur iPhone et sur ordinateur. Garde-fou : le site est remis exactement comme avant, même en cas d'échec.

Usage : ROBOT_EMAIL=<adresse autorisée> python3 tests/scenario_presentation.py
Le code de connexion reçu par e-mail est lu dans /tmp/flova_otp.txt (déposé par le pilote, qui lit la boîte autorisée).
Captures : /tmp/scenario/<appareil>-<étape>.png. build by Uxlab.ai"""
import json, os, re, sys, time, urllib.request
from playwright.sync_api import sync_playwright

SITE = 'https://flovaagency.com'
SB = 'https://nhukbglercraslszazan.supabase.co'
KEY = 'sb_publishable_Oroyu2rpfCBnjnPxrf6GBQ_dTgkisoB'
EMAIL = os.environ.get('ROBOT_EMAIL', '')
OTP = '/tmp/flova_otp.txt'
OUT = '/tmp/scenario'; os.makedirs(OUT, exist_ok=True)
R = []

def rec(nom, ok, info=''):
    R.append((nom, ok)); print(('OK    ' if ok else 'ÉCHEC ') + nom + ((' | ' + info) if info else ''), flush=True)

def contenu():
    req = urllib.request.Request(SB + '/rest/v1/flova_content?id=eq.site&select=data', headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY})
    return json.load(urllib.request.urlopen(req, timeout=30))[0]['data']

def attendre_reponse(pg, n0, t=150):
    pg.wait_for_function(f"document.querySelectorAll('#msgs .b.in').length > {n0} && !document.querySelector('#msgs .typing')", timeout=t * 1000)
    pg.wait_for_timeout(1200)
    return pg.evaluate("[...document.querySelectorAll('#msgs .b.in')].pop().innerText")

def nin(pg): return pg.evaluate("document.querySelectorAll('#msgs .b.in').length")

def remettre(etat, original):
    """Garde-fou : republie le contenu d'origine avec la session du robot (appel direct, hors navigateur)."""
    tok = None
    for o in (etat or {}).get('origins', []):
        for it in o.get('localStorage', []):
            if it['name'] == 'flova-auth' or re.match(r'^sb-.*-auth-token$', it['name']):
                try: tok = json.loads(it['value']).get('access_token') or tok
                except Exception: pass
    if not tok: return 'pas de session'
    req = urllib.request.Request(SB + '/rest/v1/flova_content?id=eq.site', method='PATCH', data=json.dumps({'data': original}).encode(),
        headers={'apikey': KEY, 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json', 'Prefer': 'return=minimal'})
    return urllib.request.urlopen(req, timeout=30).status

def ouvrir_conversation(pg):
    if pg.locator('#tg').is_visible() and pg.evaluate("!document.querySelector('.chat').classList.contains('open')"):
        pg.click('#tg'); pg.wait_for_timeout(700)

def visiteur(p, dev, etape):
    """Ouvre le site dans une session neuve, sans connexion : ce que voit n'importe quel visiteur."""
    b = p.webkit.launch() if 'iPhone' in dev else p.chromium.launch(executable_path='/usr/bin/google-chrome')
    ctx = b.new_context(**p.devices[dev]); pg = ctx.new_page()
    pg.goto(SITE + '/?v=%d' % time.time()); pg.wait_for_timeout(3000)
    eb = pg.locator('[data-k=hero_eyebrow]').first.inner_text() + ' ‖ ' + pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()")
    pg.screenshot(path=f'{OUT}/{dev[:9].replace(" ", "")}-{etape}.png')
    ctx.close(); b.close()
    return eb

def main():
    if not EMAIL: sys.exit('ROBOT_EMAIL manquant')
    original = contenu(); print('contenu d’origine enregistré :', len(json.dumps(original)), 'caractères', flush=True)
    etat = None
    with sync_playwright() as p:
        for dev in ['iPhone 15', 'Desktop Chrome']:
            E = dev; tag = dev[:9].replace(' ', '')
            b = p.webkit.launch() if 'iPhone' in dev else p.chromium.launch(executable_path='/usr/bin/google-chrome')
            ctx = b.new_context(**p.devices[dev], **({'storage_state': etat} if etat else {})); pg = ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            try:
                # 1. le site, côté visiteur
                eb0 = visiteur(p, dev, '1-visiteur')
                rec(E + ' : site visiteur affiché', bool(eb0), eb0[:60])
                # 2. connexion (une seule fois : code par e-mail ; la session sert ensuite aux deux écrans)
                pg.goto(SITE + '/?modifier&ia=1&v=%d' % time.time()); pg.wait_for_timeout(3500)
                if not etat:
                    g = pg.locator('#lgGoogle')
                    google = g.count() and g.is_visible()
                    if google:
                        with pg.expect_navigation(timeout=20000): g.click()
                        u = pg.url; ok = 'accounts.google.com' in u and '479894952506' in u
                        rec(E + ' : « Continuer avec Google » mène à l’écran Google de Flova', ok, u[:80])
                        pg.goto(SITE + '/?modifier&ia=1&v=%d' % time.time()); pg.wait_for_timeout(3500)
                    else:
                        rec(E + ' : bouton Google visible', False, 'fournisseur Google inactif')
                    if os.path.exists(OTP): os.remove(OTP)
                    pg.fill('#lgMail', EMAIL); pg.click('#lgSend'); print('CODE_DEMANDE', flush=True)
                    t0 = time.time()
                    while not os.path.exists(OTP) and time.time() - t0 < 600: time.sleep(2)
                    code = open(OTP).read().strip() if os.path.exists(OTP) else ''
                    pg.fill('#lgCode', code); pg.click('#lgVerify'); pg.wait_for_timeout(4000)
                    etat = ctx.storage_state()
                    # le garde-fou doit fonctionner AVANT toute modification du vrai site
                    st = remettre(etat, original)
                    if st not in (200, 204):
                        rec('Garde-fou opérationnel avant modification', False, f'statut {st} : scénario arrêté, site non touché'); break
                    rec('Garde-fou opérationnel avant modification', True, f'statut {st}')
                ok = pg.locator('#edAsk').count() > 0 and pg.locator('#edAsk').is_visible()
                pg.screenshot(path=f'{OUT}/{tag}-2-connecte.png')
                rec(E + ' : connecté, barre d’édition et ✦ Demander visibles', ok)
                # 3. ✦ Demander → studio
                pg.click('#edAsk'); pg.wait_for_url(re.compile(r'/studio'), timeout=20000)
                pg.frame_locator('#ifr').locator('[data-k=hero_eyebrow]').wait_for(timeout=30000); pg.wait_for_timeout(3000)
                txt = pg.evaluate("[...document.querySelectorAll('#msgs .b.in')].map(b=>b.innerText).join(' | ')")
                pg.screenshot(path=f'{OUT}/{tag}-3-studio.png')
                rec(E + ' : ✦ Demander ouvre le studio, connecté', 'Dis-moi ce que tu veux changer' in txt, txt[:70])
                # 4. deux modifications
                n0 = nin(pg); pg.fill('#txt', 'Remplace le petit texte au-dessus du grand titre par « Démo en direct »'); pg.click('#go')
                r1 = attendre_reponse(pg, n0)
                n0 = nin(pg); pg.fill('#txt', 'Mets le fond du site en bleu nuit'); pg.click('#go')
                r2 = attendre_reponse(pg, n0)
                pg.screenshot(path=f'{OUT}/{tag}-4-modifie.png')
                c = contenu(); ok = r1.startswith('✓') and r2.startswith('✓') and c != original
                rec(E + ' : 2 modifications en ligne', ok, (r1[:40] + ' / ' + r2[:40]).replace('\n', ' '))
                # 5. vue visiteur pendant le changement
                eb1 = visiteur(p, dev, '5-visiteur-modifie')
                rec(E + ' : le visiteur voit le changement', 'Démo en direct' in eb1, eb1[:60])
                # 6. annuler (deux fois)
                for _ in range(2):
                    ouvrir_conversation(pg)
                    pg.locator('#msgs [data-undo]').last.click(); pg.wait_for_timeout(4000)
                pg.screenshot(path=f'{OUT}/{tag}-6-annule.png')
                eb2 = visiteur(p, dev, '7-visiteur-revenu')
                rec(E + ' : Annuler remet le site comme avant (vu par un visiteur : texte et couleur)', eb2 == eb0, eb2[:70])
                rec(E + ' : aucune erreur JavaScript', not errs, str(errs[:2]))
            except Exception as e:
                rec(E + ' : déroulé complet', False, str(e)[:160])
            finally:
                if contenu() != original:
                    st = remettre(etat, original); print(f'garde-fou : contenu d’origine republié à l’identique (statut {st}, identique={contenu() == original})', flush=True)
                ctx.close(); b.close()
    if contenu() != original:
        st = remettre(etat, original); ok = contenu() == original
        rec('Garde-fou final : site remis à l’identique', ok, f'statut {st}')
    print('TOTAL', sum(1 for _, o in R if o), '/', len(R), flush=True)
    return all(o for _, o in R)

if __name__ == '__main__':
    raise SystemExit(0 if main() else 1)
