import sys; sys.path.insert(0,"/home/claude/qa"); import mockauth
from playwright.sync_api import sync_playwright
IDX=open('/home/claude/flova-agency.github.io/index.html',encoding='utf-8').read()
R=[]
def rec(t,ok,d=''): R.append(ok); print(('OK   ' if ok else 'ÉCHEC'),t,'|',d,flush=True)
with sync_playwright() as p:
  for dev in ['iPhone 15','iPhone SE','Desktop Chrome']:
    for ed in [False,True]:
      b=p.webkit.launch() if 'iPhone' in dev else p.chromium.launch(executable_path='/usr/bin/google-chrome')
      kw=dict(**p.devices[dev])
      if ed: kw['storage_state']='/home/claude/qa/fake.json'
      ctx=b.new_context(**kw); pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
      if ed: mockauth.install(pg)
      pg.route(lambda u: u.split('?')[0].rstrip('/')=='https://flovaagency.com', lambda r: r.fulfill(status=200,content_type='text/html',body=IDX))
      pg.goto('https://flovaagency.com/'+('?modifier' if ed else '')); pg.wait_for_timeout(3500)
      n=pg.evaluate("document.querySelectorAll('#L_marques .it').length")
      ov=pg.evaluate("document.documentElement.scrollWidth>innerWidth+1")
      rec(f'{dev} {"éditeur" if ed else "visiteur"} : marques affichées',n==20,f'{n} marques, débordement={ov}')
      rec(f'{dev} {"éditeur" if ed else "visiteur"} : pas de débordement ni erreur',not ov and not errs,errs[:2])
      pg.locator('#marques').scroll_into_view_if_needed(); pg.wait_for_timeout(800)
      pg.screenshot(path=f'/tmp/mq-{dev.replace(" ","")}-{"ed" if ed else "vis"}.png')
      b.close()
print(sum(R),'/',len(R))
