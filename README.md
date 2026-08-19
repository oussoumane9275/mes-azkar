# Mes Azkar — projet Android/iOS (Capacitor)

Cette application est un vrai projet React + Vite, packagé en app native via
[Capacitor](https://capacitorjs.com/). Le code source vit dans `src/`, et
`npm run build` produit le dossier `www/` que Capacitor embarque dans l'app.

## Ce qu'il te faut avant de commencer

1. **Node.js** (version 18 ou plus) — https://nodejs.org
2. **Android Studio** — https://developer.android.com/studio
   (installe aussi le "Android SDK" et un émulateur, ou branche ton téléphone en USB avec le mode développeur activé)
3. Pour l'App Store (iOS) : un **Mac avec Xcode**, ou un service de build cloud
   (Codemagic, Ionic Appflow…) — impossible de compiler iOS depuis Windows.

## Étapes

Ouvre un terminal dans ce dossier (`azkar-capacitor/`), puis :

```bash
# 1. Installer les dépendances
npm install

# 2. Builder le web (React → www/) puis synchroniser vers Android
npm run sync

# 3. Ouvrir le projet dans Android Studio
npx cap open android
```

Android Studio s'ouvre alors avec un vrai projet Android. Depuis là :

- **Tester** : clique sur le bouton ▶️ (Run) pour lancer l'app sur un émulateur ou ton téléphone branché en USB
- **Générer l'APK** : menu `Build` → `Build Bundle(s) / APK(s)` → `Build APK(s)`
- **Publier sur le Play Store** : il te faudra un compte développeur Google Play (25$, paiement unique),
  puis générer un fichier `.aab` signé (`Build` → `Generate Signed Bundle / APK`) et le téléverser
  sur la [Play Console](https://play.google.com/console)
  - Vérifie dans la Play Console le niveau d'API cible exigé au moment de la publication
    (`android/variables.gradle` → `targetSdkVersion`) — Google relève cette exigence chaque année.

## Mettre à jour l'app plus tard

Si tu modifies le code (dans `src/App.jsx`, ou en demandant une nouvelle
version à Claude), relance simplement :

```bash
npm run sync
```

Ça rebuild le web et met à jour le projet Android avec la nouvelle version, sans tout refaire.

## Icônes et splash screen

- Générés à partir de `assets/icon.png`, `assets/icon-foreground.png`,
  `assets/icon-background.png` et `assets/splash.png` (voir `scripts/generate-icons.cjs`
  pour régénérer le design source).
- Pour régénérer les icônes Android après un changement de design :
  ```bash
  npx capacitor-assets generate --android
  ```
- Le nom affiché est défini dans `capacitor.config.json` (`appName`).

## Fonctionnalités notables

- **100% autonome hors-ligne** pour l'interface (React/Tailwind/polices sont
  bundlés localement, aucune dépendance CDN au runtime). Seule la lecture du
  Coran nécessite une connexion (texte récupéré via une API externe).
- **Horaires de prière configurables** : géolocalisation (`@capacitor/geolocation`)
  ou position par défaut, avec plusieurs méthodes de calcul (Grande Mosquée de
  Paris, MWL, ISNA, Égypte, Karachi, Umm al-Qura, ou angles personnalisés) —
  réglable dans Réglages.
- **Lecture audio** : bouton "Écouter" sur les azkar, invocations et le tasbih,
  via la synthèse vocale native du téléphone (`src/speech.js`).

## Besoin d'aide ?

Si tu bloques sur une étape (erreur de build, SDK manquant, etc.), colle le
message d'erreur exact à Claude Code — il pourra le diagnostiquer directement
depuis ton terminal.
