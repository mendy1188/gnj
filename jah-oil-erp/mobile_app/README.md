# Jah Mobile App

Expo-based React Native mobile app for the Jah Oil ERP ecosystem.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start Expo:

```bash
npm run start
```

3. Run on a target:

```bash
npm run android
npm run ios
npm run web
```

## Current scope

- Expo Router-based navigation
- Auth screens: `login`, `forgot-password`
- Bottom-tab client app: `Home`, `Buy Fuel`, `Bulk Balance`, `Settings`
- Settings screen for profile and payment methods
- Buy Fuel and Bulk Balance module screens

## Structure

- `app/_layout.js` — root Expo Router stack
- `app/(tabs)/_layout.js` — bottom-tab layout
- `app/login.js` — sign-in screen
- `app/forgot-password.js` — recovery screen
- `app/(tabs)/home.js` — client dashboard
- `app/(tabs)/buy-fuel.js` — rewards, mobile-money choice, fuel preview
- `app/(tabs)/bulk-balance.js` — product bulk funding and redemption preview
- `app/(tabs)/settings.js` — profile and payment method setup
- `components/auth/*` — reusable auth UI
- `config/clientAppSettings.js` — adjustable business rules and provider config
