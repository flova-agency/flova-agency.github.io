# PLAN FLOVA — « le site qui obéit »

Pilote : session claude.ai Flova. Suivi : session cerveau (robot de veille sur cerveau-1).
Règle : une étape n'est cochée que si son critère « fait » a été testé, la preuve est écrite à côté et la date est indiquée.
Usine : les étapes marquées **[usine]** se fabriquent sur une branche `usine/*` uniquement. Le pilote relit, teste sur iPhone et fusionne. Jamais de travail direct sur main.
Promesse faite à Fukay le 19/11 : une mise à jour par jour pendant 7 jours, puis la version finale.

## Socle (fait)

- [x] **1. Site en ligne et modifiable à la main** — Fait si : connexion par code mail, modification d'un texte, d'une photo, d'une liste, puis annuler et historique, testé sur iPhone, petit iPhone et ordinateur. Preuve : tests Playwright du 19/11 et robot de veille 22/22 à 22 h 58.
- [x] **2. Remise à Fukay** — Fait si : mail parti depuis noreply avec les deux fiches, invitations GitHub et Supabase en attente au rôle propriétaire. Preuve : envoi accepté par Resend le 19/11 vers 22 h 4x, invitations visibles en attente le 19/11.
- [x] **3. Assistant IA (✦ Demander), caché pour Fukay** — Fait si : tests/assistant_regression.py 6/6 et démo 37/37 sur la version en ligne, boutons IA invisibles sans `?ia=1`. Preuve : 19/11 à 23 h 00.
- [x] **4. Déploiement automatique des fonctions** — Fait si : un push sur `supabase/functions/**` déploie seul. Preuve : run GitHub 44624220170 réussi, flova-assistant et flova-demande déployées le 19/11.
- [x] **5. Démo téléphone (flovaagency.com/demo)** — Fait si : le site occupe l'écran, la conversation se replie, et les 10 écrans du parcours sont capturés. Preuve : 37/37 et PDF de parcours envoyé à Karim le 19/11.
- [x] **6. Circuit « Envoyer à Uxlab »** — Fait si : demande envoyée, mail à Karim, approbation en un clic, interrupteur d'approbation automatique dans les deux sens. Preuve : tests du 19/11.

## Vers la version évoluée (J+1 à J+3)

- [ ] **6b. Connexion par Google (et Apple si possible) au lieu du code mail** — Demande de Karim du 19/11 à 23 h 30, à faire avant l'étape 7. Fait si : un toucher sur « Continuer avec Google » ouvre la session sur iPhone, petit iPhone et ordinateur, une adresse non autorisée est refusée, et le code mail reste en secours. Décision de Karim du 20/11 à 0 h : Google seulement, pas Apple. Fait : projet Google « Flova » (ancien « My First Project » renommé), client OAuth Web, fournisseur Google configuré dans Supabase avec l'identifiant, boutons dans /studio et sur le site (code mail en secours), Karim ajouté comme testeur. Reste : 1) Karim colle le code secret Google dans Supabase ; 2) test réel sur iPhone ; 3) publier l'appli Google (page de confidentialité sur flovaagency.com et branding) pour que Fukay puisse l'utiliser ; 4) ajouter dans « Accès » l'adresse Google de Fukay (sa boîte Hotmail n'est pas un compte Google).

- [ ] **7. Validation de l'IA par Karim, puis activation pour Fukay** — Fait si : Karim a dit « validé », les boutons IA sont visibles sans `?ia=1`, le test iPhone est passé et la régression est complète. Bloquant : feu vert de Karim.
- [ ] **8. Banc de régression élargi à 25 cas [usine]** — Couvre : traduction complète sans reste de français, portée des chiffres, demandes vagues, design hors champ, ordre et masquage des sections, ajout et retrait de client, accroche, idées applicables, photo envoyée, refus poli. Fait si : 25/25 deux fois de suite sur la version en ligne.
- [ ] **9. Audit de sécurité de la base** — Fait si : en anonyme, aucune lecture ni écriture possible sur flova_content, flova_history, flova_requests, flova_settings et flova_ai_usage en dehors des fonctions prévues ; une adresse non autorisée ne peut rien modifier ; aucun secret dans le dépôt ; les limites de débit sont vérifiées. Preuve : script de test d'accès versionné dans tests/.
  - 19/11, 23 h 3x : tests/securite_anonyme.sh donne 14/14 (lecture, écriture, modification du site et fonctions refusées en anonyme) ; aucun secret dans le dépôt ; fonction appelée sans clé = 401. Reste à faire : tester un compte connecté mais non autorisé, et les limites de débit.
