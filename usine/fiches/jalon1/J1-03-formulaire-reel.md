# J1-03-formulaire-reel
Nature : construction
Produit : Flova (ineed.shopping)
Dépôts : flova-agency/flova-agency.github.io (supabase/functions/ineed-atelier, flova-assistant ; tests/) et Elbakr/ineed-shopping (atelier/)
Reutilise : Resend Flova existant, flova-demande (modèle d'envoi)
A faire : Le formulaire contact/réservation des sites générés envoie vraiment le message au créateur : point d'entrée ineed-atelier action message_site (nom du site, champs), courriel via RESEND_API_KEY existant vers l'e-mail du compte créateur, limite 20/heure/site.
Preuve : Message envoyé depuis <nom>.ineed.shopping arrive dans la boîte du créateur (capture).
Interdit : clé ou secret dans le code ou la fiche ; mise en production hors porte verte ; suppression de données.
Durée visée : ≤ 2 h
build by Uxlab.ai
