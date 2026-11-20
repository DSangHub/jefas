# Jefas.app Full-Stack Starter

Spanish-first, voice-first assistant with three routed personas:
- **Sofía**: money organization
- **Valentina**: delegated actions
- **Isabella**: information and research

## Included
- Voice input and spoken answers in the browser
- Registration, login, profiles, and sessions
- Server-side encrypted API-key vault
- OpenAI, Gemini OpenAI-compatible, and Anthropic adapters
- Proxic and SkorUp task adapters
- Approval gate for payments, purchases, reservations, sending, signing, deletion, and similar actions
- Zero npm dependencies, Node 20+

## Run locally
1. Copy `.env.example` to `.env`.
2. Set `APP_SECRET` to a long random value.
3. Export the variables or load them through your host.
4. Run `npm start`.
5. Open `http://localhost:3000`.

Node does not automatically read `.env`; Vercel/Render/Railway environment settings are recommended. For local shell use: `set -a; source .env; set +a; npm start`.

## Proxic and SkorUp contract
This starter sends approved tasks to:
- `POST $PROXIC_BASE_URL/tasks`
- `POST $SKORUP_BASE_URL/tasks`

Headers: `Authorization: Bearer <API_KEY>` and `Content-Type: application/json`.
Body: `{ "request": "...", "userId": "..." }`.

If your actual APIs use different routes or authentication, edit `callConnector()` in `server.js`.

## Production checklist
- Replace the JSON file store with PostgreSQL.
- Replace in-memory sessions with Redis/database sessions.
- Put secrets in Vercel/hosting environment variables, never GitHub.
- Add email verification, password reset, rate limits, CSRF protection, audit logs, and privacy/terms pages.
- Use a regulated provider for bank connections; do not collect bank passwords.
- Confirm every financial/external action before execution.

## Vercel note
This persistent Node server and local JSON database are best deployed first on Render, Railway, Fly.io, or a VPS. For Vercel, convert API routes to serverless functions and use an external database.
