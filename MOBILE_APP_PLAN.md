# WishYou Android app plan

Status: reference plan. The initial implementation is now in `mobile/`; see `mobile/README.md` for Expo Go setup and outstanding physical-device/release checks.

## Product scope

Create an Android APK in React Native that uses the existing hosted Express/PostgreSQL backend. Match the web application's orange and cream palette, branding, cards, typography style, icons, form styling, and message review flow. Adapt spacing and layouts to touch screens while retaining the contact table and its action column.

The app includes Login, Overview, Contacts, Schedule, and Sign out. Provider URL configuration stays on the web. Scheduling remains a server job: wishes continue when the phone is closed, offline, or powered off, provided the backend is running.

| Feature | Web | Android |
| --- | --- | --- |
| Admin login | Existing login | Same visual identity and credentials; mobile session |
| Overview and latest three celebrations | Existing | Matching cards adapted to phone width |
| Contacts with dynamic columns | Existing table | Horizontally scrollable native table |
| Add, edit, delete a contact | Existing | Matching forms and confirmations |
| SMS and voice actions | Existing | Same four action icons and greeting review |
| Search and cursor pagination | Existing | Reuse backend pagination, 25 rows per page |
| File import and clear dataset | Existing | Same controls with native document selection |
| Daily time, birthday/anniversary switches | Existing | Schedule screen with themed hour/minute/AM-PM controls |
| SMS and voice provider URLs | Web settings | No fields, credentials, or secret-bearing responses |

## Recommended implementation

- Add a separate `mobile/` application using React Native, Expo, and TypeScript. Select compatible stable Expo/React Native/package versions together when implementation begins.
- Use Expo Router for Login and the Overview/Contacts/Schedule tabs, with native screen transitions.
- Use React Native Reanimated and Gesture Handler for press feedback, screen transitions, and modal motion.
- Use Expo SecureStore for the mobile refresh credential; keep short-lived access tokens in memory. Do not store admin passwords or provider credentials in the APK or ordinary persistent storage.
- Use a query cache with request cancellation and explicit invalidation after mutations. Keep contact pages bounded; clear private cached data on logout or session expiry.
- Use native document selection and a file-streaming upload adapter. Verify Android content-URI handling and offset reads in an early development-build prototype before choosing the upload implementation.
- Use licensed bundled fonts that match the web's sans-serif body and italic serif headings. Segoe UI and Georgia are not assumed to be available or redistributable on Android.

Proposed structure:

```text
mobile/
  app/                 Login, tabs, form/review routes
  src/api/             Typed API client and mobile session handling
  src/features/        Overview, contacts, schedule, imports
  src/components/      Buttons, fields, table, badges, dialogs, toasts
  src/theme/           Colors, spacing, typography, motion tokens
  assets/              Logo, icons, licensed fonts
  app.config.ts
  eas.json
```

## Screen and interaction details

### Login

Recreate the current logo, orange gradient illustration, welcome copy, white rounded login card, email/password fields, visibility icon, and orange sign-in button. Stack the illustration above the card on phones; use a split layout on tablets. Handle the keyboard, safe areas, loading, incorrect credentials, and expired sessions. Returning from the background validates the session without flashing the login screen unnecessarily.

### Overview

Reuse the current dashboard content: welcome banner, contact total, today's celebration count, accepted wishes, failed-greeting review, and latest three celebrations. Use a two-column stat grid on normal phones and a wider layout on tablets. Any greeting setup summary may show configured/not-configured status without exposing URL values.

### Contacts

- Preserve a table, including imported dynamic columns, Status, and Action. Use horizontal scrolling for columns rather than shrinking text to fit. Keep header and rows aligned, use a sticky header, and preserve the horizontal position while paging.
- Render rows with a virtualized vertical list. Load 25 contacts per page with the existing signed cursor API; keep Previous/Next behavior and a bounded page cache.
- Use the existing three-character minimum and a short debounce for search; cancel stale requests and reset pagination when the query changes.
- Keep Pencil, SMS, Voice, and Trash as icon-only buttons in the Action column. Give each icon an accessible label and approximately 48 dp touch area; retain orange styling and the red delete treatment.
- Keep Add record, Import more, and Clear dataset in a wrapping toolbar. Put date-order selection in the import flow. Clear and delete require confirmation.
- Recreate Add/Edit forms with Name, Contact, Gender, DOB, Anniversary, active status, and imported extra columns. Use keyboard-aware scrollable dialogs on compact phones.
- SMS/Voice opens the current review flow: occasion and channel selectors, recipient, occasion date, preview, warnings, pending state, last attempt, and remaining manual allowance. Keep the backend's combined limit of two manual sends per number per rolling 24 hours.
- Sending and deleting require an explicit tap. Disable duplicate taps. Do not automatically retry send requests after a timeout; reconcile the result with the server before allowing another attempt.
- On resume, refetch the visible page and active review as needed so web edits and send limits are reflected.

### Schedule

Show daily send time as compact themed Hour / Minute / AM-PM controls, Automatic birthdays, Automatic anniversaries, and Save schedule. Use the existing stored business timezone internally; keep it out of the form as requested. Explain the effective schedule in a readable confirmation using the business time, rather than the phone's local timezone. A mobile schedule update changes the same shared schedule used by the web panel.

