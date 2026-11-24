# J1-11-porte-atelier
Nature : controle
Produit : Flova (ineed.shopping)
Dépôts : flova-agency/flova-agency.github.io (supabase/functions/ineed-atelier, flova-assistant ; tests/) et Elbakr/ineed-shopping (atelier/)
Reutilise : tests/porte.py, fab.py
A faire : Étendre tests/porte.py à l'atelier : création robot complète (lien_robot), livraison, page /p/<nom> 200, aucune erreur JS ; budget ≤ 0,10 $ par passage, seulement si ineed-atelier a changé.
Preuve : Workflow vert avec l'étape atelier ; rouge simulé = retour arrière.
Interdit : clé ou secret dans le code ou la fiche ; mise en production hors porte verte ; suppression de données.
Durée visée : ≤ 2 h
build by Uxlab.ai
