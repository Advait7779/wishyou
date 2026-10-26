# WishYou.com project plan

## Goal

Build a premium orange-and-white admin panel for importing contacts and sending birthday and anniversary wishes by SMS and voice call. Complete the admin panel and backend before starting any APK work.

## Agreed technology

- Frontend: React, Vite, Tailwind CSS, and Phosphor icons.
- Backend: Node.js and Express.js.
- Database: PostgreSQL.
- Current implementation: JavaScript across the stack, SQL tables accessed through `pg`, and a PostgreSQL-backed delivery queue for scheduled sends. Versioned migrations can be added as the schema evolves.

## Core workflow

1. An admin signs in and uploads a CSV or Excel (`.xlsx`) file from their computer.
2. Choosing a file imports it immediately. The system detects phone, birthdate, and anniversary columns, saves valid rows in PostgreSQL, and reports skipped invalid or duplicate rows.
3. The contacts table shows the uploaded spreadsheet's headers and values dynamically, including any extra columns. Anniversary is optional.
4. The admin pastes complete ready-made provider URLs into four Settings cards: birthday SMS, birthday voice call, anniversary SMS, and anniversary voice call. Complete URLs are encrypted in PostgreSQL.
5. The admin enables automatic birthday and anniversary wishes and chooses the daily send time in Settings.
6. For an individual greeting, the admin opens the SMS or voice action on a contact, reviews it, and confirms the send. Direct sends are limited to two per phone number in a rolling 24 hours.
7. The backend records delivery attempts and provider responses for automatic and individual sends.

## Admin panel pages

| Page | Main functions |
| --- | --- |
| Dashboard | Today's birthdays and anniversaries, upcoming events, sending totals, failures, and quick actions. |
| Contacts | Upload CSV/XLSX and view the saved table. Search, edit, replace or clear the dataset, and review and send individual SMS or voice greetings. |
| Settings | Four complete greeting URLs with preview text, timezone, editable send time, and automatic birthday/anniversary switches. |
| Admin account | Sign-in, password management, and basic access control. |

## Backend modules and data

- `admins`: account and authentication data.
- `contact_datasets` and `dataset_columns`: the active upload and its ordered spreadsheet headers, display types, and mappings to required sending fields.
- `contacts`: normalized phone number and mapped birthdate/anniversary for reliable sending, plus all original spreadsheet values stored as PostgreSQL `JSONB`. This preserves every uploaded column without running a database migration for each file.
- `imports` and `import_rows`: uploaded file metadata, mapping, validation results, and import outcome.
- `wish_templates`: occasion (`birthday` or `anniversary`), channel (`sms` or `voice`), preview text, encrypted complete provider URL for Settings cards, and active status.
- `campaigns`: internal records for automatic and individual greeting sends.
- `deliveries`: one row per contact/channel/occasion/send date, provider request ID, attempts, timestamps, status, and error summary.
- `manual_contact_sends`: rolling 24-hour allowance for direct contact actions, keyed by phone number.
- `audit_logs`: important admin changes and send actions.

API groups: `/auth`, `/contacts`, `/greeting-urls`, `/settings`, and `/dashboard`. Validate all input and paginate table endpoints.

## Dynamic spreadsheet columns and reset behavior

- The active dataset defines the visible table columns. Keep the spreadsheet's header spelling and column order; reject blank or repeated headers during import.
- Store each row's original values in `JSONB` and store the column definitions separately in PostgreSQL. The panel therefore shows the same columns as the file, while indexed phone and event-date fields support sending and filtering.
- A new upload can have more or fewer columns. The admin confirms replacement when an active dataset exists. Replacement swaps in the new rows and column definitions together, avoiding a partly updated table.
- **Clear dataset** removes the current contacts and their column definitions, leaving an empty table ready for an unrelated file. Provider settings and wish templates remain available. Any personal data in delivery records must be handled by the chosen retention/reset policy.
- Sending requires an automatically detected phone column and at least one detected event-date column. Other columns remain fully optional and appear automatically.

## Sending rules

- Use the configured business timezone for birthdays, anniversaries, schedules, and the dashboard.
- Let the admin choose the daily time for recurring birthday and anniversary wishes. Individual contact actions send immediately after confirmation.
- Prevent duplicate wishes to the same contact for the same occasion, channel, and year unless an admin explicitly resends.
- Queue automatic and individual work so the browser does not need to stay open. Respect provider rate limits and retry temporary failures with a cap.
- Skip invalid, inactive, or opted-out contacts and show the reason in the preview.
- Treat February 29 birthdays and date formats as explicit settings, not implicit guesses.
- Keep credentials server-side. Do not log complete secrets or unnecessarily expose contact data.

## Build order

1. **Foundation:** set up frontend, Express API, PostgreSQL schema/migrations, authentication, shared validation, and the orange-and-white design system.
2. **Contacts and imports:** CSV/XLSX parsing, dynamic column metadata, automatic field detection, immediate database save, replace/reset flows, and a dynamic contacts table.
3. **Settings and templates:** Four ready-made greeting URL cards, birthday/anniversary message options, and dropdown selection.
4. **Bulk sending:** campaign preview, background queue, manual sending, retries, duplicate protection, and delivery history.
5. **Automatic wishes:** daily event matching, scheduling controls, timezone/send window, and operational dashboard.
6. **Release checks:** import edge cases, provider failure handling, access control, responsive UI, deployment configuration, and backup/restore notes.
7. **Later phase:** APK after the admin panel and backend are complete and verified.

## Acceptance criteria for the first release

- Admin can import a large CSV/XLSX in one step, see skipped-row feedback, and see all valid contacts in a table with the uploaded column names and order, including detected birthday and anniversary columns.
- Admin can clear the dataset and its columns, then upload a file with different columns and see the table adapt exactly to that file.
- Admin can save multiple birthday and anniversary SMS messages or hosted voice audio URLs and select one from a dropdown.
- Admin can save complete birthday and anniversary SMS and voice URLs in Settings; saved URLs persist after refresh and are selected for sending.
- Admin can preview recipients, send test wishes, and run a bulk campaign without duplicate sends.
- Admin can inspect delivery status and failed attempts, and scheduled wishes run on the chosen dates at an editable send time.
- The interface is responsive and uses a premium orange-and-white visual style with Phosphor icons.

## Inputs needed before provider integration

- The supplied SMS example establishes the `key`, `route`, `sender`, `number`, `sms`, and `templateid` request format. Its live key must remain outside source control. A safe provider response example is still needed to distinguish accepted requests from provider-level failures.
- Voice-call API documentation or URL, including authentication, request body, and example success/failure responses, when voice integration begins.
- A hosted voice audio URL for each voice option. The calling provider still needs an API that can play that URL to recipients.
- Default sending timezone and the intended rule for February 29 birthdays. Send time is configurable in the admin panel.
- One sample import file or its column headers for checking the dynamic mapping workflow.
