# Zuri

**Zuri** est un navigateur web de bureau privé, rapide et local-first, habillé d’une identité visuelle africaine sobre. Pas de compte, pas de télémétrie, pas de nuage : vos onglets, favoris et historique restent sur votre machine.

> État : **MVP fonctionnel pour Windows**. Linux et macOS sont prévus ensuite.
>
> Téléchargement : [dernière version publiée](https://github.com/ftchouabe-coder/zuri-browser/releases/latest).

---

## Pourquoi Zuri

- **Vie privée par défaut** : anti-pub et anti-trace actifs, HTTPS-only, DNS chiffré (DoH), cookies tiers bloqués, référents tronqués.
- **Zéro compte obligatoire** : aucune inscription, aucune synchronisation distante, aucun identifiant publicitaire.
- **Tout en local** : favoris, historique, téléchargements et réglages sont stockés dans des fichiers JSON sur votre disque.
- **Identité assumée** : palette « Terre & indigo » (indigo, terracotta, acacia, sable, or), contrastes WCAG AA, pas de folklore.
- **Bilingue FR / EN**, thème clair / sombre / système, interface entièrement en français au premier lancement.

## Fonctionnalités du MVP

- Onglets (création, duplication, fermeture, réouverture de session), onglets privés isolés.
- Omnibox intelligente : URL, recherche (DuckDuckGo, Startpage, Brave, Qwant, Google, Bing), historique navigable au clavier.
- Navigation complète : précédent/suivant, rechargement, rechargement sans cache, arrêt, zoom, recherche dans la page.
- Favoris, historique, téléchargements, panneaux de gestion.
- Bouclier réseau : anti-pub/anti-trace (`@ghostery/adblocker`), filtrage cosmétique, économie de données, HTTPS-only avec possibilité de continuer en HTTP ponctuellement.
- Permissions sensibles (caméra, micro, géolocalisation, notifications, presse-papiers, MIDI) demandées à l’origine, mémorisées localement, réinitialisables.
- Effacement des données (historique, cookies, cache, tout) et effacement à la fermeture en option.
- Page d’accueil, page d’erreur interne, menus natifs FR/EN, raccourcis clavier.
- Téléchargements, impression et export PDF via le moteur Chromium.

## Démarrage

Prérequis : **Node.js ≥ 20.19** (ou ≥ 22.12) et npm.

```bash
npm install
npm run dev        # mode développement (electron-vite)
```

Premier lancement : Zuri télécharge EasyList et EasyPrivacy, puis met les listes en cache. En attendant, un filet de sécurité local (`resources/base-filters.txt`, CC0) est déjà actif.

### Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | Lance l’application en développement avec rechargement à chaud. |
| `npm run typecheck` | Vérifie les types du processus principal et du renderer. |
| `npm run build` | Compile `out/main`, `out/preload`, `out/renderer`. |
| `npm start` | Ouvre la version compilée (`electron-vite preview`). |
| `npm run smoke` | Compile puis lance le test de fumée (capture + navigation vers `example.com`). |
| `npm run icon` | Régénère l'icône applicative (`build/icon.ico`, `build/icon.png`, `resources/icon.png`). |
| `npm run pack` | Produit une application non installée dans `release/` (`electron-builder --dir`). |
| `npm run dist` | Produit l’installeur NSIS et la version portable dans `release/`. |

Le test de fumée écrit une capture dans `%TEMP%\zuri-smoke.png` et vérifie la structure de l’interface, la navigation et l’état du bouclier réseau.

## Structure

```
src/
  main/        processus principal : fenêtre, onglets, réseau, stockage, menus, IPC
  preload/     pont sécurisé (contextBridge, liste blanche d’événements)
  renderer/    interface React : barre d’onglets, omnibox, panneaux, page d’accueil
  shared/      contrats TypeScript partagés (Settings, ZuriApi, événements)
resources/     filtres de secours embarqués
scripts/       test de fumée
docs/          analyse produit et décisions
```

Points d’architecture :

- Chaque onglet est un `WebContentsView` ; l’interface (React) reste au-dessus et pilote la vue active par IPC.
- Une seule session réseau principale + une session privée éphémère, purgée à la fermeture du dernier onglet privé.
- Les réglages sont lus à chaque requête par le bouclier réseau : les bascules sont immédiates, sans redémarrage.
- Les données sont écrites de façon atomique (fichier temporaire + renommage) via `JsonStore`.

## Limites connues

- **Windows d’abord** : le packaging Linux/macOS n’est pas encore configuré.
- Pas d’extensions, pas de gestionnaire de mots de passe intégré, pas de synchronisation entre appareils (choix assumé).
- Les listes de filtres nécessitent un accès réseau au premier lancement ; ensuite elles sont mises en cache.
- Pas encore de signature de code : Windows SmartScreen peut afficher un avertissement au premier lancement de l’installeur.
- En développement (`electron .`), les données sont écrites dans `%APPDATA%\Electron\data` ; une version packagée utilise `%APPDATA%\Zuri\data`.
- Le rendu de certaines pages complexes peut différer de Chrome selon les protections activées.

## Licence et attributions

Zuri est distribué sous licence **MIT** — voir [`LICENSE`](LICENSE).

- [Electron](https://www.electronjs.org/) — MIT ; Chromium — BSD.
- [React](https://react.dev/) — MIT.
- [`@ghostery/adblocker`](https://github.com/ghostery/adblocker) — MPL-2.0 (fichiers non modifiés).
- Listes **EasyList** et **EasyPrivacy** — CC BY-SA 3.0, © leurs auteurs respectifs ; elles sont téléchargées à l’exécution et ne sont pas redistribuées avec Zuri.
- `resources/base-filters.txt` — CC0 1.0 (liste maison de secours).

Zuri n’est affilié ni à Ghostery, ni à EasyList, ni à aucun fournisseur de recherche ou de DNS.

---

## English summary

Zuri is a privacy-first desktop web browser with a restrained African-inspired visual identity. No account, no telemetry, no cloud: tabs, bookmarks, history and settings stay on your machine. Windows MVP first; Linux and macOS later. Built with Electron, TypeScript and React. Run `npm install` then `npm run dev`. Licensed MIT.
