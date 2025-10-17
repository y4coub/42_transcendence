# Implementation Plan: FT Backend Core Services

**Branch**: `001-specify-scripts-bash` | **Date**: 2025-10-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-specify-scripts-bash/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement the Fastify + TypeScript backend supporting authentication (email/OAuth 42), real-time chat, tournaments/matchmaking, player profiles, and stats. Deliver REST + WebSocket endpoints documented in OpenAPI, enforce HTTPS/WSS via Caddy reverse proxy, persist all data in SQLite, and package deployment as a single Docker Compose stack.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript 5.x on Node.js 20  
**Primary Frameworks**: Fastify core, fastify-websocket, fastify-jwt, fastify-rate-limit, Zod adapters, Caddy reverse proxy  
**Storage**: SQLite (better-sqlite3) as single source of truth with custom migration runner  
**Validation Approach**: Manual smoke suites (Postman/Newman, Browser WS inspector, docker compose bring-up verification)  
**Target Platform**: Linux containers orchestrated via Docker Compose (proxy + api + sqlite)  
**Project Type**: Single backend service exposing REST + WS  
**Performance Goals**: Login flows <5s, chat delivery <1s, tournament generation <10s at 128 players, docs load <1s  
**Constraints**: HTTPS/WSS enforced, minimal runtime dependencies, rate limits per user/IP, Argon2id hashing, JWT rotation, no automated tests permitted  
**Scale/Scope**: Initial launch for single region, hundreds of concurrent players, tens of tournaments concurrently

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Module boundaries mapped to auth/chat/tournament/stats (Principle I).
- Security controls (HTTPS/WSS, Argon2id, JWT rotation, rate limiting, validation) addressed (Principle II).
- Dependency impact, plugin usage, and Docker footprint evaluated (Principle III).
- SQLite migration plan defined with single-source data ownership (Principle IV).
- OpenAPI and `/docs` updates scheduled with feature delivery (Principle V).
- Docker Compose changes (proxy/API/SQLite) prepared for rollout (Deployment constraint).

**Gate Status**: PASS — all planned modules align with constitutional requirements; migration tooling detail captured as Phase 0 research item.

## Project Structure

### Documentation (this feature)

```
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```
apps/
  api/
    src/
      auth/
      chat/
      matches/
      tournament/
      stats/
      users/
      plugins/
      infra/
        config/
        db/
        observability/
        security/
    tsconfig.json
openapi/
  openapi.yaml
docker/
  compose.yml
  proxy/
  api/
db/
  migrations/
docs/
  manual-validation/
```

**Structure Decision**: Keep all backend source under `apps/api/src/` with module folders (`auth`, `chat`, `matches`, `tournament`, `stats`, `users`) and shared `plugins` plus `infra/{config,db,observability,security}` directories. Contracts, deployment assets, migrations, and manual validation docs remain in their dedicated roots to uphold the constitution.

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | — | — |

## Module Breakdown

### Auth Module
- Fastify routes under `/auth/*` handling registration, login, logout, refresh, and 42 OAuth flow.
- JWT plugin configuration, refresh rotation logic, and Argon2id hashing utilities.
- Session persistence through `SessionToken` table and middleware enforcing current session.

### Chat Module
- REST endpoints for channel CRUD, DM entry points, block/unblock actions.
- WebSocket gateway (`/ws/chat/{channelId}`) broadcasting messages with rate limits and policy enforcement.
- Persistence via `ChatChannel`, `ChatMembership`, `ChatMessage`, and `BlockListEntry` tables.

### Tournament Module
- REST for tournament management, participant registration, and match reporting.
- Matchmaking queue processor (periodic job) pairing players and emitting WS notifications (`/ws/match/{matchId}`).
- Uses `Tournament`, `TournamentParticipant`, `MatchRecord`, and `MatchQueueEntry` entities.

### Stats Module
- Aggregates match outcomes into `PlayerProfile` and leaderboard computations.
- Provides `/users/{id}` profile endpoints and `/stats/leaderboard` summary route.
- Exposes derived metrics for frontend dashboards.

### Shared Infrastructure
- `plugins/` for rate limiting, CORS, JWT, helmet-like headers, and request validation via Zod schemas.
- `infra/security/` for HTTPS configuration, token utilities, OAuth client wrappers.
- `infra/observability/` for structured logging and metrics (pino transports, Prometheus exporters).

## Route & Channel Matrix

| Category | REST Routes | WS Channels | Notes |
|----------|-------------|-------------|-------|
| Auth | `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/token/refresh`, `/auth/42/*`, `/auth/me` | — | Requires HTTPS, rate limiting, Argon2id, JWT rotation |
| Users & Profiles | `/users/{id}`, `/users/{id}/stats` | — | Stats module reads aggregated data |
| Chat | `/chat/channels`, `/chat/channels/{id}/messages`, `/chat/dm/{userId}`, `/chat/block/{userId}` | `/ws/chat/{channelId}` | Block list enforced across REST + WS |
| Tournament | `/tournaments`, `/tournaments/{id}`, `/tournaments/{id}/participants` | `/ws/tournament/{id}` (notifications) | Bracket updates broadcast |
| Matches | `/matches` | `/ws/match/{matchId}` | Real-time match relay |
| Stats | `/stats/leaderboard` | — | Cached summary endpoints |
| Docs | `/docs` | — | Serves Swagger/Scalar UI flowing from `openapi.yaml` |

## Dependencies & Tooling
- **Fastify** core server with plugin registration per module.
- **better-sqlite3** for low-latency SQLite access; custom migration CLI.
- **Zod** for schema validation shared between REST and WS payloads.
- **Caddy** as Dockerized reverse proxy providing HTTPS/WSS termination and HTTP→HTTPS redirects.
- **fastify-jwt**, **fastify-rate-limit**, **fastify-cors**, **fastify-websocket** for security and communications.
- **argon2** library for password hashing (Argon2id parameters tuned per security guidelines).
- **pino** + optional Prometheus exporter for logging/metrics.
- **OpenAPI tooling** (`openapi-cli`, `scalar` or `redocly` CLI) to validate and render `/docs`.

## Manual Validation Plan
- Postman collection covering auth, chat REST flows, tournament creation, and stats queries.
- Browser-based WebSocket scripts to confirm channel broadcasting, match notifications, and block enforcement.
- Docker Compose smoke script verifying `proxy`, `api`, `sqlite` start and HTTPS route served.

## Constitution Re-check (Post-Design)
- Modular Fastify Architecture: ✅ modules defined with clear boundaries.
- Security Hardening: ✅ HTTPS/WSS, JWT, Argon2id, rate limits, validation integrated.
- Lightweight Scalability: ✅ Minimal dependencies, plugin system leveraged, Docker footprint documented.
- SQLite Source of Truth: ✅ Single database with migration runner defined.
- Documentation-First Delivery: ✅ OpenAPI file maintained, `/docs` workflow documented.
- Deployment Constraint: ✅ Single Docker Compose plan with Caddy + API + SQLite.

Gate status remains PASS.

