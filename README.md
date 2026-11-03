# WishYou

An admin panel for importing dynamic contact spreadsheets and sending birthday or anniversary wishes by SMS and hosted-audio voice calls.

## Stack

- `frontend/`: React, Vite, Tailwind CSS, Phosphor icons
- `backend/`: Node.js, Express.js
- PostgreSQL

## Run locally

1. Create a PostgreSQL database and set its connection string in `backend/.env`. Copy `backend/.env.example` first. For a local development database, run `docker compose -f compose.local.yaml up -d` if Docker is available.
2. Generate a 32-byte encryption key with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and paste it into `CONFIG_ENCRYPTION_KEY`.
3. Set a long random `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`. The admin account is created on the first API start.
4. Run `npm install`, create a Python virtual environment at `backend/.venv`, and install `backend/requirements.txt` into it. On Windows: `python -m venv backend/.venv` then `backend/.venv/Scripts/python -m pip install -r backend/requirements.txt`. Run `npm run dev` from the project root.
5. Open `http://localhost:5173`. The API runs at `http://localhost:4000`.

The database tables are created automatically by the API at startup. Keep `.env` private and back up the database before production use. On restart, changing `ADMIN_PASSWORD` updates the configured admin's password and invalidates older sign-in sessions. Only the configured `ADMIN_EMAIL` can sign in.

The Contacts list uses cursor pagination (25 rows by default). Exact search totals are calculated when a search starts or this admin changes its data, then reused while paging through that search. Overview, Contacts, and Settings fetch their own data; import progress is checked every three seconds only while a job is active. The first start after this update builds additional PostgreSQL indexes concurrently and counts existing sent and failed deliveries once for the dashboard counter. On an existing large database, allow time and disk space for this one-time work before the API becomes ready.

## First-use flow

1. Sign in with the admin credentials from `.env`.
2. Choose the file's date order and upload a CSV or `.xlsx` file, or use **Add record** to enter a contact manually. The manual form includes name, contact number, gender, birthdate, anniversary, and active status. It follows existing imported columns and creates a default dataset when no file has been uploaded. A name, valid phone number, and at least one occasion date are required. Uploads are resumable and the Python/psycopg2 importer runs in the background. Phone and event-date columns are detected automatically; all spreadsheet headers appear as dynamic table columns. Every sheet in an `.xlsx` file must use the same headers.
3. In **Settings**, paste a complete provider URL into any of the four greeting cards: birthday SMS, birthday voice call, anniversary SMS, or anniversary voice call. Include `{phone}` as the recipient placeholder or use a `phone`/`number` query parameter. Use `{name}` or `[alp]` in SMS text when the contact name should change per recipient. The complete URL is encrypted in PostgreSQL.
4. Add a short message or voice description in each card for the send preview. Voice calls need a complete provider URL that references the hosted recording as required by the voice provider.
5. Enable daily automatic wishes in Settings, or review and send an individual greeting from Contacts.
6. For an individual greeting, reopen the contact's SMS or voice review to see its latest provider response.

Saving a URL does not send a message or call. Sending occurs through a contact action or an enabled automatic schedule.

## Deploy with Coolify on Hostinger VPS

1. Add this repository as a **Docker Compose** application in Coolify. Use `compose.yaml` as the Compose file and keep the normal managed Compose mode (not Raw). Route the public HTTPS domain to the `web` service on port **80**. Keep `api` and `postgres` private; the web server proxies `/api` to the API.
2. Set every required value in `deploy.env.example` as a Coolify environment variable. Generate independent random secrets. Use a URL-safe hexadecimal PostgreSQL password because Compose places it in the database URL. Set `WEB_ORIGIN` to the exact public `https://` origin, without a trailing slash. Never deploy the development `.env` file.
3. Allocate persistent storage for `wishyou_pgdata` and `wishyou_uploads`. The database has no published host port. Keep one API service replica; it runs the importer and scheduled sender. The API has a 90-second stop grace period so active provider requests can drain during redeployment.
4. After deployment, check `https://your-domain.com/api/health` for `"ok":true` and all worker checks true, then sign in and verify Settings and Contacts. The health endpoint reports database, importer, delivery worker, and scheduler readiness; a failing worker makes the service unhealthy. Test only with a provider-approved test number before enabling automatic wishes. Check the Overview panel for failed greetings.
5. Back up PostgreSQL regularly from the host or a trusted backup job, for example `docker compose exec -T postgres pg_dump -U wishyou -Fc wishyou > backup.dump` in the deployed Compose project. Store encrypted copies **off the VPS**. Back up the upload volume while an import is in progress; a completed import removes its uploaded file. Test restoring to a separate database before relying on a backup. Keep the encryption key with the backup; without it, saved provider URLs cannot be decrypted.

