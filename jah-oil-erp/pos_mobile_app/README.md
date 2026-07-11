# Jah POS Mobile App

Expo Router mobile POS app for Jah Oil ERP.

## Environment

Create `pos_mobile_app/.env` or `pos_mobile_app/.env.local` with:

`EXPO_PUBLIC_WEB_APP_URL=http://YOUR_WEB_APP_HOST:3000`

If omitted, the app will try to derive the web app host from the current Expo dev host.

## What it uses

- Web ERP mobile auth endpoints under `web_app/src/app/api/mobile`
- Same user, role, module, and must-change-password workflow as the web app
- Offline-first queued POS sync with persistent device storage

## Run

```bash
npm install
npm run start
```
