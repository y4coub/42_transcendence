# ft_transcendence Backend

Spec-driven Fastify + TypeScript backend scaffolded via Spec-Kit. The repository follows the constitution’s modular layout and documentation-first workflow.

## Project Layout

```
apps/
  api/                # Fastify service (source in src/)
  web/                # Frontend placeholder (not covered here)
db/migrations/        # SQLite forward-only migrations
docker/               # Dockerfiles and compose stack (proxy, api, sqlite)
docs/manual-validation/ # Manual validation guides per story
openapi/              # Generated OpenAPI bundle exposed at /docs
specs/                # Specification, plan, tasks, research artifacts
```

## Getting Started

1. Install dependencies from the repository root:
	```sh
	cd apps/api
	npm install
	```
2. Copy environment variables and adjust secrets:
	```sh
	cp ../../.env.example ../../.env
	```
3. Launch the development server with live reload:
	```sh
	npm run dev
	```

## Core Commands (apps/api)

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Fastify in watch mode via `tsx` |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Run the compiled server from `dist/` |
| `npm run migrate:up` | Execute forward-only SQLite migrations |
| `npm run docs:generate` | Bundle OpenAPI definition into `openapi/openapi.yaml` |
| `npm run lint` | Lint the source tree with ESLint |
| `npm run format` | Check code style with Prettier |

## Manual Validation

Automated tests are forbidden by constitution. Refer to `docs/manual-validation/` for the manual smoke guides tied to each user story. Update those documents when behavior or acceptance criteria change.

## Release Checklist

1. Bundle the latest contracts:
	```sh
	cd apps/api
	npm run docs:generate
	npm run build
	```
2. Apply pending migrations against the target database (`npm run migrate:up` locally or `docker compose exec api npm run migrate:up`).
3. Start the HTTPS stack using `docker compose -f docker/compose.yml up --build` and verify:
	- `https://localhost:3000/healthz`
	- `https://localhost:3000/openapi.yaml`
	- `https://localhost:3000/docs`
4. Execute the full smoke checklist (`docs/manual-validation/full-run.md`).
5. Capture results and known issues in `docs/releases/001-ft-backend-core.md` before tagging a release.

## Additional References

- `specs/001-specify-scripts-bash/spec.md` — feature requirements and user stories
- `specs/001-specify-scripts-bash/plan.md` — architectural plan and route matrix
- `specs/001-specify-scripts-bash/tasks.md` — actionable task list by phase
