import sys; sys.path.insert(0,"/home/claude/qa"); import mockauth
from playwright.sync_api import sync_playwright
IDX=open('/home/claude/flova-agency.github.io/index.html',encoding='utf-8').read()
H={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'}
R=[]
def rec(t,ok,d=''): R.append(ok); print(('OK   ' if ok else 'ÉCHEC'),t,'|',d,flush=True)
with sync_playwright() as p:
  for dev in ['iPhone 15','iPhone SE','Desktop Chrome']:
    for owner in [False,True]:
      b=p.webkit.launch() if 'iPhone' in dev else p.chromium.launch(executable_path='/usr/bin/google-chrome')
      ctx=b.new_context(**p.devices[dev], storage_state='/home/claude/qa/fake.json'); pg=ctx.new_page(); errs=[]
      pg.on('pageerror',lambda e: errs.append(str(e)))
      mockauth.install(pg)
      pg.route(lambda u: 'flova_is_owner' in u, lambda r: r.fulfill(status=200,content_type='application/json',body='true' if owner else 'false',headers=H))
      pg.route(lambda u: u.split('?')[0].rstrip('/')=='https://flovaagency.com', lambda r: r.fulfill(status=200,content_type='text/html',body=IDX))
      pg.goto('https://flovaagency.com/?modifier'); pg.wait_for_timeout(3500)
      vis=pg.evaluate("!document.getElementById('edUse').hidden")
      ask=pg.evaluate("!document.getElementById('edAsk').hidden")
      rec(f'{dev} {"propriétaire" if owner else "client"} : Consommation IA {"visible" if owner else "cachée"}', vis==owner, f'visible={vis}')
      rec(f'{dev} {"propriétaire" if owner else "client"} : ✦ Demander toujours là, sans erreur', ask and not errs, errs[:1])
      b.close()
print(sum(R),'/',len(R))
