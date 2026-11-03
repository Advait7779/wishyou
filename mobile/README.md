# WishYou mobile

React Native Android app using Expo SDK 57 for local Expo Go testing. Mobile dependencies and lockfile are independent of the web/backend workspaces.

## Test with Expo Go

1. Install mobile dependencies once: `npm --prefix mobile ci` from the repository root.
2. Start the mobile test backend in a terminal: `npm run dev:mobile:api`. It uses port 4001, the existing PostgreSQL database and `backend/.env`, and pauses provider sending for this process. Startup creates mobile session/request tables. Contact and schedule changes still modify the shared database; another running backend may process the shared schedule.
3. Start Expo in a second terminal: `npm run dev:mobile` from the repository root, or `cd mobile` and `npx expo start --lan`.
4. Put the computer and phone on the same Wi-Fi. In Expo Go, scan the QR code displayed by Expo. Sign in with the same admin email/password as the web panel.

In Expo Go the API defaults to the Metro server's LAN hostname on port 4001. If the API runs elsewhere, create `mobile/.env` with `EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:4001` or a hosted HTTPS origin and restart Expo. The development login displays the selected API address. `localhost` on the phone is the phone itself. Allow Node through the Windows private-network firewall if LAN connections are blocked. A Metro tunnel only tunnels the app bundle; the API must still be reachable separately.

To deliberately test real sending, run the normal backend with `npm run dev:backend` and point `EXPO_PUBLIC_API_URL` at its port (normally 4000), then restart Expo. Only confirm sends to approved test numbers. The shared two-per-number limit applies to web and mobile together.

The installed Expo Go must support SDK 57. If Expo Go reports an SDK mismatch, use a matching Expo Go version on Android or align the project SDK before testing. The official template guidance used for this implementation is https://docs.expo.dev/more/create-expo/ .

## Included

- Orange/cream login and dashboard, bottom navigation, reduced-motion-aware screen/dialog animations.
- Simple full-width horizontal contact table with natural page scrolling, dynamic imported columns, bounded 25-row cursor pagination, search, Add/Edit/Delete, and Clear dataset. The compact Add record, Import more, and Clear dataset controls share one row.
- SMS/voice review with occasion/channel choice, date warning, preview, provider acceptance status, and shared two-per-number rolling 24-hour allowance.
- Idempotency keys persist through uncertain network failures so retrying the same send does not enqueue it twice. Read requests can be retried; sends are never silently queued offline.
- Schedule time selection and automatic birthday/anniversary switches; uses the existing server timezone and scheduler. Provider URLs are managed only through the web panel.
- CSV/XLSX selection, bounded 4 MiB file reads, upload offset resume, pause on backgrounding, cancellation, and server import progress. Android content-URI access and large uploads require physical-device testing. Interrupted uploads require selecting the same file again. 35-50 GiB mobile performance has not been established.

## Sessions and API

Mobile login returns a 15-minute bearer access token and rotating refresh credential with a 30-day session lifetime. Only the refresh credential is persisted in SecureStore. Refresh-token reuse revokes the session. Logout revokes the server session when reachable and always clears local credentials. Password rotation invalidates existing mobile sessions.

The server validates mobile permission scope on every request and rejects provider URL/configuration, legacy template administration, and full web settings endpoints. `/api/mobile/schedule` updates only time and the two switches while retaining timezone/template IDs under a row lock. Same admin credentials still permit a separate web login.

## Verification and release

`cd mobile; npx tsc --noEmit` checks types. `npx expo export --platform android` checks Metro and Hermes compilation; it does not install or run the app on a phone. Physical-device testing must cover keyboard/date entry, horizontal/vertical table gestures, all action dialogs, refresh after web edits, connection loss, upload resume, and reduced motion. Provider sends should be tested only after deliberate confirmation to an approved test number.

`eas.json` defines a preview APK and production AAB profile. Before release, set the final Android package ID, HTTPS API origin, and Expo project/signing credentials, and review the included icon/splash assets. EAS builds/signing have not been run. The Expo build-properties plugin disables Android cleartext traffic for standalone builds; Expo Go's development networking uses its own native configuration.

The SDK 57 toolchain currently reports inherited development dependency advisories through `npm audit`. Compatible audit updates were applied; a forced SDK upgrade was not applied because it changes Expo Go compatibility. Resolve/review the remaining development-tool advisories before publishing a release.