The phone does not set local alarms or run SMS scheduling. All provider requests remain on the server. If greeting URLs are missing, show a short instruction to configure them from the web panel; do not expose URL-editing controls.

## Backend additions required

Most feature endpoints are reusable. The existing cookie-based web login needs a separate mobile authentication flow.

1. Add mobile login, token refresh, session validation, and logout endpoints. Issue short-lived access tokens plus rotating refresh credentials stored as hashes in PostgreSQL. Revoke mobile sessions on logout and password rotation; reject reuse of an old rotated refresh credential.
2. Tag mobile sessions with a server-issued client type and permission scope. Apply authorization to every relevant endpoint; do not rely on an app-supplied header or hidden UI.
3. Permit mobile access to contacts, dashboard, import operations, greeting review/send, and schedule management. Reject mobile tokens on greeting-URL, provider configuration/test, and legacy template administration routes.
4. Add a restricted schedule response/update contract with only daily time and the two automatic switches. Preserve timezone and template associations on the server; prevent a mobile save from overwriting web configuration.
5. Return only a redacted greeting preview and safe configuration status to mobile. Exclude complete URLs, credentials, and provider query parameters from app payloads, logs, and error reports.
6. Add an idempotency key for manual send requests. A repeated request with the same key must return the original outcome and must not enqueue or charge a second send. Continue enforcing the manual allowance inside the transaction.
7. Reuse the existing cursor pagination, streaming import jobs, rate limits, and server scheduler. Add authorization, session-revocation, schedule-field isolation, and duplicate-send integration tests.

These restrictions prevent an issued mobile session from accessing provider configuration. Because the same admin credentials also sign in to the web, they do not prevent that administrator from separately using the web login. A stronger separation would require a distinct mobile account/role policy.

## File import and connectivity

Support CSV/XLSX selection, date order, progress, cancellation, and resuming with the same file. Stream file bytes in bounded chunks; never base64-encode or load the workbook into JavaScript memory. Persist only the upload ID, offset, and file identity needed for recovery. Confirm the Android file URI remains readable after process restart, or request reselection of the same file.

Android may suspend or terminate an app while uploading. The first release promises resumable uploads, not uninterrupted uploads while closed. Very large 35-50 GiB imports should use the web workflow until native file access, free storage, long-duration transfer, and background execution are proven on physical devices. Server-side import processing continues after a completed upload independently of the app.

Use a configured HTTPS API domain. The APK contains no database connection string or SMS/voice provider secret. Development devices use a reachable development API address; `localhost` on a physical phone does not address the development computer. Offline state disables mutations and sends, provides retry for reads, and does not queue messages for later automatic transmission.

## Motion and performance

- Use brief opacity/transform transitions, subtle button press feedback, and smooth dialog entry/exit. Prefer approximately 150-250 ms transitions; avoid animating every table cell.
- Respect Android's reduced-motion setting. Avoid continuous decorative animation during scrolling or network work.
- Render only the visible contact rows, memoize stable cells, and avoid loading all contacts into app memory.
- Fetch data for the active screen. Poll import progress only for an active job while the app is foregrounded; refresh on resume.
- Measure release-build scrolling, typing, navigation, and dialog interaction on a modest Android phone. Target responsive 60 fps interaction on the agreed baseline device; report measured results rather than promising identical performance on every device.

## Implementation order and completion gates

1. **Foundation and technical prototypes:** create the Expo/TypeScript app, theme, navigation, HTTPS configuration, table scrolling prototype, and Android document-streaming prototype. Confirm the compatible package set before building screens.
2. **Mobile API and login:** implement scoped sessions and secure storage, then reproduce login. Prove mobile tokens cannot read/edit provider configuration and password rotation revokes mobile sessions.
3. **Overview and Contacts:** implement dashboard, paginated table, search, Add/Edit/Delete, import progress, and the four action icons. Verify dynamic columns and portrait/landscape layouts.
4. **Greeting review and Schedule:** connect SMS/voice review, idempotent confirmation, shared manual limits, themed time selection, switches, and shared web/mobile schedule updates.
5. **Polish and device validation:** add motion, accessibility labels, readable font scaling, loading/empty/error states, safe-area and keyboard handling. Test slow networks, app termination, upload resume, repeated taps, expired sessions, and web/mobile concurrency.
6. **Android release:** configure the final package ID, icon, splash, versioning, and signing key. Produce an installable signed APK, verify installation/update on physical phones, and deliver the build configuration and signing-key backup instructions. Produce an AAB separately if Google Play distribution is later requested.

No release should claim 50 GiB mobile upload support or production readiness until the relevant physical-device and hosted-backend checks pass. Send tests use an approved test number and explicit confirmation.

## Reference documentation

- [Expo APK builds](https://docs.expo.dev/build-reference/apk/)
- [Expo internal distribution and signing](https://docs.expo.dev/build/internal-distribution/)
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [Expo DocumentPicker](https://docs.expo.dev/versions/latest/sdk/document-picker/)
- [React Native performance](https://reactnative.dev/docs/performance.html)
- [Reanimated reduced motion](https://docs.swmansion.com/react-native-reanimated/docs/device/useReducedMotion/)
