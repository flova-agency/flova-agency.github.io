# Rapport — Page de confidentialité flovaagency.com

## Objectif
Débloquer la publication de l'application Google (« Continuer avec Google ») en publiant une page de confidentialité conforme.

## Modifications
- Création de `confidentialite.html` à la racine du dépôt, dans le style du site (fond sombre, Archivo, mêmes variables CSS que `index.html`), en français, vouvoiement.
- Contenu : responsable (Flova, nom commercial), formulaire de contact (nom, entreprise, e-mail, téléphone, message — 24 mois, jamais revendus), statistiques anonymes (aucun cookie, aucune IP), connexion à l'espace d'édition (adresse e-mail uniquement), hébergement et sous-traitants (GitHub Pages, Supabase UE, Resend), droits RGPD et réclamation auprès de l'APD (Belgique).
- Ajout du lien « Confidentialité » dans le pied de page de `index.html` (clé `data-k="ft_privacy"` pour la traduction).
- Mention « build by Uxlab.ai » conservée dans le pied de page du site et présente sur la page de confidentialité.
- Aucun prix affiché, aucun secret dans le code.

## Vérifications
- [ ] `https://flovaagency.com/confidentialite` répond 200 (iPhone SE et ordinateur).
- [ ] Aucun débordement horizontal sur iPhone SE (375 px) ni sur ordinateur.
- [ ] Lien « Confidentialité » visible dans le pied de page de la page d'accueil.
- [ ] Aucune erreur JavaScript dans la console.

## Captures
- À ajouter après déploiement : `usine/rapports/captures/flova-confidentialite-iphone-se.png`, `usine/rapports/captures/flova-confidentialite-desktop.png`.
