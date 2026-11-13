# WishYou mobile

React Native Android app using Expo SDK 58. Mobile dependencies and lockfile are independent of the web/backend workspaces.

## Test with Expo Go

1. Install mobile dependencies once: `npm --prefix mobile ci` from the repository root.
2. Start the mobile test backend in a terminal: `npm run dev:mobile:api`. It uses port 4001, the existing PostgreSQL database and `backend/.env`, and pauses provider sending for this process. Startup creates mobile session/request tables. Contact and schedule changes still modify the shared database; another running backend may process the shared schedule.
3. Start Expo in a second terminal: `npm run dev:mobile` from the repository root, or `cd mobile` and `npx expo start --lan`.
4. Put the computer and phone on the same Wi-Fi. In Expo Go, scan the QR code displayed by Expo. Sign in with the same admin email/password as the web panel.

In Expo Go the API defaults to the Metro server's LAN hostname on port 4001. If the API runs elsewhere, create `mobile/.env` with `EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:4001` or a hosted HTTPS origin and restart Expo. The development login displays the selected API address. `localhost` on the phone is the phone itself. Allow Node through the Windows private-network firewall if LAN connections are blocked. A Metro tunnel only tunnels the app bundle; the API must still be reachable separately.

To deliberately test real sending, run the normal backend with `npm run dev:backend` and point `EXPO_PUBLIC_API_URL` at its port (normally 4000), then restart Expo. Only confirm sends to approved test numbers. The shared two-per-number limit applies to web and mobile together.

Use Expo Go with SDK 58 support when testing locally.

## Included

- Orange/cream login and dashboard, bottom navigation, reduced-motion-aware screen/dialog animations.
- Simple full-width horizontal contact table with natural page scrolling, dynamic imported columns, bounded 25-row cursor pagination, search, Add/Edit/Delete, and Clear dataset. The compact Add record, Import more, and Clear dataset controls share one row.
- SMS/voice review with occasion/channel choice, date warning, preview, provider acceptance status, and shared two-per-number rolling 24-hour allowance.
- Idempotency keys persist through uncertain network failures so retrying the same send does not enqueue it twice. Read requests can be retried; sends are never silently queued offline.
- Schedule time selection and automatic birthday/anniversary switches; uses the existing server timezone and scheduler. Provider URLs are managed only through the web panel.
- CSV/XLSX selection, 4 MiB file reads, upload resume, and server import progress. Resume checks the file's SHA-256 and date order. The server verifies the uploaded bytes before replacing contacts. If Android's file provider cannot seek, the app uses a temporary local copy, which requires enough free space for the file. Use the web panel for very large files. An earlier upload without a checksum must be resumed where it started or canceled before starting a verified upload.

## Sessions and API

Mobile login returns a 15-minute bearer access token and rotating refresh credential with a 30-day session lifetime. Only the refresh credential is persisted in SecureStore. Refresh-token reuse revokes the session. Logout revokes the server session when reachable and always clears local credentials. Password rotation invalidates existing mobile sessions.

The server validates mobile permission scope on every request and rejects provider URL/configuration, legacy template administration, and full web settings endpoints. `/api/mobile/schedule` updates only time and the two switches while retaining timezone/template IDs under a row lock. Same admin credentials still permit a separate web login.

## Verification and release

`cd mobile; npx tsc --noEmit` checks types. `npx expo export --platform android` checks Metro and Hermes compilation; it does not install or run the app on a phone. Physical-device testing must cover keyboard/date entry, horizontal/vertical table gestures, all action dialogs, refresh after web edits, connection loss, upload resume, and reduced motion. Provider sends should be tested only after deliberate confirmation to an approved test number.

Deploy the updated backend first. The app is linked to the `advait7779/wishyou-mobile` EAS project. Configure Android signing and set `EXPO_PUBLIC_API_URL` in the EAS `preview` and `production` environments to the public HTTPS origin of WishYou, without `/api`. The build checks for a valid HTTPS origin before installation. From `mobile/`, run `npx eas-cli@latest build --platform android --profile preview` for an installable APK or use the `production` profile for a Play Store AAB. Verify `/api/health` on the configured origin and test the signed APK on a physical Android phone before distributing it.