- [x] **10. Photos par l'assistant sur le vrai site** — Fait si : depuis ✦ Demander sur iPhone, on envoie une photo et on dit « mets-la à la place de… », la photo est redimensionnée, stockée et en ligne, et « Revenir comme avant » fonctionne. Preuve : flovaagency.com/studio, envoi de photo testé sur iPhone 15 le 19/11 à 23 h 4x (stockage simulé pour le test, à confirmer en réel par Karim).
- [x] **11. ✦ Demander en mode conversation sur le vrai site** — Même expérience que la démo : fil de messages, choix à toucher, avant/après. Fait si : parcours iPhone capturé et validé par Karim. Preuve : page /studio, tests 19/19 sur iPhone 15, iPhone SE et ordinateur le 19/11 (connexion, modification enregistrée, annuler enregistré, hors champ avec envoi à Uxlab, photo). Reste : validation de Karim.

## Version évoluée (nuit du 19 au 20/11, objectif produit fini à 10 h)

- [x] **17. Site multilingue** — Le français reste la base, chaque langue est stockée à côté, et les visiteurs ont un sélecteur (boutons sur ordinateur, menu compact sur téléphone). La traduction est faite par le serveur en appels parallèles. Preuve : test en direct, anglais ajouté en environ 25 s ; titre FR « Nous créons l'attention. », EN « We make people stop scrolling. ».
- [x] **18. Ambiances, polices et couleurs par l'assistant** — Luxe, street, minimal, chaleureux, tech, clair. La lisibilité est garantie par le serveur, et la couleur choisie est respectée (texte foncé sur un accent clair). Preuve : test en direct « Rends le site plus luxe » en 8 s, puis retour à l'origine en 6 s.
- [x] **19. Nouvelles sections par l'assistant** — FAQ, avis, galerie, vidéo TikTok/YouTube/Instagram, horaires et plan, équipe, appel à l'action, bandeau d'annonce. Elles sont rangées dans l'ordre des sections, masquables et traduites avec le site. Preuve : FAQ en 14 s, bandeau en 9 s, vidéo en 8 s ; les horaires manquants donnent lieu à une question.
- [x] **20. Offres et quotas appliqués par le serveur** — Gratuit 30 demandes par mois, Pro 300, Commerce 1 000 ; ambiances et sections à partir de Pro ; langues 1/3/8. Quand une demande dépasse l'offre, le client voit la proposition de passer à l'offre supérieure. Réglage « plan » dans flova_settings ; par défaut Commerce pour le site de Fukay.
- [x] **21. Recherche de nom de domaine en direct** — Dans la conversation, l'assistant donne les adresses libres en 6 à 9 s (registres officiels et serveurs de noms). Preuve : test en direct.
- [ ] **22. Achat de nom de domaine sans intervention** — Paiement du client par carte ou Bancontact (Stripe), puis achat à son nom et branchement automatiques (Vercel), renouvellement annuel, remboursement automatique en cas d'échec, plafond de 60 € et marge de 3 €. Code en ligne (fonction flova-domaine) ; interface testée avec des réponses simulées. Bloquant : Karim se connecte une fois à Vercel et à Stripe pour créer les deux clés (VERCEL_TOKEN, STRIPE_SECRET_KEY).
- [ ] **23. Tests réels du parcours complet par Karim sur son téléphone, puis activation de l'IA pour Fukay (étape 7).**

## Version 11 h (nuit du 20/11) — demandée par Karim à 3 h 35 : 3 à 4 fois plus évoluée, éblouissante

Chaque étape : codée, testée sur iPhone 15, iPhone SE et ordinateur, en ligne, cochée avec preuve.

