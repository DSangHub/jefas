# Jefas.app

Spanish-first voice assistant, retaining the existing vanilla-JavaScript UI and
Node HTTP server. No framework migration. Postgres replaces the local JSON file,
process-local sessions, and user-provided API-key vault.

## Infrastructure and deployment

1. Connect an isolated Postgres database to each Vercel environment. Marketplace
   injection supplies the server-only `DATABASE_URL`; do not paste credentials
   into Git or the browser. Production and preview must not share user data.
2. Set provider/connector environment variables from `env.example` in Vercel.
   Enter secret values directly in the project's Environment Variables page.
   Never use `PUBLIC`, `VITE`, or `NEXT_PUBLIC` prefixes for credentials.
3. Set `PHOTO_LAB_ERAS` to the four comma-separated era identifiers from the
   intended design. Photo Lab stays unavailable until all four are configured.
   This repository has no pre-existing Photo Lab UI; no replacement design is
   invented. `public/photo-lab-api.js` is the same-origin client adapter ready
   to connect to that UI.
4. Review and merge the infrastructure PR. Vercel's build runs syntax/tests and
   transactional, advisory-locked migrations before deploying. Migrations only
   add new tables; existing local `data/db.json` is not automatically imported.
   No production JSON data existed in the previously crashing Vercel app. If you
   have local data to retain, arrange a reviewed import before onboarding users.

For local development, install with `npm ci`, set `DATABASE_URL` in your shell
(or an ignored `.env` file), run `npm run migrate`, then `npm start`. With Node
20.6+, `node --env-file=.env server.js` can load the file. Don't publish it.
`npm run build` performs syntax checks and the test suite; `npm run migrate`
applies the actual database schema. There is no frontend compilation step.

## Authentication and data isolation

- Passwords use asynchronous PBKDF2-SHA256 (210,000 iterations, unique salts).
- Sessions are random 256-bit opaque tokens; only SHA-256 hashes are stored in
  Postgres, with seven-day expiry. Cookies are HttpOnly, SameSite=Lax, and Secure
  in production. Logout revokes the session. Restarting a server keeps sessions.
- Opaque database sessions require no signing secret; the previous APP_SECRET
  development fallback and encrypted user-key vault are removed entirely.
- All private API routes derive user IDs from the session, not request bodies.
  SQL is parameterized and owner/participant scoped. `/app` redirects signed-out
  visitors. The public shell contains no private data; its authenticated panels
  only populate from protected APIs.
- Mutating browser requests require same-origin in production. `APP_ORIGIN` is
  optional; leave unset to support each preview's own origin. Cross-site Origin
  and Fetch Metadata requests are rejected. There are no CORS allowances.
- Persistent per-email authentication throttling: ten attempts per 15 minutes.
  AI operations share a per-user limit of 20 reservations per rolling day.
- Requests are size bounded. Upstream details, credentials and stacks are not
  returned to the browser. Provider requests have timeouts. Provider keys are
  only read from server environment variables, never accepted by `/api/keys`.

## Authenticated API contracts

All JSON responses use `Cache-Control: no-store`. On errors, clients receive
`{error}` with an appropriate 4xx/5xx status. Body-supplied owner IDs are ignored.

- `POST /api/auth/register`: `{email,password,name}`; `POST /api/auth/login`:
  `{email,password}`; `POST /api/auth/logout`. The first two set a session cookie.
- `GET /api/me`: own profile and configured provider names, never credentials.
- `PUT /api/profile`: `{name,language,voice,provider}` for the current user.
- `GET|POST /api/schools`: own records; creation takes `{name}`.
  `PUT|DELETE /api/schools/:id` enforces ownership. Schools are private entries,
  not an invented shared directory or permission system.
- `GET|POST /api/friends`: related requests; creation takes `{userId}` of the
  intended recipient. `PUT /api/friends/:id` takes `{status:'accepted'|'rejected'}`
  and only the pending request's recipient can act. Participants may `DELETE`.
- `GET|POST /api/chats`: participant chats; creation takes optional `{title,friendId}`.
  New friend chats require accepted friendship. Existing participant history is
  retained when a friendship is removed.
- `GET|POST /api/chats/:id/messages`: participant-only messages. Creation takes
  `{content}`; sender ID and role are server-assigned. Reads return the latest
  100 chronologically; optional `?before=<ISO timestamp>` fetches earlier pages.
- `POST /api/chat`: existing assistant API `{message,provider?,chatId?}`.
  Creates or continues an owner-only assistant chat, stores both messages and
  AI generation status. It remains single-turn provider prompting, matching the
  original app; it does not silently send all private history to a provider.
- Existing approval routes persist pending decisions. Approval atomically leaves
  `pending` before calling a connector, preventing duplicate execution. Connector
  failure records `failed` (no automatic retry of possibly executed actions).
- `GET /api/photo-lab/config`: configured four era IDs.
- `POST /api/photo-lab/generate`: `{era,image,requestId}` where `image` is a
  PNG/JPEG/WebP data URL up to 2 MB and `requestId` is a client-generated UUID.
  Calls OpenAI image edits **only on the server** using `OPENAI_API_KEY` and
  `PHOTO_LAB_MODEL`. No external image URL fetch or arbitrary provider URL.
  Reusing an ID returns the original generation without another provider call.
  In-flight duplicates return 202. Keep the request ID to poll after timeouts.
- `GET /api/generations`: own recent metadata (100 maximum);
  `GET /api/generations/:id`: own status/result. Pending jobs older than five
  minutes are marked interrupted when polled. There is no fabricated success or
  automatic billable retry. Original uploads are not retained; their hashes are.
  Generated PNGs are stored privately in Postgres JSONB for this initial rollout.
  At larger volume, move image payloads to private object storage with lifecycle
  retention rather than growing database storage indefinitely.

The existing UI now reports loading/failure states for auth, profiles, approvals
and AI requests. Social APIs are backend-only: no new social screens were invented.

## Checks and preview verification

`npm run build` runs syntax validation plus real PostgreSQL-engine tests using
PGlite (no database credentials required). Tests cover migrations/constraints,
sessions across HTTP server instances, expiry/logout, CSRF, owner/participant
isolation, friendships, chats, provider failures, Photo Lab idempotency and private
outputs. AI provider calls are mocked only in tests, not application routes.

The preview has a separate empty database. The signed-out landing page and invalid
registration validation can be browser-checked without an account. There are no
seeded credentials, preview auth bypass, or documented test account; authenticated
browser checks need a tester to create an account using their own password.
Live AI verification additionally requires the operator's configured provider key
and the actual four era IDs. No live paid generation is part of the test suite.

Before broader public release add email verification, password recovery, abuse
controls beyond per-account limits, legal/privacy policies, retention/deletion
workflows and monitoring. A connector's `/tasks` contract must be confirmed with
its provider before enabling real external actions.
