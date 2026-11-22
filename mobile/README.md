# BiletFlow mobile app

The BiletFlow app for Android and iOS (Expo SDK 58, React Native, Expo Router). It talks to the same backend as the website and has the same features:

- **Attendees:** browse and search events, event pages with reviews and reports, checkout (ticket types, numbered seats on a seat map, promo codes and links, named guests, simulated payment), my tickets with QR codes, ticket and order PDFs, add to calendar, cancel or ask for a refund.
- **Account:** sign up, sign in, forgot / reset password, email confirmation, profile and language, change password, sign out of this device or everywhere, notifications.
- **Support:** open a case about a booking or event, case threads with replies, status and assignment for the team, escalation to the platform.
- **Organizers:** become an organizer, dashboard, create / edit / publish / unpublish / duplicate / cancel events, images, ticket types, numbered seating, paid-sales activation, promo campaigns (link and QR), attendees with CSV export, check-in and refunds, sales analytics, team, activity history, organizer profile with identity check and payout account.
- **Check-in desk:** pick an event, scan QR codes with the camera, type a code, search guests, admit and undo with a reason, live counts and history.
- **Platform admins:** overview and global search, users, organizer checks, events, orders, payments with refunds and disputes, event reports, paid-sales activations, platform support queue, promo activity, settings, audit history, CSV exports.

## Languages

The attendee screens (events, checkout, tickets, account, sign-in, support, notifications) are in Kazakh, Russian and English. The switch on the Account tab (and on sign-up) changes it at once; it is remembered on the phone, and for a signed-in account it is saved as the profile language, so the website, emails and notifications follow. Without a choice the phone's language decides. Organizer, check-in and admin screens stay in English.

Screens write English inside `t("…")` from `useT()` (`src/lib/i18n.ts`); the Russian and Kazakh versions are in `src/locales/ru.json` and `src/locales/kk.json`, the same files as the website's. `npm test` fails when a text has no translation.

## How it connects

The website keeps tokens in httpOnly cookies behind its own proxy. The app calls the backend directly, keeps the access and refresh tokens in the phone's secure storage (`expo-secure-store`), sends `Authorization: Bearer …`, and swaps an expired access token for a new pair once before retrying. See `src/lib/client.ts`.

The backend address is `extra.apiUrl` in `app.json` (`https://biletflow-api.vercel.app/api/v1`). To use another backend, set `EXPO_PUBLIC_API_URL` before starting, for example a local one:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.20:8000/api/v1 npx expo start
```

(Use your computer's network address, not `localhost`, so the phone can reach it.)

## Run it

```bash
npm install
npx expo start
```

Install **Expo Go** on your phone and scan the QR code from the terminal. Every native module the app uses is part of Expo Go, so no build is needed. `npx expo start --web` runs it in a browser; then the backend's `ORIGINS` has to allow that address.

## Share it without your computer (EAS Update)

The app is linked to the Expo project `@zhandaulets/biletflow` and published to the `main` branch of EAS Update, so anyone with **Expo Go** (SDK 58) can open it without a running dev server:

- Open https://expo.dev/accounts/zhandaulets/projects/biletflow/updates, pick the latest update and use its **Preview** QR code; or
- send people the link `exp://u.expo.dev/b4eafee8-677b-4d50-b584-ccd195dc493e?channel-name=main` (open it on the phone, or scan it as a QR code).

After changing the app, publish a new version (sign in first with `npx expo login`):

```bash
npm run release -- --message "What changed"
```

`release` builds the Android and iOS bundles with one worker (the default parallel build can run out of memory) and uploads them. Expo Go only loads updates made for its SDK, so the runtime version follows the SDK (`exposdk:58.0.0`).

## Checks

```bash
npm run typecheck
npm run lint
npm test
```

`npm test` covers the API client (bearer tokens, refresh, sign-in and sign-out, errors).

## Store builds

For installable builds use EAS: `npx eas-cli build --platform android` (or `ios`). The bundle identifier and package are `kz.biletflow.app`; change them in `app.json` if you publish under your own account.
