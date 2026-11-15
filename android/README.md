# Zuri pour Android

Version Android de Zuri : une application Kotlin légère (≈ 250 Ko) qui s'appuie sur la
**WebView du système** (Chromium, mis à jour par le Play Store), avec les mêmes protections que
la version de bureau quand Android le permet.

- Android 8.0 (API 26) ou plus récent.
- Interface en français, ou en anglais si le téléphone est en anglais.
- Installation directe d'un APK, sans Play Store ni compte.

## Fonctions

| | |
|---|---|
| Onglets | Plusieurs onglets, réouverts au démarrage. Un onglet n'est chargé qu'au moment où on l'ouvre. |
| Barre d'adresse | Adresse ou recherche (8 moteurs, DuckDuckGo par défaut). Seuls `http(s)` sont acceptés. |
| HTTPS uniquement | Passage automatique en HTTPS, avec avertissement avant de continuer en HTTP. Le réseau local (box, imprimante) n'est pas concerné. |
| Anti-pub / anti-traçage | Listes EasyList et EasyPrivacy, réduites aux règles de domaine, appliquées aux requêtes tierces. |
| Anti-phishing / anti-malware | Listes malware-filter vérifiées **sur le téléphone**, plus Google Safe Browsing intégré à la WebView. Le site signalé est bloqué avant d'être chargé. |
| Navigation privée | Profil WebView séparé, effacé à la fermeture du dernier onglet privé. Captures d'écran bloquées. |
| Autorisations | Caméra, micro, position et DRM : refusés par défaut, demandés site par site, retenus pour la session seulement. |
| Téléchargements | Confirmation avant chaque téléchargement, avec une alerte renforcée pour les APK et exécutables. |
| Fenêtres surgissantes | Seulement après un geste de l'utilisateur, avec une limite de fréquence. Elles s'ouvrent en onglet en gardant le lien avec la page d'origine. |
| Données mobiles | Listes mises à jour seulement si elles ont changé (ETag), économiseur de données sans images. |
| Données économisées | Compteur mensuel sur la page d'accueil et dans le bouclier (« 1 234 éléments bloqués, environ 18 Mo économisés »). Estimation prudente de 15 Ko par élément bloqué. Le montant (en FCFA, par exemple) ne s'affiche que si vous indiquez le prix d'1 Go de votre forfait. |
| Faux sites mobile money | Les noms de domaine qui imitent Orange Money, MTN MoMo, Wave, Moov, Airtel, M-Pesa, Ecobank, Western Union, PayPal… déclenchent un avertissement avant le chargement de la page. Les caractères trompeurs (`0range`, `rn`→`m`, lettres cyrilliques) sont neutralisés. La vérification se fait sur le téléphone. |
| Cookies et emplacements vides | Les bandeaux de consentement de 23 outils courants sont refusés automatiquement : clic sur « Refuser », jamais sur « Accepter ». Les emplacements publicitaires vides sont masqués (règles génériques d'EasyList). |
| Mode lecture et voix | Le texte seul de l'article (sans images ni scripts), lisible sur petit écran, avec la durée de lecture. Lecture à voix haute avec la synthèse vocale d'Android, dans la langue de la page. |
| Lecture hors ligne | Articles enregistrés en texte seul (quelques Ko), chiffrés sur le téléphone et lisibles sans connexion. Jamais depuis un onglet privé. |
| Économiseur de données | Images bloquées seulement sur réseau payant (données mobiles) ; elles reviennent automatiquement en Wi‑Fi. Un bouton affiche les images d'un onglet. |
| Recherche et mode sombre | Recherche dans la page avec compteur d'occurrences ; sites assombris quand le téléphone est en mode sombre. |
| Favoris et historique | Chiffrés sur le téléphone (AES-256-GCM, clé du Keystore Android), jamais alimentés par les onglets privés. Les suggestions de la barre d'adresse sont calculées sur l'appareil : rien n'est envoyé au moteur pendant la saisie. |

Aucune donnée n'est sauvegardée dans le cloud et aucune statistique n'est envoyée.

## Différences avec la version de bureau

- Le masquage des emplacements publicitaires utilise seulement les règles génériques
  d'EasyList, dans la page principale. Les règles propres à un site et les scriptlets ne sont
  pas appliqués.
- Les bandeaux de cookies sur les sites « payer ou accepter », comme Le Monde, ne sont pas
  contournés : ils n'offrent pas de bouton « Refuser ».
- La protection anti-phishing de la WebView repose sur Google Safe Browsing. Ce service ne
  transmet que des préfixes de hachage, et seulement en cas de correspondance. Il peut être
  désactivé dans les réglages, en même temps que les listes locales.
- Le DNS chiffré dépend du réglage « DNS privé » d'Android (Paramètres › Réseau).
- La navigation privée nécessite une WebView récente (profils multiples). Sur un téléphone trop
  ancien, l'option l'indique au lieu de proposer un mode privé incomplet.

## Construire

Prérequis : JDK 17 ou plus récent (celui d'Android Studio convient) et le SDK Android (API 36).

```bash
cd android
./gradlew testDebugUnitTest assembleDebug     # APK de test : app/build/outputs/apk/debug/
./gradlew assembleRelease                     # APK signé : app/build/outputs/apk/release/
```

Sous Windows, utilisez `gradlew.bat`. Si `JAVA_HOME` n'est pas défini, pointez-le vers le JDK
d'Android Studio (`…\Android Studio\jbr`).

### Clé de signature

La version release est signée avec la clé décrite dans `android/keystore.properties` :

```properties
storeFile=keystore/zuri-release.jks
storePassword=…
keyAlias=zuri
keyPassword=…
```

Ce fichier et le dossier `keystore/` ne sont **jamais versionnés**. Gardez-en une copie de
sauvegarde hors de l'ordinateur : sans cette clé, il est impossible de publier une mise à jour que
les téléphones accepteront par-dessus la version déjà installée.

## Tests

- `./gradlew testDebugUnitTest` : 34 tests unitaires (barre d'adresse, HTTPS, listes de filtrage,
  jetons des pages internes, échappement HTML, noms de fichiers, favoris et suggestions, compteur
  de données, scripts de page, faux sites mobile money, mode lecture, lecture hors ligne).
- Sprint 2, vérifié sur le même téléphone : recherche « capitale » (1/10) sur Wikipédia, mode
  lecture nettoyé des notes et de l'infobox, lecture à voix haute lancée puis arrêtée, article
  enregistré puis listé dans « Lecture hors ligne ». L'économiseur de données n'a pas été essayé
  sur données mobiles (téléphone en Wi‑Fi).
- Sprint du 15/11/2026, vérifié sur le même téléphone : avertissement sur
  `orange-money-bonus.xyz`, bandeau de Jeune Afrique refusé automatiquement dans un profil vierge,
  compteur affiché sur la page d'accueil, favori proposé dès « doua » dans la barre d'adresse.
- Vérifié à la main le 15/11/2026 sur un TECNO CG8h (Android 11, WebView 153), APK release :
  démarrage en 1 s, passage en HTTPS, listes téléchargées puis 7 traqueurs bloqués sur un site
  d'actualité avant tout consentement, onglet privé (captures refusées, fermeture propre),
  confirmation de téléchargement avec alerte pour un APK. Avertissement phishing et « Ignorer »
  vérifiés sur émulateur Android 15.

## Installer sur un téléphone

1. Copiez `app-release.apk` sur le téléphone (câble, Bluetooth, messagerie…).
2. Ouvrez-le et autorisez l'installation depuis cette source quand Android le demande.
3. Facultatif : choisissez Zuri comme navigateur par défaut (Paramètres › Applications › Applications par défaut).

## Licences

Le code de l'application suit la licence du dépôt. Les listes de filtrage sont téléchargées à
l'exécution et ne sont pas redistribuées : EasyList et EasyPrivacy (GPLv3 / CC BY-SA 3.0),
malware-filter (CC0 et CC BY-SA 4.0). La liste de secours `resources/base-filters.txt` (CC0) est
embarquée.
