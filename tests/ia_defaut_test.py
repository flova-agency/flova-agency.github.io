import sys; sys.path.insert(0,"/home/claude/qa"); import mockauth
from playwright.sync_api import sync_playwright
IDX=open('/home/claude/flova-agency.github.io/index.html',encoding='utf-8').read()
R=[]
def rec(t,ok,d=''): R.append(ok); print(('OK   ' if ok else 'ÉCHEC'),t,'|',d,flush=True)
def page(p,dev,auth):
    b=p.webkit.launch() if 'iPhone' in dev else p.chromium.launch(executable_path='/usr/bin/google-chrome')
    kw=dict(**p.devices[dev]); 
    if auth: kw['storage_state']='/home/claude/qa/fake.json'
    ctx=b.new_context(**kw); pg=ctx.new_page()
    if auth: mockauth.install(pg)
    pg.route(lambda u: u.split('?')[0].rstrip('/')=='https://flovaagency.com', lambda r: r.fulfill(status=200,content_type='text/html',body=IDX))
    return b,pg
with sync_playwright() as p:
  for dev in ['iPhone 15','iPhone SE','Desktop Chrome']:
    b,pg=page(p,dev,True)
    pg.evaluate if False else None
    pg.goto('https://flovaagency.com/?modifier'); pg.evaluate("localStorage.removeItem('flova-ia')"); pg.reload(); pg.wait_for_timeout(3500)
    ia=pg.evaluate("localStorage.getItem('flova-ia')")
    vis=pg.evaluate("(()=>{const e=document.getElementById('edAsk');return !!e && !e.hidden && e.offsetParent!==null})()")
    rec(f'{dev} éditeur sans lien spécial : ✦ Demander visible',vis,f'flova-ia={ia}')
    pg.goto('https://flovaagency.com/?modifier&ia=0'); pg.wait_for_timeout(3000)
    vis0=pg.evaluate("(()=>{const e=document.getElementById('edAsk');return !!e && !e.hidden && e.offsetParent!==null})()")
    rec(f'{dev} ?ia=0 masque',not vis0)
    b.close()
    b,pg=page(p,dev,False)
    pg.goto('https://flovaagency.com/'); pg.wait_for_timeout(2500)
    v=pg.evaluate("(()=>{const e=document.getElementById('edAsk');return !!e && e.offsetParent!==null})()")
    rec(f'{dev} visiteur ne voit pas ✦ Demander',not v)
    b.close()
print(sum(R),'/',len(R))
