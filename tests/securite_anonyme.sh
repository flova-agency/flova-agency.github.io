#!/bin/sh
# Vérifie qu'un visiteur anonyme ne peut ni lire ni écrire les tables privées de Flova.
# Lecture publique attendue : flova_content (le site doit s'afficher). Tout le reste : refusé ou vide.
K=sb_publishable_Oroyu2rpfCBnjnPxrf6GBQ_dTgkisoB
U=https://nhukbglercraslszazan.supabase.co/rest/v1
ok=0; ko=0
t() { if [ "$2" = "$3" ]; then echo "OK    $1"; ok=$((ok+1)); else echo "FAILLE $1 (obtenu: $2, attendu: $3)"; ko=$((ko+1)); fi; }
for tb in flova_history flova_requests flova_settings flova_ai_usage flova_editors flova_visits flova_messages; do
  r=$(curl -s "$U/$tb?select=*&limit=1" -H "apikey: $K" -H "Authorization: Bearer $K")
  case "$r" in "[]"|*'"code"'*) v=refus ;; *) v=lu ;; esac
  t "lecture anonyme $tb" "$v" refus
done
for tb in flova_content flova_history flova_requests flova_settings flova_ai_usage flova_editors flova_visits flova_messages; do
  c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$U/$tb" -H "apikey: $K" -H "Authorization: Bearer $K" -H 'Content-Type: application/json' -H 'Prefer: return=minimal' -d '{"id":"test-intrusion"}')
  case "$c" in 2*) v=ecrit ;; *) v=refus ;; esac
  t "écriture anonyme $tb" "$v" refus
  c=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$U/$tb?id=eq.site" -H "apikey: $K" -H "Authorization: Bearer $K" -H 'Content-Type: application/json' -H 'Prefer: return=representation' -d '{}')
done
r=$(curl -s -X PATCH "$U/flova_content?id=eq.site" -H "apikey: $K" -H "Authorization: Bearer $K" -H 'Content-Type: application/json' -H 'Prefer: return=representation' -d '{"data":{}}')
case "$r" in "[]"|*'"code"'*) v=refus ;; *) v=modifie ;; esac
t "modification anonyme du site" "$v" refus
for f in flova_requests_list flova_ai_summary; do
  r=$(curl -s -X POST "$U/rpc/$f" -H "apikey: $K" -H "Authorization: Bearer $K" -H 'Content-Type: application/json' -d '{}')
  case "$r" in "[]"|*'"code"'*|*'refus'*|*'denied'*|null) v=refus ;; *) v=lu ;; esac
  t "fonction $f en anonyme" "$v" refus
done
c=$(curl -s "$U/flova_content?select=id&limit=1" -H "apikey: $K" -H "Authorization: Bearer $K")
echo "info  lecture publique flova_content : $c"
# 20/11 : messages et visites — modifier, marquer lu ou gonfler un compteur arbitraire doit être refusé
r=$(curl -s -X PATCH "$U/flova_messages?id=gt.0" -H "apikey: $K" -H "Authorization: Bearer $K" -H 'Content-Type: application/json' -H 'Prefer: return=representation' -d '{"lu":true}')
case "$r" in "[]"|*'"code"'*) v=refus ;; *) v=modifie ;; esac
t "marquer lus les messages en anonyme" "$v" refus
c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$U/rpc/flova_hit" -H "apikey: $K" -H "Authorization: Bearer $K" -H 'Content-Type: application/json' -d '{"p_keys":["a","b","c","d","e","f","g","h","i"]}')
r=$(curl -s "$U/rpc/flova_hit" -X POST -H "apikey: $K" -H "Authorization: Bearer $K" -H 'Content-Type: application/json' -d '{"p_keys":["DROP TABLE x"]}' -w '%{http_code}')
case "$r" in 204|200|"") v=ignore ;; *) v=$r ;; esac
t "compteur : clé invalide ignorée sans écriture" "$v" ignore
echo "TOTAL $ok OK, $ko FAILLE(S)"; [ $ko -eq 0 ]
