# Flova — demandes du fondateur à transformer en cartes d'usine
Source : DEMANDES-FONDATEUR.md (lignes 1 à 38) et PLAN-FLOVA.md, au 24/11/2026 08 h 45. Une ligne = une carte possible. « Fait si » = preuve exigée. build by Uxlab.ai

## Offres et paiement
- F1. Offres Gratuit / Pro 15 € / Commerce 29 € TTC / Ultra Premium 99 €/mois (30 créations, retouches illimitées, 1 création offerte). Fait si : chaque offre s'active seule après paiement, testé sur iPhone. Bloqué : clé secrète Stripe du compte Flova absente.
- F2. Le client ne touche jamais Stripe : tout est pré-connecté. Fait si : inscription → paiement → offre active sans geste humain.
- F3. TVA monde : prix adaptés par pays et devise (Stripe Tax actif, TVA belge). Fait si : 3 pays testés en mode test.

## Domaine
- F4. Domaine acheté et branché en 15 min après l'inscription, payé par le client, remboursé si échec (fonction flova-domaine). Fait si : un domaine test acheté, branché, site servi en https en moins de 15 min.
- F5. Produit de l'atelier publié sur le domaine du client (PLAN A5).

## Connexion
- F6. Connexion Google pour tous (appli Google aujourd'hui en mode Test). Fait si : un compte Google quelconque se connecte. Bloqué : page /confidentialite + adresse de contact publique à choisir.

## Assistant (chat WhatsApp)
- F7. Multilingue : traduction sans écraser le français, mémoire commune (2e traduction = 0 appel). FAIT — garder au banc.
- F8. Chaque demande archivée comme une discussion WhatsApp, un agent par discussion si utile. FAIT — garder au banc.
- F9. Le chat voit l'écran et opère en direct. FAIT — garder au banc.
- F10. Ce que l'assistant ne sait pas faire est noté (hors_champ) et devient une fonction : traiter usine.flova_a_ameliorer chaque jour. Fait si : la demande la plus fréquente de la semaine est livrée.
- F11. Les clients passent avant l'usine pour les moteurs (classe client + réserve de 15 %). FAIT 24/11.

## Ultra Premium
- F12. Tous les comptes de l'inventaire (Higgsfield, ElevenLabs, Gemini, NVIDIA, Groq…) sont des fournisseurs de l'Ultra Premium ; tout nouveau compte s'y ajoute seul. Fait si : usine.fournisseurs_ultra visible et utilisé par l'atelier.
- F13. Équipe multi-moteurs : un construit, un contrôle, un fait les images (PLAN A3).
- F14. Contrôle visuel avant livraison (PLAN A6).
- F15. Appli Apple en un clic pour les clients (App Clips, règle 4.2.6).

## Liaison usine
- F16. Une demande approuvée devient une fiche usine, relue, fusionnée, en ligne, avec un mail à l'auteur, en moins d'1 h (PLAN 12-13).
- F17. Porte de bout en bout sur ineed.shopping qui refuse une version cassée (voir plan palier 1).
