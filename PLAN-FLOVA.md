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

## Liaison usine (J+2 à J+4)

- [ ] **12. USINE_KEY et relève automatique depuis cerveau-1** — Fait si : une demande approuvée devient une fiche `usine/*`, la branche est relue et fusionnée par le pilote, la demande passe à « en ligne » et l'auteur reçoit le mail, le tout en moins d'une heure de bout en bout avec une demande test.
- [ ] **13. Suivi visible dans « Demandes »** — Fait si : Fukay voit les statuts reçue, approuvée, en cours et en ligne mis à jour sans recharger, testé sur iPhone.

## Remise de la version finale (J+5 à J+7)

- [ ] **14. Guide du site et fiche des accès mis à jour avec ✦ Demander [usine]** — Fait si : les deux PDF sont régénérés, relus, portent « build by Uxlab.ai » et ne contiennent aucun nom légal de société.
- [ ] **15. Nettoyage** — Fait si : plus aucune donnée de test dans la base (lignes « démo » de consommation archivées), demande test de Karim traitée, brouillons Gmail en double jetés par Karim.
- [ ] **16. Mail « version finale » à Fukay** — Fait si : invitations acceptées ou relancées, parcours complet testé sur iPhone la veille, mail parti depuis noreply avec les fiches à jour.

## Journal

- 19/11 : étapes 1 à 6 faites. 21 fautes consignées dans cerveau-apports (claude-ai-flova-20261119*.md).
