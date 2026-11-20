import json,time
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome'); pg=b.new_page()
    got={}
    def h(route):
        got['b']=route.request.post_data; route.fulfill(status=200,headers={'Access-Control-Allow-Origin':'*','Content-Type':'application/json'},body='{"count":0,"type":"question","resume":"x","choix":[]}')
    pg.route(lambda u:'flova-assistant' in u, h)
    pg.goto('https://flovaagency.com/demo?v=%d'%time.time()); pg.wait_for_timeout(2500)
    try: pg.click('#skip',timeout=3000)
    except Exception: pass
    pg.wait_for_timeout(2500); pg.fill('#txt','test'); pg.keyboard.press('Enter'); pg.wait_for_timeout(3000)
    json.dump(json.loads(got['b'])['site'],open('site.json','w'),ensure_ascii=False)
    print(len(got['b'])); b.close()
