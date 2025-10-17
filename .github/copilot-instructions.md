# backend Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-10-16

> Constitution guardrails: enforce Fastify module boundaries, security controls, lightweight dependencies, SQLite migrations, documentation-first workflow, Docker Compose deployment, and manual validation (no automated tests).

## Active Technologies
- TypeScript 5.x on Node.js 20 (001-specify-scripts-bash)

## Project Structure
```
src/
├── modules/
│   ├── auth/
│   ├── chat/
│   ├── tournament/
│   └── stats/
├── plugins/
├── infra/
│   ├── security/
│   └── observability/
└── app.ts

openapi/
└── openapi.yaml

docker/
├── compose.yml
├── proxy/
└── api/

db/
└── migrations/
```

## Commands
- `npm run build`
- `npm run migrate:up`
- `npm run docs:generate`
- `docker compose -f docker/compose.yml up`

## Code Style
TypeScript 5.x on Node.js 20: Follow standard conventions

## Recent Changes
- 001-specify-scripts-bash: Documented Fastify modular layout, manual validation workflow, and OpenAPI-first process

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
