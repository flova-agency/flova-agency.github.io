import json
def install(pg, writes=None, assistant=None):
    pg.route(lambda u: '/auth/v1/logout' in u, lambda r: r.fulfill(status=204, headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info'}))
    pg.route(lambda u: 'flova_is_editor' in u, lambda r: r.fulfill(status=200, content_type='application/json', body='true', headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, accept-profile, content-profile, prefer, x-supabase-api-version'}))
    pg.route(lambda u: u.split('?')[0].endswith('/auth/v1/user'), lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps({'id':'00000000-0000-0000-0000-000000000001','email':'test@exemple.com','aud':'authenticated','role':'authenticated'}), headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, accept-profile, content-profile, prefer, x-supabase-api-version'}))
    def fwd(r):
        # le studio appelle l'assistant avec la session : on rejoue la même demande en mode démo (même serveur, sans écriture)
        import urllib.request
        bd=json.loads(r.request.post_data or '{}'); bd['demo']=True
        req=urllib.request.Request('https://nhukbglercraslszazan.supabase.co/functions/v1/flova-assistant',data=json.dumps(bd).encode(),headers={'Content-Type':'application/json','apikey':'sb_publishable_Oroyu2rpfCBnjnPxrf6GBQ_dTgkisoB','Authorization':'Bearer sb_publishable_Oroyu2rpfCBnjnPxrf6GBQ_dTgkisoB'})
        try: body=urllib.request.urlopen(req,timeout=200).read(); st=200
        except Exception as e: body=e.read() if hasattr(e,'read') else b'{}'; st=getattr(e,'code',500)
        r.fulfill(status=st, content_type='application/json', body=body, headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, accept-profile, content-profile, prefer, x-supabase-api-version'})
    if assistant is None: pg.route(lambda u: u.endswith('/functions/v1/flova-assistant'), fwd)
