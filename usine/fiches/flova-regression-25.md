# Banc de régression de l'assistant élargi à 25 cas

## Pourquoi
L'assistant Flova (supabase/functions/flova-assistant) doit être fiable avant d'être activé pour Fukay. Le banc actuel (tests/assistant_regression.py) n'a que 6 cas.

## À faire
1. Lire tests/assistant_regression.py et garder son format (appel en mode démo, `{"demo": true, "instruction", "site"}`, contrôle du `type` et du contenu renvoyé).
2. Ajouter 19 cas au moins : traduction complète en anglais (aucun mot français restant dans `t` et `L`), portée d'un chiffre inchangée, 3 demandes vagues (type fait ou conseil, jamais question vague), masquer une section, réordonner, retirer un client, ajouter une offre, réécrire l'accroche, « donne-moi 3 idées » (type conseil, 3 choix applicables sans info manquante), photo envoyée avec adresse, demande hors sujet (hors_champ), titre sans point final, espace entre h1a et h1b.
3. Espacer les appels (au plus 100 par 10 minutes, limite de la démo).
4. Écrire usine/rapports/flova-regression-25.md avec le résultat de deux passages complets.

## Critère de fait
25/25 deux fois de suite sur la version en ligne, aucune modification du code de l'assistant ni de main.
