# SHADOW PROTOCOL — projet à publier

Contenu : `index.html` (le jeu), `lobby.js` (salons Supabase), `config.js` (tes clés), `assets/logo.jpg`, `netlify.toml`, `supabase/schema.sql`.
Le jeu seul fonctionne sans Supabase (solo contre bots). Le multijoueur s'active quand `config.js` est rempli.

## 1. Supabase (déjà fait : projet `shadow-protocol`, tables créées, `config.js` rempli)
Il ne reste que la connexion Google (étape 3 ci-dessous) et l'URL du site (étape 4).

Détail des étapes, au cas où :
1. Crée un projet sur supabase.com.
2. SQL Editor > colle tout `supabase/schema.sql` > Run.
3. Authentication > Providers > Google : active-le avec un Client ID / Secret créés dans Google Cloud Console (OAuth, type « Application Web »). Dans Google Cloud, ajoute comme URI de redirection l'URL affichée par Supabase (`https://<ref>.supabase.co/auth/v1/callback`).
4. Authentication > URL Configuration : mets l'URL Netlify en « Site URL » et dans « Redirect URLs ».
5. Project Settings > API : copie **Project URL** et la clé **anon** dans `config.js`. Jamais la clé `service_role`.

## 2. Netlify
- Le plus simple : app.netlify.com/drop, puis glisse le dossier complet (après avoir rempli `config.js`).
- Ou : relie un dépôt Git ; aucune commande de build n'est nécessaire (`publish = "."`).

## Amis
Pseudo automatique à la première connexion (modifiable), demandes d'ami, statut en ligne (actif depuis moins de 2 min), invitation d'un ami dans un salon. Tout passe par des fonctions Supabase : les tables d'amis ne sont pas lisibles directement.

## Limites actuelles
- Salons : création, liste publique avec filtres, codes privés, expulsion, verrouillage, changement d'hôte automatique, statut prêt, classes. Pas de chat ni d'invitations d'amis.
- La partie se lance en solo avec bots : la synchronisation des positions et des tirs entre joueurs reste à faire (elle demandera Supabase Realtime ou un serveur de jeu dédié).
- Les règles « Sans compétences » / « Sans limite de temps » sont enregistrées mais pas encore appliquées en jeu.
- Les salons abandonnés ne sont pas nettoyés automatiquement.
