import json,re
from playwright.sync_api import sync_playwright
IDX=open('/home/claude/flova-agency.github.io/index.html',encoding='utf-8').read()
with sync_playwright() as p:
  for dev in ['iPhone 15','Desktop Chrome']:
    b=p.webkit.launch() if 'iPhone' in dev else p.chromium.launch(executable_path='/usr/bin/google-chrome')
    ctx=b.new_context(**p.devices[dev]); pg=ctx.new_page(); errs=[]; hits=[]
    pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.route(re.compile(r'https://flovaagency\.com/(\?.*)?$'),lambda r: r.fulfill(status=200,content_type='text/html; charset=utf-8',body=IDX))
    def h(r):
        if r.request.method=='OPTIONS': return r.fulfill(status=200,headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'apikey, authorization, content-type','Access-Control-Allow-Methods':'POST'})
        hits.append(json.loads(r.request.post_data)['p_keys']); r.fulfill(status=204,headers={'Access-Control-Allow-Origin':'*'})
    pg.route('**/rest/v1/rpc/flova_hit',h)
    pg.goto('https://flovaagency.com/?visite=test'); pg.wait_for_timeout(2500)
    for y in range(0,9000,700): pg.evaluate("scrollBy(0,700)"); pg.wait_for_timeout(300)
    pg.wait_for_timeout(1500); pg.wait_for_timeout(15500)
    pg.reload(); pg.wait_for_timeout(2500)
    first=hits[0] if hits else []; secs=[k for hh in hits for k in hh if k.startswith('s_')]
    nv=sum(1 for hh in hits for k in hh if k=='v')
    print(dev,'1re visite:',first,'| sections:',len(secs),'| visites comptées:',nv,'| erreurs:',errs[:2])
    print('OK' if first[:1]==['v'] and len(secs)>=6 and nv==1 and not errs else 'ÉCHEC')
    ctx.close(); b.close()
