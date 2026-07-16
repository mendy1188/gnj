# Jah POS Mobile App

Expo Router mobile POS app for Jah Oil ERP.

## Purpose

This app is the cashier-facing mobile POS. It authenticates against the ERP,
loads cashier/station context, records sales, and stores sales offline first
when connectivity is unavailable. Queued sales sync back to the web ERP when
the device comes online.

## Environment

Create `pos_mobile_app/.env` or `pos_mobile_app/.env.local` with:

`EXPO_PUBLIC_WEB_APP_URL=http://YOUR_WEB_APP_HOST:3000`

If omitted, the app will try to derive the web app host from the current Expo dev host.

## What it uses

- Web ERP mobile auth endpoints under `web_app/src/app/api/mobile`
- Same user, role, module, and must-change-password workflow as the web app
- Offline-first queued POS sync with persistent device storage
- Product images are loaded from Appwrite Storage through the web POS bootstrap API and prefetched into the native image cache. Bundled product icon assets are intentionally not included; lightweight emoji placeholders are used only when a product has no uploaded image.

## Run

```bash
npm install
npm run start
```

## EAS build and deployment

Run all EAS commands from this directory:

```bash
cd pos_mobile_app
```

### 1. Login with the correct Expo account

If you are logged in with the wrong account:

```bash
eas whoami
eas logout
eas login
eas whoami
```

### 2. Link this app to the EAS project

If this is a new EAS project, initialize/link it:

```bash
eas project:init
```

This writes the EAS `projectId` into `app.json` under `expo.extra.eas`.

### 3. Set the ERP API URL for EAS builds

The app uses `EXPO_PUBLIC_WEB_APP_URL` to call the web ERP API. For EAS builds,
set it to the deployed HTTPS URL of the web app, not `localhost` or a LAN IP:

```bash
eas env:create --name EXPO_PUBLIC_WEB_APP_URL --value https://YOUR_ERP_DOMAIN --environment preview --visibility plaintext
eas env:create --name EXPO_PUBLIC_WEB_APP_URL --value https://YOUR_ERP_DOMAIN --environment production --visibility plaintext
```

`EXPO_PUBLIC_` values are bundled into the app. Do not put secrets in them.

### 4. Build an internal test app

Android APK:

```bash
eas build --platform android --profile preview
```

iOS internal build:

```bash
eas device:create
eas build --platform ios --profile preview
```

For iOS device installation, the Apple Developer account must be available and
the device UDID must be registered.

### 5. Build production app binaries

```bash
eas build --platform android --profile production
eas build --platform ios --profile production
```

Or build both platforms:

```bash
eas build --platform all --profile production
```

### 6. Submit production builds

```bash
eas submit --platform android
eas submit --platform ios
```

Android submission requires a configured Google Play Console app. iOS
submission sends the build to App Store Connect/TestFlight first.

### 7. Useful checks before building

```bash
npx expo start -c
python3 -m json.tool app.json
```

Confirm before production:

- `app.json` has the correct `name`, `slug`, `icon`, `ios.bundleIdentifier`,
  and `android.package`.
- `eas.json` has the expected `preview` and `production` profiles.
- `EXPO_PUBLIC_WEB_APP_URL` points to a reachable deployed web ERP URL.
- The web ERP mobile API endpoints are deployed and reachable over HTTPS.
