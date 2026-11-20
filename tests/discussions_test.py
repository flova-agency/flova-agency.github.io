"""Discussions façon WhatsApp : chaque demande est gardée, la mémoire de la discussion part avec la demande suivante,
la liste « Mes demandes » rouvre une discussion et la continue. iPhone 15, iPhone SE, ordinateur."""
import sys; sys.path.insert(0, "/home/claude/qa"); import mockauth
import json, re, datetime as D
from playwright.sync_api import sync_playwright
R = []
def rec(t, ok, d=''): R.append(ok); print(('OK   ' if ok else 'ÉCHEC'), t, '|', str(d)[:160], flush=True)
F = {'studio': open('/home/claude/flova-agency.github.io/studio.html', encoding='utf-8').read(), 'idx': open('/home/claude/flova-agency.github.io/index.html', encoding='utf-8').read()}
H = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept-profile, content-profile, prefer, x-supabase-api-version', 'Access-Control-Allow-Methods': 'GET,POST,PATCH', 'Access-Control-Expose-Headers': 'Content-Range'}
with sync_playwright() as p:
  for dev in ['iPhone 15', 'iPhone SE', 'Desktop Chrome']:
    T, M, bodies = [], [], []
    b = p.webkit.launch() if 'iPhone' in dev else p.chromium.launch(executable_path='/usr/bin/google-chrome')
    ctx = b.new_context(**p.devices[dev], storage_state='/home/claude/qa/fake.json'); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    def h(r):
      u = r.request.url
      if re.match(r'https://flovaagency\.com/studio', u): return r.fulfill(status=200, content_type='text/html; charset=utf-8', body=F['studio'])
      if re.match(r'https://flovaagency\.com/(\?|$)', u): return r.fulfill(status=200, content_type='text/html; charset=utf-8', body=F['idx'])
      r.continue_()
    pg.route('https://flovaagency.com/**', h)
    def ia(r):
      if r.request.method == 'OPTIONS': return r.fulfill(status=200, headers=H)
      bd = json.loads(r.request.post_data or '{}'); bodies.append(bd)
      rep = {'type': 'question', 'count': 0, 'resume': 'Quel titre veux-tu exactement ?'} if len(bodies) == 1 else {'type': 'question', 'count': 0, 'resume': 'Bien noté, je garde cette idée.'}
      r.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(rep))
    mockauth.install(pg, assistant=False)
    pg.route(lambda u: u.endswith('/functions/v1/flova-assistant'), ia)
    def thr(r):
      m = r.request.method
      if m == 'OPTIONS': return r.fulfill(status=200, headers=H)
      if m == 'POST':
        d = json.loads(r.request.post_data); row = {'id': len(T) + 1, 'titre': d['titre'], 'statut': 'en_cours', 'last_at': D.datetime.now(D.timezone.utc).isoformat(), 'n': 0, 'by': 'test@exemple.com'}; T.append(row)
        return r.fulfill(status=201, content_type='application/json', headers=H, body=json.dumps(row))
      if m == 'PATCH':
        i = int(re.search(r'id=eq\.(\d+)', r.request.url).group(1)); T[i - 1].update(json.loads(r.request.post_data)); return r.fulfill(status=204, headers=H)
      for t in T: t['n'] = sum(1 for x in M if x['thread_id'] == t['id'])
      r.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(list(reversed(T))))
    pg.route('**/rest/v1/flova_threads*', thr)
    def msg(r):
      m = r.request.method
      if m == 'OPTIONS': return r.fulfill(status=200, headers=H)
      if m == 'POST':
        d = json.loads(r.request.post_data); d['at'] = D.datetime.now(D.timezone.utc).isoformat(); M.append(d); return r.fulfill(status=201, headers=H)
      i = int(re.search(r'thread_id=eq\.(\d+)', r.request.url).group(1))
      r.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps([x for x in M if x['thread_id'] == i]))
    pg.route('**/rest/v1/flova_thread_msgs*', msg)
    pg.goto('https://flovaagency.com/studio'); pg.wait_for_timeout(4500)
    def send(t):
      n = pg.evaluate("document.querySelectorAll('#msgs .b.in').length")
      pg.fill('#txt', t); pg.click('#go')
      pg.wait_for_function(f"document.querySelectorAll('#msgs .b.in').length > {n} && !document.querySelector('#msgs .typing')", timeout=20000); pg.wait_for_timeout(900)
    send('Change le grand titre')
    rec(f'{dev} : la demande crée une discussion titrée', len(T) == 1 and T[0]['titre'] == 'Change le grand titre', T)
    rec(f'{dev} : question et réponse gardées', [x['side'] for x in M] == ['out', 'in'] and 'Quel titre' in M[1]['texte'], M)
    rec(f'{dev} : statut « question » enregistré', T[0]['statut'] == 'question', T[0]['statut'])
    send('Mets Bienvenue chez Flova')
    rec(f'{dev} : la précision reste dans la même discussion', len(T) == 1 and len(M) == 4, (len(T), len(M)))
    cx = bodies[1].get('contexte') or []
    rec(f'{dev} : l\'assistant reçoit la mémoire de la discussion', len(cx) == 2 and cx[0]['side'] == 'out' and 'grand titre' in cx[0]['texte'] and 'Quel titre' in cx[1]['texte'], cx)
    rec(f'{dev} : la première demande part sans mémoire', bodies[0].get('contexte') == [], bodies[0].get('contexte'))
    pg.click('#chips [data-fils]'); pg.wait_for_selector('.fils [data-t]', timeout=8000)
    li = pg.inner_text('.fils')
    rec(f'{dev} : « Mes demandes » liste la discussion', 'Change le grand titre' in li and '4 messages' in li, li)
    bb = pg.eval_on_selector('.fils [data-t]', 'e => e.getBoundingClientRect().height')
    rec(f'{dev} : ligne facile à toucher (≥ 44 px)', bb >= 44, bb)
    pg.click('.fils [data-t]'); pg.wait_for_timeout(1200)
    txts = pg.evaluate("[...document.querySelectorAll('#msgs .b')].map(x=>x.className+'|'+x.innerText)")
    rec(f'{dev} : la discussion rouverte montre les 4 bulles', sum(1 for t in txts if 'fh' not in t.split('|')[0]) == 4 and any('Bienvenue chez Flova' in t for t in txts), txts)
    send('Et ajoute un sous-titre')
    cx = bodies[2].get('contexte') or []
    rec(f'{dev} : on continue la discussion rouverte, avec sa mémoire', len(T) == 1 and len(cx) == 4 and len(M) == 6, (len(T), len(cx), len(M)))
    pg.click('#chips button:has-text("Ajoute une FAQ")'); pg.wait_for_function("!document.querySelector('#msgs .typing')", timeout=20000); pg.wait_for_timeout(900)
    rec(f'{dev} : une bulle-raccourci ouvre une nouvelle discussion', len(T) == 2 and T[1]['titre'].endswith('Ajoute une FAQ') and bodies[3].get('contexte') == [], [t['titre'] for t in T])
    rec(f'{dev} : aucune erreur de page', not errs, errs[:2])
    b.close()
print(sum(R), '/', len(R))
