# Research — FT Backend Core Services

## Migration Tooling for SQLite (NEEDS CLARIFICATION)
- **Decision**: Store forward-only SQL migration files under `db/migrations/` and execute them with an in-house migration runner using `better-sqlite3` within a CLI command.
- **Rationale**: Keeps dependencies minimal (aligns with constitution), offers full control of schema changes, and works seamlessly with Dockerized deployments.
- **Alternatives Considered**:
  - `drizzle-kit`: rich tooling but adds ORM dependencies beyond requirements.
  - `knex` migrations: mature but introduces heavier abstraction and runtime footprint.

## Fastify Plugin Strategy
- **Decision**: Use Fastify's plugin system per module (`auth`, `chat`, `tournament`, `stats`) with shared plugins for security (CORS, rate limit, JWT) registered in `src/plugins/`.
- **Rationale**: Matches Principle I modular architecture while allowing hot-swappable features.
- **Alternatives Considered**: Monolithic server file (creates coupling), microservice split (overkill for current scope).

## WebSocket Implementation Details
- **Decision**: Utilize `fastify-websocket` for chat and match relay channels with per-connection auth checks and rate limits.
- **Rationale**: Native integration with Fastify request lifecycle and minimal additional dependencies.
- **Alternatives Considered**: `socket.io` (heavier, extra protocol), `uWebSockets.js` (performance gains but diverges from Fastify ecosystem).

## Manual Validation Approach
- **Decision**: Prepare Postman collection + cURL snippets, plus browser-based WS inspector scripts for smoke tests; document steps in `quickstart.md`.
- **Rationale**: Satisfies constitution's no-automated-tests rule while ensuring reproducible release validation.
- **Alternatives Considered**: Automated integration test suites (disallowed), ad-hoc manual testing without documentation (hard to reproduce).