Before enabling automatic wishes, run a staging deployment on the target VPS. Verify the Compose health checks, a CSV and XLSX import, an upload interrupted and resumed, cancellation of an unfinished upload, a database backup and restore, and one scheduled send to a provider-approved test number. Measure upload throughput, PostgreSQL disk and WAL growth, import activation time, and provider request throughput with a representative dataset. The 50 GiB upload limit is not a guarantee that a particular VPS can finish a 50 GiB import.

For a 35–50 GiB workbook, provision disk for the uploaded file, expanded XLSX data and temporary shared strings, both the old and new contact data during replacement, indexes, PostgreSQL WAL, and backups. Upload time depends on the browser and network; 50 GiB cannot be guaranteed to upload quickly. Start with a representative 100,000-row import and measure disk, memory, import time, and provider throughput on the actual VPS before importing the full file. Keep the VPS online through the scheduled time; the scheduler catches up later on the same local day after a restart, but does not backfill previous days.

## Current integration limits

- Complete greeting URLs are sent as HTTPS GET requests. The recipient query parameter is replaced for each contact. HTTP success plus no explicit failure in the response body means **provider accepted**, not confirmed phone delivery. Only HTTP 429 is retried automatically; ambiguous failures need review to avoid accidental duplicate wishes. Confirmed delivery requires the provider's delivery receipt API/webhook contract and credentials, which are not supplied here.
- Voice provider URLs must include whatever hosted audio URL or recording reference that provider requires.
- CSV/XLSX uploads are accepted up to 50 GiB in 16 MiB resumable chunks. The upload is written to disk rather than held in Node.js memory; the Python importer streams rows and uses psycopg2 `COPY` in bounded batches. The included Nginx accepts 20 MiB chunks. Provide free disk space for the upload, PostgreSQL staging data, the final contact table, and PostgreSQL WAL. A 35–50 GiB transfer and import may take a long time; its speed depends on network, disk, workbook structure, and database capacity.
- The importer uses a rebuildable unlogged PostgreSQL staging table to reduce WAL during parsing. After a PostgreSQL crash, the uploaded file is used to rebuild staging; the final contact activation still writes WAL and must be capacity-tested on the target VPS.
- Only one upload or import runs at a time to avoid overlapping large staging and WAL usage. An unfinished upload can be resumed with the same file or canceled from Contacts before starting another. The upload volume is checked before admission; the PostgreSQL volume still needs separate capacity monitoring during a large import.
- A failed import keeps its error report but releases the uploaded file. The administrator can dismiss the failed import from Contacts; stale failed job records are removed after seven days.
- `.xlsx` worksheets have Excel's row limit, so very large workbooks need multiple sheets with identical headers. CSV is the faster choice for bulk data. The importer caps a single row at 16 MiB and expanded workbook data at `IMPORT_MAX_EXPANDED_GB` (default 500 GiB) to protect the server.
- Large `.xlsx` shared string tables spill to a temporary SQLite file after `IMPORT_SHARED_STRING_MEMORY_MB` (default 32 MiB). This keeps memory use bounded but requires more disk and can make `.xlsx` parsing slower than CSV.
- Date order is selected before upload so slash dates like `10/11/2026` are interpreted consistently. ISO dates (`YYYY-MM-DD`) and real Excel date cells work with either selection. Duplicate phones keep the first row in file order.
- Replacing a dataset leaves the old contacts available until the new import succeeds. Prior campaign and delivery records are retained so yearly duplicate checks still work after replacement. Clearing the dataset explicitly still removes contacts, campaigns, and delivery records.
- Automatic campaigns select recipients inside PostgreSQL without loading the full contact list into Node.js. The sender claims work in batches of 20, sends at most five requests concurrently, and uses PostgreSQL to share a rate limit across running API processes. Set `SMS_RATE_PER_SECOND` and `VOICE_RATE_PER_SECOND` in `backend/.env` to values allowed by your provider; defaults are 5 SMS/s and 1 voice call/s (supported range 0.1–100/s). An interrupted provider request has an unknown delivery result and is marked for review after five minutes rather than being resent automatically.
- Throughput is limited by the provider: at 5 SMS/s, 100,000 messages take at least about 5 hours 34 minutes, before retries and gateway delays. Plan campaigns and provider capacity around the number of contacts sharing one date.
- The import activation still copies staged contacts and replaces the old dataset in one PostgreSQL transaction. This protects the old dataset on failure but can require substantial WAL, disk, and time at 50 GiB. The maximum upload size is a limit, not a verified performance guarantee on a specific Hostinger VPS.
