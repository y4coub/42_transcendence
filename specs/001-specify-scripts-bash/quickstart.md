# Quickstart — FT Backend Core Services

## Prerequisites
- Docker 24+
- Docker Compose v2
- Node.js 20 (for local tooling)
- 42 Intra OAuth client credentials available as environment variables

## Environment Setup
1. Copy `.env.example` to `.env` and populate:
   - `JWT_ACCESS_SECRET`
   - `JWT_REFRESH_SECRET`
   - `OAUTH42_CLIENT_ID`, `OAUTH42_CLIENT_SECRET`, `OAUTH42_REDIRECT_URI`
   - `TWOFA_ENCRYPTION_KEY` (64 hex chars)
   - `TWOFA_TRUSTED_DEVICE_SECRET`, `TWOFA_TRUSTED_DEVICE_TTL_DAYS`, `TWOFA_TRUSTED_DEVICE_MAX`
   - `CADDY_EMAIL` for automated certificates (if using production domains)
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build TypeScript artifacts:
   ```bash
   npm run build
   ```

## Database Migration
```bash
npm run migrate:up
```
This runs the custom migration runner applying SQL files in `db/migrations/` using `better-sqlite3`.

## Documentation Workflow
1. Update `openapi/openapi.yaml` when routes change.
2. Regenerate `/docs` assets and the bundled spec (mirrors `openapi/openapi.yaml`):
   ```bash
   npm run docs:generate
   ```
3. After the stack is running, verify documentation endpoints:
   - `http://localhost/openapi.yaml` returns the raw YAML specification.
   - `http://localhost/docs` renders the interactive Scalar viewer.

## Running the Stack
```bash
docker compose -f docker/compose.yml up --build
```
Services started:
- `proxy`: Caddy reverse proxy terminating HTTPS/WSS
- `api`: Fastify service (exposes REST + WS)
- `sqlite`: Persistent volume for the database

### Manual Validation Checklist (excerpt)
1. Login via email/password using Postman; confirm 200 with tokens.
2. Complete 42 OAuth callback; ensure profile created and tokens issued.
3. Enroll TOTP 2FA, trigger login challenge, and verify trusted device bypass via `docs/manual-validation/2fa.md`.
4. Join channel via REST, open WebSocket to `/ws/chat/{channel}`; send message and verify cross-client delivery.
5. Create tournament and register test accounts; watch bracket notifications over WS.
6. Hit `http://localhost/docs`; confirm endpoints reflect latest contracts, and optionally download `http://localhost/openapi.yaml` to ensure it matches the repository version.

## Shutdown
```bash
docker compose -f docker/compose.yml down
```
Use `--volumes` to reset SQLite during local testing.
