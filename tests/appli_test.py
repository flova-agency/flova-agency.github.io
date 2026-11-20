"""Appli installable : manifestes, icônes, bulle « Mon appli » (iPhone : 2 étapes ; Android/ordinateur : installation en 1 touche),
demande App Store envoyée. iPhone 15, iPhone SE, ordinateur."""
import sys; sys.path.insert(0, "/home/claude/qa"); import mockauth
import json, re, pathlib
from playwright.sync_api import sync_playwright
R = []
def rec(t, ok, d=''): R.append(ok); print(('OK   ' if ok else 'ÉCHEC'), t, '|', str(d)[:160], flush=True)
ROOT = pathlib.Path('/home/claude/flova-agency.github.io')
H = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'}
TYPES = {'.html': 'text/html; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.js': 'text/javascript', '.jpg': 'image/jpeg'}
with sync_playwright() as p:
  for dev in ['iPhone 15', 'iPhone SE', 'Desktop Chrome']:
    b = p.webkit.launch() if 'iPhone' in dev else p.chromium.launch(executable_path='/usr/bin/google-chrome')
    ctx = b.new_context(**p.devices[dev], storage_state='/home/claude/qa/fake.json', service_workers='block'); pg = ctx.new_page(); errs = []; demandes = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    def h(r):
      path = re.sub(r'^https://flovaagency\.com', '', r.request.url).split('?')[0] or '/'
      f = ROOT / ('index.html' if path == '/' else 'studio.html' if path == '/studio' else path.lstrip('/'))
      if f.exists() and f.is_file(): return r.fulfill(status=200, content_type=TYPES.get(f.suffix, 'application/octet-stream'), body=f.read_bytes())
      r.continue_()
    pg.route('https://flovaagency.com/**', h); mockauth.install(pg)
    def dem(r):
      if r.request.method == 'OPTIONS': return r.fulfill(status=200, headers=H)
      demandes.append(json.loads(r.request.post_data or '{}')); r.fulfill(status=200, content_type='application/json', headers=H, body='{"ok":true}')
    pg.route('**/functions/v1/flova-demande', dem)
    # site public : manifeste + icône Apple
    pg.goto('https://flovaagency.com/'); pg.wait_for_timeout(2000)
    man = pg.evaluate("(async()=>{const l=document.querySelector('link[rel=manifest]');if(!l)return null;const m=await (await fetch(l.href)).json();const ok=await Promise.all(m.icons.map(async i=>(await fetch(i.src)).ok));return {name:m.name,start:m.start_url,icons:ok}})()")
    rec(f'{dev} : site installable (manifeste + icônes)', bool(man) and man['name'] == 'Flova' and all(man['icons']), man)
    rec(f'{dev} : icône écran d’accueil iPhone', pg.evaluate("(async()=>{const l=document.querySelector('link[rel=apple-touch-icon]');return !!l&&(await fetch(l.href)).ok})()"))
    # studio
    pg.goto('https://flovaagency.com/studio'); pg.wait_for_timeout(4000)
    man = pg.evaluate("(async()=>{const m=await (await fetch(document.querySelector('link[rel=manifest]').href)).json();return {start:m.start_url,scope:m.scope}})()")
    rec(f'{dev} : studio installable comme appli à part', man == {'start': '/studio', 'scope': '/studio'}, man)
    if 'Desktop' in dev:
      pg.evaluate("""(()=>{const e=new Event('beforeinstallprompt');e.prompt=()=>{window.__prompt=1};e.userChoice=Promise.resolve({outcome:'accepted'});dispatchEvent(e)})()""")
    pg.click('#chips [data-appli]'); pg.wait_for_timeout(800)
    t = pg.evaluate("[...document.querySelectorAll('#msgs .b.in')].pop().innerText")
    if 'iPhone' in dev:
      rec(f'{dev} : 2 étapes claires pour l’iPhone', 'Partager' in t and 'Sur l’écran d’accueil' in t, t)
    else:
      pg.click('.inst'); pg.wait_for_timeout(600)
      rec(f'{dev} : installation en une touche', pg.evaluate('window.__prompt') == 1 and 'installée' in pg.evaluate("[...document.querySelectorAll('#msgs .b.in')].pop().innerText"), t)
    bb = pg.eval_on_selector('.store', 'e=>e.getBoundingClientRect()')
    rec(f'{dev} : bouton App Store visible et touchable', bb['height'] >= 36 and bb['width'] <= pg.viewport_size['width'], bb)
    pg.click('.store'); pg.wait_for_timeout(800)
    rec(f'{dev} : demande App Store envoyée à Uxlab', len(demandes) == 1 and 'App Store' in demandes[0].get('instruction', '') and 'C’est noté' in pg.evaluate("[...document.querySelectorAll('#msgs .b.in')].pop().innerText"), demandes)
    over = pg.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    rec(f'{dev} : pas de débordement horizontal', not over)
    rec(f'{dev} : aucune erreur de page', not errs, errs[:2])
    b.close()
print(sum(R), '/', len(R))
