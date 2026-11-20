import time
from playwright.sync_api import sync_playwright
R=[]
with sync_playwright() as p:
  for dev in ['iPhone SE','Desktop Chrome']:
    b=p.webkit.launch() if 'iPhone' in dev else p.chromium.launch(executable_path='/usr/bin/google-chrome')
    ctx=b.new_context(**p.devices[dev]); pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.goto('https://flovaagency.com/demo?v=%d'%time.time()); pg.wait_for_timeout(2500)
    try: pg.click('#skip',timeout=3000)
    except Exception: pass
    pg.wait_for_timeout(2500)
    n0=pg.evaluate("document.querySelectorAll('#msgs .b.in').length")
    pg.locator('#chips button',has_text='3 styles').click()
    pg.wait_for_function(f"document.querySelectorAll('#msgs .b.in').length > {n0} && !document.querySelector('#msgs .typing')",timeout=120000); pg.wait_for_timeout(1500)
    bg=lambda: pg.frame_locator('#ifr').locator('body').evaluate("()=>getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()")
    nc=pg.locator('#msgs .sty .c').count(); b1=bg()
    pg.locator('#msgs .sty .c').nth(1).click(); pg.wait_for_timeout(1200); b2=bg()
    bar=pg.locator('#stybar.on').count()
    if bar: pg.screenshot(path=f'/tmp/demo_sty_{dev[:6]}.png'); pg.locator('#stybar .k').click()
    else:
        try: pg.click('#ch',timeout=1500)
        except Exception: pass
        pg.wait_for_timeout(600); pg.locator('#msgs .styk .k').click()
    pg.wait_for_timeout(1200)
    last=pg.evaluate("[...document.querySelectorAll('#msgs .b.in')].pop().innerText")
    ok=nc==3 and b1!=b2 and last.startswith('✓') and bg()==b2 and not errs and (bar==1 if 'iPhone' in dev else True)
    R.append(ok); print('OK   ' if ok else 'ÉCHEC',dev,f'cartes={nc} {b1}→{b2} barre={bar}',last[:50].replace('\n',' '),errs[:1])
    ctx.close(); b.close()
print('TOTAL',sum(R),'/',len(R))
