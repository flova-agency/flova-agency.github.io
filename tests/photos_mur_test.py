import sys, json; sys.path.insert(0,"/home/claude/qa"); import mockauth
from playwright.sync_api import sync_playwright
IDX=open('/home/claude/flova-agency.github.io/index.html',encoding='utf-8').read()
R=[]
def rec(t,ok,d=''): R.append(ok); print(('OK   ' if ok else 'ÉCHEC'),t,'|',d,flush=True)
H={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'}
with sync_playwright() as p:
  for dev in ['iPhone 15','iPhone SE','Desktop Chrome']:
    b=p.webkit.launch() if 'iPhone' in dev else p.chromium.launch(executable_path='/usr/bin/google-chrome')
    ctx=b.new_context(**p.devices[dev], storage_state='/home/claude/qa/fake.json'); pg=ctx.new_page(); errs=[]; writes=[]; ups=[]
    pg.on('pageerror',lambda e: errs.append(str(e)))
    mockauth.install(pg)
    def st(r):
        if r.request.method=='OPTIONS': return r.fulfill(status=200,headers=H)
        if r.request.method=='POST': ups.append(r.request.url)
        if r.request.method!='POST': return r.continue_()
        r.fulfill(status=200,content_type='application/json',body=json.dumps({'Key':'flova/x.jpg','Id':'1'}),headers=H)
    pg.route(lambda u: '/storage/v1/object/' in u, st)
    def rest(r):
        if r.request.method in ('GET','HEAD'): return r.continue_()
        if r.request.method=='OPTIONS': return r.fulfill(status=200,headers=H)
        writes.append((r.request.url, r.request.post_data)); r.fulfill(status=201,content_type='application/json',body='[]',headers=H)
    pg.route(lambda u: '/rest/v1/' in u and 'flova_is_editor' not in u, rest)
    pg.route(lambda u: u.split('?')[0].rstrip('/')=='https://flovaagency.com', lambda r: r.fulfill(status=200,content_type='text/html',body=IDX))
    pg.goto('https://flovaagency.com/?modifier'); pg.wait_for_timeout(3500)
    btn=pg.locator('[data-act=mpick]')
    rec(f'{dev} bouton « Remplacer toutes les photos » visible', btn.is_visible())
    with pg.expect_file_chooser() as fc: btn.click()
    fc.value.set_files([f'/tmp/ph{i}.jpg' for i in range(4)])
    for _ in range(60):
        if any('flova_content' in w[0] for w in writes) and len(ups)>=4: break
        pg.wait_for_timeout(500)
    pg.wait_for_timeout(1500)
    imgs=pg.evaluate("[...document.querySelectorAll('#t1 img,#t2 img,#t3 img')].map(i=>i.getAttribute('src'))")
    old=[i for i in imgs if '/img/' in (i or '') or (i or '').startswith('img/')]
    rec(f'{dev} 4 photos envoyées', len(ups)==4, len(ups))
    rec(f'{dev} le mur n’affiche plus les anciennes photos', len(imgs)>0 and not old, f'{len(imgs)} images, anciennes={len(old)}')
    saved=[w for w in writes if 'flova_content' in w[0]]
    ok=bool(saved) and all(('media/' in (saved[-1][1] or '')) for _ in [0])
    rec(f'{dev} enregistré dans le site', ok, saved[-1][0][-60:] if saved else 'aucune écriture')
    rec(f'{dev} aucune erreur', not errs, errs[:2])
    pg.screenshot(path=f'/tmp/mur-{dev.replace(" ","")}.png')
    b.close()
print(sum(R),'/',len(R))
