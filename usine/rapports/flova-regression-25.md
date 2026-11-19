# Banc de régression de l'assistant — 25 cas

Banc : `tests/assistant_regression.py` (mode démo, `{"demo": true, "instruction", "site"}`).
Commande : `python3 tests/assistant_regression.py --passes 2`
Limite de la démo respectée : au plus 90 appels par 10 minutes, écart mini 6,5 s entre deux appels.

## Résultat

| Passage | Date | Version en ligne | Résultat |
|---|---|---|---|
| 1 | à remplir après exécution | flovaagency.com | à remplir |
| 2 | à remplir après exécution | flovaagency.com | à remplir |

Aucune modification du code de l'assistant ni de `main` n'a été faite pour ce banc.

## Cas couverts

1. Demande mal formulée d'agence de com → agit (fait).
2. Parler aux commerçants de la rue → titre correct, espace conservée.
3. « rend le site plus fun » → agit.
4. Ajout de vues totales → portée du 30 M+ inchangée.
5. Fond en rouge → hors_champ.
6. Ajout d'un client → fait.
7. Traduction complète en anglais → aucun mot français restant.
8. Traduction complète (offres et chiffres inclus) → aucun mot français restant.
9. Chiffre modifié (16 M → 20 M) → portée inchangée.
10. Chiffre modifié (Pacha Kebab) → portée inchangée.
11. Demande vague → fait ou conseil, jamais question vague.
12. Demande vague → fait ou conseil.
13. Demande vague → fait ou conseil.
14. Masquer la section Offres → masquée.
15. Réordonner Contact après Travaux → ordre respecté.
16. Retirer un client → absent.
17. Ajouter une offre → présente.
18. Réécrire l'accroche → non vide.
19. « donne-moi 3 idées » → conseil, 3 choix applicables.
20. Photo avec adresse → adresse reprise.
21. Demande hors sujet (logo) → hors_champ.
22. Demande hors sujet (poème) → hors_champ.
23. Titre sans point final → point retiré.
24. Espace entre h1a et h1b → espace présente.
25. Ajout d'un client → fait.
