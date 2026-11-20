import json,re
from playwright.sync_api import sync_playwright
IDX=open('/home/claude/flova-agency.github.io/index.html',encoding='utf-8').read()
R=[]
with sync_playwright() as p:
  for dev in ['iPhone SE','Desktop Chrome']:
    for mode in ['ok','panne']:
      b=p.webkit.launch() if 'iPhone' in dev else p.chromium.launch(executable_path='/usr/bin/google-chrome')
      ctx=b.new_context(**p.devices[dev]); pg=ctx.new_page(); errs=[]; sent=[]; nav=[]
      pg.on('pageerror',lambda e: errs.append(str(e)))
      pg.route(re.compile(r'https://flovaagency\.com/(\?.*)?$'),lambda r: r.fulfill(status=200,content_type='text/html; charset=utf-8',body=IDX))
      def h(r):
          if r.request.method=='OPTIONS': return r.fulfill(status=200,headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'apikey, authorization, content-type','Access-Control-Allow-Methods':'POST'})
          sent.append(json.loads(r.request.post_data))
          if mode=='ok': r.fulfill(status=200,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body='{"ok":true,"id":1}')
          else: r.fulfill(status=500,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body='{"error":"x"}')
      pg.route('**/functions/v1/flova-demande',h)
      pg.route(lambda u: u.startswith('mailto:'), lambda r: (nav.append(r.request.url), r.abort()))
      pg.goto('https://flovaagency.com/'); pg.wait_for_timeout(2000)
      pg.fill('#nom','Sara B.'); pg.fill('#ent','Pâtisserie Lina'); pg.fill('#mail','sara@exemple.com'); pg.fill('#msg','Deuxième boutique en mars')
      pg.locator('#f [type=submit]').click(); pg.wait_for_timeout(2500)
      how=pg.inner_text('#how')
      if mode=='ok': ok=len(sent)==1 and sent[0]['action']=='contact' and 'envoyé' in how and pg.locator('#done.sent').count()==1 and not errs
      else: ok=len(sent)==1 and 'messagerie' in how and not errs
      R.append(ok); print('OK   ' if ok else 'ÉCHEC',dev,mode,'|',how[:90],errs[:1])
      if mode=='ok': pg.locator('#done').scroll_into_view_if_needed(); pg.screenshot(path=f'/tmp/form_{dev[:6]}.png')
      ctx.close(); b.close()
print('TOTAL',sum(R),'/',len(R))
