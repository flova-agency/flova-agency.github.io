# Page de confidentialité de flovaagency.com (bloque la publication de l'application Google)

## Pourquoi
Google n'ouvre la connexion « Continuer avec Google » à tout le monde (dont Furkan) que si le site publie une page de confidentialité. Échéance : avant le 21/11 à 9 h 30 (décision de Karim).

## À faire
1. Créer `confidentialite.html` à la racine du dépôt, dans le style du site (fond sombre, police Archivo, mêmes variables CSS que index.html), en français, tutoiement interdit ici (vouvoiement : texte juridique adressé aux visiteurs).
2. Contenu exact, sans rien inventer :
   - Responsable : Flova (nom commercial), contact par le formulaire du site et l'adresse e-mail affichée sur le site. Aucun nom légal de société.
   - Données du formulaire de contact : nom, entreprise, e-mail, téléphone, message — utilisées uniquement pour répondre, conservées 24 mois, jamais revendues.
   - Statistiques de visites : compteurs anonymes par jour (nombre de visites, téléphone ou ordinateur, langue, provenance, sections vues), aucun cookie, aucune adresse IP conservée.
   - Connexion à l'espace d'édition (Google ou code par e-mail) : seulement l'adresse e-mail, pour vérifier que la personne a le droit de modifier le site.
   - Hébergement et sous-traitants : hébergement du site (GitHub Pages), base de données et authentification (Supabase, Union européenne), envoi d'e-mails (Resend).
   - Droits RGPD : accès, rectification, effacement, opposition — demande par e-mail ; réclamation possible auprès de l'Autorité de protection des données (Belgique).
3. Lien « Confidentialité » ajouté dans le pied de page d'index.html (clé data-k pour la traduction).
4. Pied de page : « build by Uxlab.ai ».

## Critère de fait (prouvé en production)
https://flovaagency.com/confidentialite répond 200 sur iPhone SE et ordinateur sans débordement, lien présent dans le pied de page, aucune erreur JavaScript. Rapport dans usine/rapports/flova-confidentialite.md avec captures.
