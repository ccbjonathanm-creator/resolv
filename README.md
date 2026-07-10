# Dépanne — trouve la solution à ton problème

PWA installable (Android/iOS/desktop) qui aide à résoudre un problème dans **n'importe quel domaine** :
auto, vélo, tondeuse, jardinage, électroménager, informatique, maison, téléphone...

L'utilisateur décrit son souci. L'IA (Groq par défaut, ou Gemini) :
1. **pose 3 à 5 questions ciblées** pour cerner le problème (marque, symptômes, ce qui a été tenté...) ;
2. rend un **diagnostic clair** : causes probables classées, marche à suivre étape par étape, outils/pièces, avertissements de sécurité, niveau de difficulté ;
3. génère des **liens de recherche pré-remplis** vers les meilleures **vidéos YouTube**, **articles/tutos** et **forums** sur ce problème précis.

## Choix d'architecture (honnête)

Une PWA locale **ne peut pas naviguer sur le web** ni « regarder » des vidéos. La vraie valeur ici est le
**diagnostic IA** : Groq raisonne sur le problème et formule les bonnes requêtes de recherche. L'appli
transforme ces requêtes en **liens directs** vers YouTube/Google/forums (même principe que l'appli Voyage
avec les liens Kayak/Booking). Une vraie recherche web en direct (Tavily/Brave) est possible en phase 2.

- **100 % local, aucun serveur, aucun compte.** Seul appel réseau : l'API IA choisie (avec la clé
  gratuite de l'utilisateur, stockée sur l'appareil).
- **BYOK** (Bring Your Own Key) : clé Groq (`console.groq.com/keys`) ou Gemini
  (`aistudio.google.com/apikey`), gratuites. Jamais dans le code.
- **CSP stricte** : `script-src 'self'`, aucun code distant. `connect-src` limité à Groq + Gemini.
- HTML/CSS/JS pur, sans framework ni build.

## Modèle économique

- **2 diagnostics gratuits**, puis déblocage **à vie pour 15 €** (paiement unique, pas d'abonnement).
- Verrou = **signature ECDSA P-256** de l'identifiant d'appareil. La clé **publique** est dans l'app
  (elle vérifie seulement). La clé **privée** n'est jamais dans le code.
- **Générateur de clés intégré** (mode vendeur) caché derrière un **appui long** sur le numéro de version
  (Réglages) ou sur le nom dans le mur payant. La clé privée du vendeur est saisie une fois, **chiffrée
  (AES-GCM + passphrase, PBKDF2)** et gardée sur son seul appareil.
- Limite assumée : le compteur d'essai est local, donc contournable par réinstallation (comme Coffre).
  Acceptable pour ce prix et cet usage.

## Fichiers

```
depanne_app/
├── index.html            # écran unique (accueil / questions / résultat)
├── css/styles.css        # thème sombre, dégradés
├── js/app.js             # flux + appels IA + rendu + liens de recherche
├── js/licence.js         # 2 essais + activation clé (vérif ECDSA, clé publique)
├── js/vendeur.js         # générateur de clés intégré (clé privée chiffrée sur l'appareil)
├── manifest.json
├── service-worker.js     # réseau d'abord (MAJ auto), repli hors-ligne
├── make_icons.py         # génère les icônes (Pillow)
└── icons/
```

## Lancer en local

```
python -m http.server 5073 --directory depanne_app
```
Puis ouvrir http://127.0.0.1:5073 et coller une clé Groq gratuite dans les réglages (⚙️).

## Déployer (GitHub Pages)

Même montage que les autres PWA (Coffre, Valise...) : copier le contenu de `depanne_app/` à la racine d'un
dépôt public dédié, activer GitHub Pages. Une PWA n'est installable qu'en HTTPS, d'où Pages.

## Sécurité de la clé de licence

La paire de clés est en P-256. La **publique** est dans `js/licence.js`. La **privée** ne doit jamais être
déployée : elle sert uniquement, côté vendeur, à signer les identifiants d'appareil pour produire les clés.

## Pistes phase 2

- Vraie recherche web en direct (Tavily/Brave, palier gratuit) pour afficher/résumer de vrais résultats.
- Vision : envoyer une **photo** du défaut à Gemini (il voit l'image) pour un diagnostic plus fin.
- Historique local des diagnostics.
