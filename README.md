# ft_transcendance

Full-stack implementation of the ft_transcendance project. The repository hosts a Fastify + TypeScript backend, a Vite-powered TypeScript frontend, and forward-only SQLite migrations.

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Technology Stack](#technology-stack)
3. [Prerequisites](#prerequisites)
4. [Environment Configuration](#environment-configuration)
5. [Local Development](#local-development)
6. [Available Scripts](#available-scripts)
7. [Database & Migrations](#database--migrations)
8. [Troubleshooting](#troubleshooting)
9. [License](#license)

---

## Project Structure

```
ft_transcendance/
├─ apps/
│  ├─ server/                 # Fastify API (TypeScript, better-sqlite3)
│  └─ frontend/               # Vite + TS SPA (stateful custom components)
├─ db/
│  └─ migrations/             # Forward-only SQL migration scripts
├─ README.md
└─ ...
```

Backend source lives under `apps/server/src`. Frontend source is under `apps/frontend/src`.

---

## Technology Stack

- **Backend**: Fastify, TypeScript, Zod, better-sqlite3, Argon2, Fastify WebSocket
- **Frontend**: Vite, TypeScript, TailwindCSS
- **Auth**: JWT (access & refresh tokens), optional OAuth 42 integration, TOTP-based 2FA
- **Database**: SQLite (embedded) managed with forward-only migrations

---

## Prerequisites

| Tool              | Version / Notes                                      |
|-------------------|------------------------------------------------------|
| Node.js           | >= 20 (LTS recommended). v22 works after rebuilding native deps. |
| npm               | Ships with Node (npm ≥ 10 recommended).              |
| SQLite utilities  | Optional; useful for local inspection of the DB file.|
| OpenSSL           | Required to generate secrets referenced in `.env`.   |

If you switch Node versions (e.g., with `nvm`), reinstall dependencies to rebuild native modules such as `better-sqlite3`.

---

## Environment Configuration

Backend configuration lives in `apps/server/.env`. A fully annotated template is provided:

```bash
cp apps/server/.env.example apps/server/.env
```

Important sections to review:

- **Application**: `NODE_ENV`, `API_HOST`, `API_PORT`, `API_LOG_LEVEL`, `TRUST_PROXY`
- **Database**: `DATABASE_URL` (defaults to `file:./db/data/app.db`)
- **JWT Secrets**: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, TTLs
- **Two-Factor Auth**: encryption key, recovery code settings, trusted device secrets
- **OAuth 42**: Client ID/secret and redirect URI used by the frontend
- **CORS / Rate Limiting**: adjust allowed origins or IP allowlist

Use the commands written in the template comments (`openssl rand ...`) to generate production-ready secrets.

---

## Local Development

### 1. Backend (Fastify API)

```bash
cd apps/server
npm install        # installs dependencies & compiles native modules
cp .env.example .env
npm run migrate:up # create/update the SQLite schema
npm run dev        # start Fastify with hot reload (default port: 3000)
```

The API exposes a `/healthz` endpoint for quick status checks. Update `.env` before first launch to point to the desired database location and to configure OAuth/2FA secrets.

### 2. Frontend (Vite SPA)

```bash
cd apps/frontend
npm install
npm run dev        # Vite dev server (default port: 5173)
```

The SPA expects the backend to run on `http://localhost:3000` and to use the same secrets documented in the API `.env` file (notably the OAuth 42 redirect URI).

---

## Deploy with Docker + HTTPS

A dockerised stack is available for HTTPS-ready local or remote hosting.

1. Generate a self-signed certificate (defaults to `localhost`):
   ```bash
   make certs
   # or override the host name / validity days
   SERVER_NAME=your.dev.host CERT_DAYS=30 make certs
   ```
2. Build the frontend/backed images and start the stack:
   ```bash
   make build   # docker compose build
   make up      # docker compose up -d
   ```
3. Visit `https://localhost` (HTTP requests on port 80 are redirected to HTTPS). The backend remains available on `http://localhost:3000` for health checks and tooling.

The frontend container transparently proxies `https://<host>/api` and WebSocket traffic to the backend. Persistent SQLite data lives in the `backend_data` docker volume; remove it with `make clean` if you need a fresh database.

---

## Available Scripts

### Backend (`apps/server`)

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Fastify in watch mode using `tsx` |
| `npm run build` | Type-check with `tsc` and bundle via `tsup` into `dist/` |
| `npm run start` | Run the compiled build (`dist/app.js`) |
| `npm run migrate:up` | Execute all forward-only SQLite migrations |
| `npm run twofa:maintenance` | Maintenance helper for expiring 2FA artifacts |
| `npm run lint` | Run ESLint against the TypeScript source |
| `npm run format` | Check formatting with Prettier |
| `npm run dev:detached` / `npm run dev:stop` | Launch/stop the dev server in the background |
| `npm run test:smoke` | Manual smoke entry point (script must exist in `tests/`) |

### Frontend (`apps/frontend`)

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server with hot module reloading |
| `npm run build` | Type-check and create a production build |
| `npm run preview` | Preview the production build locally |

---

## Database & Migrations

- Migrations live under `db/migrations/` and are applied in filename order.
- Run `npm run migrate:up` from `apps/server` whenever new migrations land.
- The default SQLite database file is relative to the API project (`file:./db/data/app.db`). Update `DATABASE_URL` if you need an alternate location or storage engine.
- For manual inspection, open the database file with `sqlite3 db/data/app.db`.

---

## Troubleshooting

**better-sqlite3 binding error (`Could not locate the bindings file`)**

- Occurs when the native addon was compiled for a different Node ABI.
- Fix by rebuilding after switching Node versions:

  ```bash
  cd apps/server
  npm rebuild better-sqlite3
  # or reinstall everything
  rm -rf node_modules package-lock.json
  npm install
  ```

**Port conflicts**

- API defaults to `3000`, frontend to `5173`. Adjust via `.env` (backend) or Vite config (frontend) if they collide with other services.

**OAuth 42 callback failures**

- Ensure the redirect URI in the 42 dashboard matches `OAUTH42_REDIRECT_URI`.
- When running both servers locally, the usual setup is `http://localhost:5173/`.

---

## License

This project is distributed for educational purposes within the ft_transcendance curriculum. Review the LICENSE file (if provided) or consult project maintainers before using the code elsewhere.
