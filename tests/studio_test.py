import sys; sys.path.insert(0,"/home/claude/qa"); import mockauth
import time,re,json
from playwright.sync_api import sync_playwright
R=[]
def rec(t,ok,d=''): R.append(ok); print(('OK   ' if ok else 'ÉCHEC'),t,'|',str(d)[:150],flush=True)
F={'studio':open('/home/claude/flova-agency.github.io/studio.html',encoding='utf-8').read(),'idx':open('/home/claude/flova-agency.github.io/index.html',encoding='utf-8').read()}
writes=[]
def nin(pg): return pg.evaluate("document.querySelectorAll('#msgs .b.in').length")
def wait(pg,n0,t=150000): pg.wait_for_function(f"document.querySelectorAll('#msgs .b.in').length > {n0} && !document.querySelector('#msgs .typing')",timeout=t); pg.wait_for_timeout(1500)
def last(pg): return pg.evaluate("[...document.querySelectorAll('#msgs .b.in')].pop().innerText")
with sync_playwright() as p:
  for dev in ['iPhone 15','iPhone SE','Desktop Chrome']:
    b=p.webkit.launch() if 'iPhone' in dev else p.chromium.launch(executable_path='/usr/bin/google-chrome')
    ctx=b.new_context(**p.devices[dev], storage_state='/home/claude/qa/fake.json'); pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e: errs.append(str(e)))
    def h(r):
        u=r.request.url; m=r.request.method
        if re.match(r'https://flovaagency\.com/studio',u): return r.fulfill(status=200,content_type='text/html; charset=utf-8',body=F['studio'])
        if re.match(r'https://flovaagency\.com/(\?|$)',u): return r.fulfill(status=200,content_type='text/html; charset=utf-8',body=F['idx'])
        r.continue_()
    pg.route('https://flovaagency.com/**',h); mockauth.install(pg)
    def w(r):
        if r.request.method in ('POST','PATCH'):
            writes.append(r.request.method); return r.fulfill(status=201,content_type='application/json',body='[]')
        r.continue_()
    pg.route('**/rest/v1/flova_content*',w)
    import datetime as _d
    H=[{'id':900+i,'at':(_d.datetime.utcnow()-_d.timedelta(hours=i*5)).isoformat()+'Z','by':'elbazikarim@gmail.com' if i<3 else None} for i in range(4)]
    pg.route('**/rest/v1/flova_history*',lambda r: r.fulfill(status=200,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps(H)) if r.request.method=='GET' else r.continue_())
    restores=[]
    def rs(r):
        if r.request.method=='OPTIONS': return r.fulfill(status=200,headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, accept-profile, content-profile, prefer','Access-Control-Allow-Methods':'POST'})
        restores.append(r.request.post_data); r.fulfill(status=200,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body='{}')
    pg.route('**/rest/v1/rpc/flova_restore*',rs)
    VI=[{'day':(_d.date.today()-_d.timedelta(days=i)).isoformat(),'k':k,'n':n} for i in range(14) for k,n in [('v',5+i*2%9),('tel',4+i%3),('ord',1+i%2),('src_google',2),('src_instagram',1+i%4),('s_hero',5),('s_travaux',3+i%3),('s_offres',2),('s_contact',1),('l_fr',4),('l_nl',1)]]
    MS=[{'id':2,'at':(_d.datetime.now(_d.timezone.utc)-_d.timedelta(minutes=20)).isoformat(),'nom':'Sara B.','entreprise':'Pâtisserie Lina','email':'sara@exemple.com','tel':'0470 12 34 56','message':'Secteur : Restauration\nOffre : Pro\n\nOn ouvre une 2e boutique en mars.','lu':False},{'id':1,'at':(_d.datetime.now(_d.timezone.utc)-_d.timedelta(days=1)).isoformat(),'nom':'Yassine','entreprise':'','email':'y@exemple.com','tel':'','message':'Bonjour, vos tarifs ?','lu':True}]
    marks=[]
    def mm(r):
        hd={'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'Content-Range','Content-Range':'0-0/1'}
        if r.request.method=='HEAD': return r.fulfill(status=200,headers=hd)
        if r.request.method=='PATCH': marks.append(r.request.url); return r.fulfill(status=204,headers=hd)
        if r.request.method=='GET': return r.fulfill(status=200,content_type='application/json',headers=hd,body=json.dumps(MS))
        r.continue_()
    pg.route('**/rest/v1/flova_messages*',mm)
    pg.route('**/rest/v1/flova_visits*',lambda r: r.fulfill(status=200,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps(VI)) if r.request.method=='GET' else r.continue_())
    pg.route('**/storage/v1/object/flova/**',lambda r: r.fulfill(status=200,content_type='application/json',body='{"Key":"flova/media/x.jpg"}'))
    E=dev
    pg.goto('https://flovaagency.com/studio'); pg.wait_for_timeout(5000)
    rec(E+' accueil connecté', 'Dis-moi ce que tu veux changer' in last(pg), last(pg))
    rec(E+' pas de débordement', not pg.evaluate("document.documentElement.scrollWidth>innerWidth"))
    pg.screenshot(path=f'/tmp/studio_{dev[:6]}_1.png')
    n0=nin(pg); nw=len(writes); pg.fill('#txt','Ajoute un client : Boulangerie Saïd'); pg.click('#go'); wait(pg,n0)
    ok=last(pg).startswith('✓') and 'Boulangerie' in pg.frame_locator('#ifr').locator('#marq').inner_text()
    rec(E+' modification appliquée et enregistrée', ok and len(writes)>nw, last(pg)[:100]+f' writes={len(writes)-nw}')
    rec(E+' 3 idées suivantes', pg.locator('#msgs .qr').last.locator('button').count()==3, pg.locator('#msgs .qr').last.inner_text().replace('\n',' | ') if pg.locator('#msgs .qr').count() else 'aucune')
    pg.screenshot(path=f'/tmp/studio_{dev[:6]}_2.png')
    pg.click('#ch'); pg.wait_for_timeout(600); nw=len(writes)
    n0=nin(pg); pg.locator('#msgs [data-undo]').last.click(); pg.wait_for_timeout(2500)
    rec(E+' annuler enregistré', 'revenu' in last(pg) and 'Boulangerie' not in pg.frame_locator('#ifr').locator('#marq').inner_text() and len(writes)>nw, last(pg))
    n0=nin(pg); pg.fill('#txt','Ajoute une boutique en ligne avec paiement'); pg.click('#go'); wait(pg,n0)
    rec(E+' hors champ + bouton Uxlab', pg.locator('#msgs .ux').count()>0, last(pg)[:100])
    pg.screenshot(path=f'/tmp/studio_{dev[:6]}_3.png')
    n0=nin(pg); pg.locator('#chips button',has_text='Analyse mon site').click(); wait(pg,n0); pg.wait_for_timeout(1500)
    a=pg.locator('#msgs .aud').last
    ok=a.count()>0 and pg.locator('#msgs .crit').last.locator('.gauge').count()==5 and pg.locator('#msgs .fixall').count()>0
    rec(E+' analyse : note, 5 critères, tout corriger', ok, last(pg)[:120])
    if not pg.evaluate("matchMedia('(max-width:860px)').matches") or True:
        try: pg.evaluate("document.querySelector('#msgs .aud').scrollIntoView({block:'start'})")
        except Exception: pass
    pg.screenshot(path=f'/tmp/studio_{dev[:6]}_audit.png')
    n0=nin(pg); pg.locator('#chips button',has_text='3 styles').click(); wait(pg,n0); pg.wait_for_timeout(1200)
    bg=lambda: pg.frame_locator('#ifr').locator('body').evaluate("()=>getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()")
    nc=pg.locator('#msgs .sty').last.locator('.c').count(); b1=bg()
    pg.evaluate("[...document.querySelectorAll('#msgs .sty')].pop().scrollIntoView({block:'start'})"); pg.screenshot(path=f'/tmp/studio_{dev[:6]}_styles.png')
    pg.locator('#msgs .sty').last.locator('.c').nth(1).click(); pg.wait_for_timeout(1200); b2=bg(); pg.screenshot(path=f'/tmp/studio_{dev[:6]}_styles2.png')
    if pg.evaluate("getComputedStyle(document.querySelector('.chat')).getPropertyValue('--x')") is not None: pass
    try: pg.click('#ch',timeout=2000)
    except Exception: pass
    pg.wait_for_timeout(700); nw=len(writes); pg.locator('#msgs .styk .k').last.click(); pg.wait_for_timeout(3000)
    rec(E+' 3 styles : aperçu puis garder', nc==3 and b1!=b2 and len(writes)>nw and 'style' in last(pg), f'cartes={nc} fond {b1}→{b2} | '+last(pg)[:60])
    badge=pg.locator('#chips [data-msgs] em').inner_text() if pg.locator('#chips [data-msgs] em').count() else ''
    n0=nin(pg); pg.locator('#chips [data-msgs]').click(); pg.wait_for_timeout(2500)
    rec(E+' messages : pastille, liste, répondre, marqués lus', badge=='1' and pg.locator('#msgs .msg').count()>=2 and pg.locator('#msgs .msg.nv a[href^="mailto:sara"]').count()==1 and pg.locator('#msgs .msg.nv a[href^="https://wa.me/32470"]').count()==1 and len(marks)>=1, f'pastille={badge} marqués={len(marks)}')
    pg.evaluate("[...document.querySelectorAll('#msgs .msg')].pop().closest('.b').scrollIntoView({block:'start'})"); pg.wait_for_timeout(500); pg.screenshot(path=f'/tmp/studio_{dev[:6]}_msgs.png')
    n0=nin(pg); pg.locator('#chips button',has_text='Mes visites').click(); pg.wait_for_timeout(2500)
    rec(E+' visites : chiffres, courbe 14 jours, sections', pg.locator('#msgs .kpi').count()>0 and pg.locator('#msgs .spark i').last.evaluate("e=>e.parentNode.children.length")==14 and 'Travaux' in last(pg), last(pg)[:100].replace('\n',' '))
    pg.evaluate("[...document.querySelectorAll('#msgs .kpi')].pop().closest('.b').scrollIntoView({block:'start'})"); pg.wait_for_timeout(800); pg.screenshot(path=f'/tmp/studio_{dev[:6]}_stats.png')
    n0=nin(pg); pg.locator('#chips button',has_text='Mes versions').click(); pg.wait_for_timeout(2500)
    rec(E+' versions listées', pg.locator('#msgs .vers').last.locator('[data-v]').count()==4, last(pg)[:90])
    pg.screenshot(path=f'/tmp/studio_{dev[:6]}_vers.png')
    n0=nin(pg); pg.locator('#msgs .vers').last.locator('[data-v]').nth(2).click(); pg.wait_for_timeout(5000)
    rec(E+' revenir à une version', len(restores)==1 and '902' in (restores[0] or '') and 'revenu comme il était' in last(pg), last(pg)[:90])
    n0=nin(pg); pg.locator('#chips button',has_text='Partager mon site').click(); pg.wait_for_timeout(3500)
    dark=pg.evaluate("(()=>{const c=[...document.querySelectorAll('#msgs .qrw canvas')].pop(); if(!c) return 0; const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; for(let i=0;i<d.length;i+=4) if(d[i]<60) n++; return n})()")
    rec(E+' partage : aperçu Google + QR + WhatsApp', pg.locator('#msgs .serp').count()>0 and dark>2000 and pg.locator('#msgs .shb .wa').count()>0, f'pixels QR={dark}')
    pg.evaluate("[...document.querySelectorAll('#msgs .serp')].pop().scrollIntoView({block:'start'})"); pg.screenshot(path=f'/tmp/studio_{dev[:6]}_share.png')
    n0=nin(pg); pg.locator('#msgs .qr').last.locator('button').first.click(); wait(pg,n0)
    rec(E+' description Google améliorée et aperçu mis à jour', last(pg).startswith('✓') and pg.locator('#msgs .b.in').last.locator('.serp').count()==1, last(pg)[:110])
    if dev=='iPhone 15':
        with pg.expect_file_chooser() as fc: pg.click('#att')
        fc.value.set_files('/home/claude/qa/test.jpg'); pg.wait_for_timeout(2500)
        rec(E+' photo envoyée', 'Où je la mets' in last(pg), last(pg)[:80])
    if dev=='iPhone 15':
        pg.evaluate("window.__pg=false; new MutationObserver(()=>{ if(document.querySelector('#msgs .typing .pg u')) window.__pg=true; }).observe(document.getElementById('msgs'),{childList:true,subtree:true})")
        n0=nin(pg); t0=time.time(); pg.fill('#txt','Ajoute la version néerlandaise du site'); pg.click('#go')
        wait(pg,n0); dt=round(time.time()-t0,1); prog=pg.evaluate('window.__pg')
        lg=pg.frame_locator('#ifr').locator('.lgsw').first.evaluate("e=>[...e.querySelectorAll('button,option')].map(x=>x.textContent.trim()).join(' ')") if pg.frame_locator('#ifr').locator('.lgsw').count() else ''
        rec(E+' traduction : progression puis langue en ligne', prog and last(pg).startswith('✓') and ('NL' in lg.upper() or 'NED' in lg.upper()), f'{dt} s | progression={prog} | sélecteur={lg[:60]!r}')
    rec(E+' aucune erreur JS', not errs, errs[:2]); ctx.close(); b.close()
  print('TOTAL',sum(R),'/',len(R))