- [x] **24. Idées suivantes après chaque changement** — après chaque modification, l'assistant propose 3 idées concrètes à toucher, adaptées au site. Fait si : 3 puces apparaissent après une modification et une puce touchée s'applique. Preuve : studio 25/25 le 20/11 à 3 h 45 (3 idées après modification sur iPhone 15, iPhone SE et ordinateur).
- [x] **25. « Analyse mon site » : note sur 100 et corrections en un toucher** — l'assistant note le site (clarté, appel à l'action, confiance, référencement Google, téléphone) et propose 5 corrections applicables. Fait si : la note s'affiche en moins de 15 s et « Tout corriger » s'applique et s'annule. Preuve : note en 11 s, anneau animé et 5 barres sur les 3 écrans, « tout corriger » appliqué en 19 s (FAQ, appel à l'action, anglais) le 20/11 à 3 h 45.
- [ ] **26. Trois propositions d'ambiance au choix** — « change le style » donne 3 versions à prévisualiser dans le site avant de choisir. Fait si : bascule entre les 3 sans enregistrer, puis « Garder celle-ci » enregistre.
- [x] **27. Historique visuel des versions** — liste datée des versions avec « revenir à celle-ci ». Fait si : retour à une version de plus de 2 crans, puis retour à la dernière. Preuve : « 🕓 Mes versions » dans /studio, liste datée (aujourd'hui, hier…), retour à la 3e version puis « Annuler », testé sur les 3 écrans le 20/11 à 3 h 48 (studio 31/31).
- [x] **28. Aperçu Google et partage** — aperçu du résultat Google (titre et description), QR code du site à télécharger, bouton de partage WhatsApp. Fait si : le QR scanné ouvre le site et l'aperçu change quand l'assistant modifie la description. Preuve : « 📲 Partager mon site », QR décodé en https://flovaagency.com/ (lecture automatique de la capture iPhone SE), aperçu Google mis à jour après « Rends ma description Google plus attirante », studio 37/37 le 20/11 vers 4 h.
- [ ] **29. Statistiques de visites sans cookie** — visites du jour, de la semaine, part sur téléphone, langues, sections les plus vues. Fait si : une visite test apparaît en moins de 10 s et rien d'identifiant n'est stocké.
- [ ] **30. Messages reçus par le formulaire de contact dans le studio** — Fait si : un message envoyé depuis le site apparaît dans le studio avec réponse en un toucher (mail).
- [ ] **31. Traduction plus rapide avec progression visible** — Fait si : moins de 15 s pour une langue, et l'écran montre l'avancement.
- [ ] **32. Régression complète et gel à 10 h** — assistant, studio, démo, sécurité, tous verts sur la version en ligne.
- [ ] **33. PDF des nouveautés pour Karim avant 10 h 45.**

## Liaison usine (J+2 à J+4)

- [ ] **12. USINE_KEY et relève automatique depuis cerveau-1** — Fait si : une demande approuvée devient une fiche `usine/*`, la branche est relue et fusionnée par le pilote, la demande passe à « en ligne » et l'auteur reçoit le mail, le tout en moins d'une heure de bout en bout avec une demande test.
- [ ] **13. Suivi visible dans « Demandes »** — Fait si : Fukay voit les statuts reçue, approuvée, en cours et en ligne mis à jour sans recharger, testé sur iPhone.

## Remise de la version finale (J+5 à J+7)

- [ ] **14. Guide du site et fiche des accès mis à jour avec ✦ Demander [usine]** — Fait si : les deux PDF sont régénérés, relus, portent « build by Uxlab.ai » et ne contiennent aucun nom légal de société.
- [ ] **15. Nettoyage** — Fait si : plus aucune donnée de test dans la base (lignes « démo » de consommation archivées), demande test de Karim traitée, brouillons Gmail en double jetés par Karim.
- [ ] **16. Mail « version finale » à Fukay** — Fait si : invitations acceptées ou relancées, parcours complet testé sur iPhone la veille, mail parti depuis noreply avec les fiches à jour.

## Journal

- 20/11, nuit : étapes 17 à 21 faites et testées en direct ; 22 prête, en attente des deux clés ; fautes 22 à 38 consignées.

- 19/11 : étapes 1 à 6 faites. 21 fautes consignées dans cerveau-apports (claude-ai-flova-20261119*.md).
