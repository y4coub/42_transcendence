---
description: "Task list for FT Backend Core Services"
---

# Tasks: FT Backend Core Services

**Input**: Design documents from `/specs/001-specify-scripts-bash/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Validation**: Automated tests are FORBIDDEN. Include manual smoke checks or monitoring steps only if explicitly requested in the feature specification.

**Organization**: Tasks are grouped by user story to enable independent implementation and manual validation of each story.
**Contracts**: Changes impacting APIs/WS MUST include `/openapi/openapi.yaml` + `/docs` updates and contract verification tasks.
**Observability**: Add structured logging/metrics tasks alongside feature work to satisfy Principle V.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions
- `apps/api/src/` houses all backend modules (auth, chat, users, matches, tournament, stats)
- Migrations live under `db/migrations/`
- Docker assets live in `docker/`
- Manual validation docs live in `docs/manual-validation/`
- Environment examples reside at `.env.example`

<!--
  Tasks MUST be organized by user story so each story can be:
  - Implemented independently
  - Validated manually (if applicable)
  - Delivered as an MVP increment
-->

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish repository structure, tooling, and configuration scaffolding.

- [X] T001 Create backend module directories `apps/api/src/{auth,chat,users,matches,tournament,stats}`
- [X] T002 [P] Create shared directories `apps/api/src/plugins`, `apps/api/src/infra/{security,observability,config,db}`
- [X] T003 Update `package.json` scripts (`build`, `dev`, `migrate:up`, `docs:generate`) to match plan
- [X] T004 Add TypeScript config with path aliases in `apps/api/tsconfig.json`
- [X] T005 Add linting & formatting configuration `apps/api/.eslintrc.cjs` and `apps/api/.prettierrc`
- [X] T006 Draft `.env.example` with JWT, OAuth, database, and proxy variables
- [X] T007 Create manual validation index `docs/manual-validation/README.md`
- [X] T008 Add baseline README section for backend setup in `README.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented.

- [X] T009 Implement configuration loader `apps/api/src/infra/config/env.ts`
- [X] T010 Implement Fastify server bootstrap `apps/api/src/app.ts` with plugin registration shell
- [X] T011 Create logging + metrics utilities `apps/api/src/infra/observability/logger.ts`
- [X] T012 Configure security plugin bundle (CORS, rate limit, helmet headers) in `apps/api/src/plugins/security.ts`
- [X] T013 Implement JWT plugin configuration `apps/api/src/plugins/jwt.ts`
- [X] T014 Implement SQLite client factory with better-sqlite3 in `apps/api/src/infra/db/client.ts`
- [X] T015 Create migration runner CLI `apps/api/src/infra/db/migrate.ts`
- [X] T016 Author initial schema migration index in `db/migrations/000_init.sql`
- [X] T017 Create Dockerfile for API service at `docker/api/Dockerfile`
- [X] T018 Create Docker Compose stack `docker/compose.yml` with `proxy`, `api`, `sqlite`
- [X] T019 Configure Caddy HTTPS proxy `docker/proxy/Caddyfile` enabling WSS pass-through
- [X] T020 Document local HTTPS/WSS setup in `docs/setup-https.md`
- [X] T021 Seed OpenAPI scaffold with shared components in `openapi/openapi.yaml`
- [X] T022 Document manual smoke test framework overview in `docs/manual-validation/framework.md`

---

## Phase 3: User Story 1 - Secure Account Access (Priority: P1) 🎯 MVP

**Goal**: Deliver email/password + 42 OAuth authentication with JWT session lifecycle and secure persistence.

**Validation Approach (optional)**: Manual login + OAuth flow via Postman/browser verifying JWT rotation and HTTPS redirects.

### Implementation for User Story 1

- [X] T023 [US1] Add user & session migrations `db/migrations/001_users_sessions.sql`
- [X] T024 [US1] Define auth Zod schemas `apps/api/src/auth/schemas.ts`
- [X] T025 [US1] Implement auth repository `apps/api/src/auth/repository.ts`
- [X] T026 [US1] Implement auth service (registration/login/token rotation) `apps/api/src/auth/service.ts`
- [X] T027 [US1] Implement 42 OAuth client wrapper `apps/api/src/auth/oauth42.ts`
- [X] T028 [US1] Scaffold auth routes plugin `apps/api/src/auth/routes.ts`
- [X] T029 [US1] Wire auth module into app bootstrap `apps/api/src/auth/index.ts`
- [X] T030 [US1] Update OpenAPI auth paths & schemas in `openapi/openapi.yaml`
- [X] T031 [US1] Document manual auth validation steps `docs/manual-validation/auth.md`

**Checkpoint**: At this point, User Story 1 should fulfill its spec and pass documented manual validation (if any).

---

## Phase 4: User Story 2 - Real-Time Chat Collaboration (Priority: P2)

**Goal**: Enable channel + DM messaging with persistence, blocking, and WS broadcast.

**Validation Approach (optional)**: Dual browser sessions plus WS inspector verifying message delivery, block enforcement, and persistence reload.

### Implementation for User Story 2

- [X] T032 [US2] Create chat schema migrations `db/migrations/002_chat.sql`
- [X] T033 [US2] Define chat Zod schemas `apps/api/src/chat/schemas.ts`
- [X] T034 [US2] Implement chat repositories (channels, messages, memberships) `apps/api/src/chat/repository.ts`
- [X] T035 [US2] Implement chat service (message pipeline, block enforcement) `apps/api/src/chat/service.ts`
- [X] T036 [US2] Implement chat WebSocket gateway `apps/api/src/chat/ws.ts`
- [X] T037 [US2] Scaffold chat REST routes plugin `apps/api/src/chat/routes.ts`
- [X] T038 [US2] Register chat module with dependencies `apps/api/src/chat/index.ts`
- [X] T039 [US2] Update OpenAPI chat endpoints & WS descriptions `openapi/openapi.yaml`
- [X] T040 [US2] Document manual chat validation steps `docs/manual-validation/chat.md`

**Checkpoint**: At this point, User Stories 1 AND 2 should both satisfy their specs and manual validation steps (if any).

---

## Phase 5: User Story 3 - Tournament & Matchmaking Flow (Priority: P3)

**Goal**: Provide tournament management, matchmaking queue, and real-time match assignments.

**Validation Approach (optional)**: API client orchestrated tournament creation + WS monitoring for bracket notifications.

### Implementation for User Story 3

- [X] T041 [US3] Create tournament & queue migrations `db/migrations/003_tournaments.sql`
- [X] T042 [US3] Define tournament/match Zod schemas `apps/api/src/tournament/schemas.ts`
- [X] T043 [US3] Implement tournament repositories `apps/api/src/tournament/repository.ts`
- [X] T044 [US3] Implement matchmaking queue service `apps/api/src/matches/queue.ts`
- [X] T045 [US3] Implement tournament orchestration service `apps/api/src/tournament/service.ts`
- [X] T046 [US3] Scaffold tournament REST routes plugin `apps/api/src/tournament/routes.ts`
- [X] T047 [US3] Implement tournament WS notifications gateway `apps/api/src/tournament/ws.ts`
- [X] T048 [US3] Implement match WS relay `apps/api/src/matches/ws.ts`
- [X] T049 [US3] Scaffold match REST routes plugin `apps/api/src/matches/routes.ts`
- [X] T050 [US3] Update OpenAPI tournament & match endpoints `openapi/openapi.yaml`
- [X] T051 [US3] Document manual tournament validation steps `docs/manual-validation/tournament.md`

**Checkpoint**: All user stories should now satisfy their specs and manual validation steps (if any).

---

## Phase 6: User Story 4 - Player Profile & Stats Overview (Priority: P4)

**Goal**: Surface editable profiles and aggregated match statistics for players.

**Validation Approach (optional)**: Manual PATCH + GET cycles verifying profile updates and stats recalculations.

### Implementation for User Story 4

- [X] T052 [US4] Create profile & stats migrations `db/migrations/004_profiles_stats.sql`
- [X] T053 [US4] Implement stats aggregation job `apps/api/src/stats/aggregator.ts`
- [X] T054 [US4] Implement profile repository `apps/api/src/users/repository.ts`
- [X] T055 [US4] Implement profile & stats service `apps/api/src/users/service.ts`
- [X] T056 [US4] Scaffold profile/stats REST routes plugin `apps/api/src/users/routes.ts`
- [X] T057 [US4] Update OpenAPI profiles & stats endpoints `openapi/openapi.yaml`
- [X] T058 [US4] Document manual profile validation steps `docs/manual-validation/profile.md`

**Checkpoint**: All user stories should now satisfy their specs and manual validation steps (if any).

---

## Phase 7: User Story 5 - Self-Service API Documentation (Priority: P5)

**Goal**: Keep OpenAPI authoritative and render `/docs` for consumers.

**Validation Approach (optional)**: Manual review of `/docs` output to ensure consistency with contracts.

### Implementation for User Story 5

- [X] T059 [US5] Integrate OpenAPI build script `apps/api/src/plugins/docs.ts`
- [X] T060 [US5] Add `/docs` route serving Scalar/Redoc UI `apps/api/src/docs/routes.ts`
- [X] T061 [US5] Ensure OpenAPI covers REST + WS schemas (auth, chat, tournament, match) `openapi/openapi.yaml`
- [X] T062 [US5] Update Quickstart docs for docs workflow `specs/001-specify-scripts-bash/quickstart.md`
- [X] T063 [US5] Document manual docs validation steps `docs/manual-validation/docs.md`

**Checkpoint**: Documentation outputs should reflect all delivered endpoints.

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories.

- [X] T064 Review CORS, rate limit, and security headers integration `apps/api/src/plugins/security.ts`
- [X] T065 Add structured logging context across modules `apps/api/src/infra/observability/logger.ts`
- [X] T066 Produce consolidated manual smoke checklist `docs/manual-validation/full-run.md`
- [X] T067 Update deployment guide with Docker commands `docs/setup-https.md`
- [X] T068 Finalize README release steps `README.md`
- [X] T069 Capture release notes summarizing modules `docs/releases/001-ft-backend-core.md`

---

## Phase 8: User Story 6 - Optional TOTP 2FA (Priority: P6)

**Goal**: Allow users to enable TOTP-based 2FA with recovery codes and trusted devices across auth flows.

- [X] T2FA-001 Create 2FA schema migration `db/migrations/005_2fa_totp.sql`
- [X] T2FA-002 Extend config and env examples for 2FA secrets `apps/api/src/infra/config/env.ts`
- [X] T2FA-003 Implement AES-GCM crypto helper `apps/api/src/infra/security/crypto.ts`
- [X] T2FA-004 Add hashing utilities for recovery codes `apps/api/src/auth/crypto.ts`
- [X] T2FA-005 Expand auth repository with 2FA persistence `apps/api/src/auth/repository.ts`
- [X] T2FA-006 Add cleanup helpers for expired 2FA artifacts `apps/api/src/auth/repository.ts`
- [X] T2FA-007 Implement 2FA enrollment service `apps/api/src/auth/twofa/service.ts`
- [X] T2FA-008 Implement trusted device service `apps/api/src/auth/twofa/trusted-device.ts`
- [X] T2FA-009 Configure 2FA-specific rate limits `apps/api/src/plugins/security.ts`
- [X] T2FA-010 Scaffold 2FA REST routes `apps/api/src/auth/twofa/routes.ts`
- [X] T2FA-011 Update login routes for 2FA challenges `apps/api/src/auth/routes.ts`
- [X] T2FA-012 Register 2FA routes in auth module `apps/api/src/auth/index.ts`
- [X] T2FA-013 Integrate 2FA challenge flow in auth service `apps/api/src/auth/service.ts`
- [X] T2FA-014 Integrate 2FA with 42 OAuth callback `apps/api/src/auth/oauth42.ts`
- [X] T2FA-015 Add structured 2FA audit logging `apps/api/src/infra/observability/logger.ts`
- [X] T2FA-016 Create maintenance script for 2FA cleanup `apps/api/src/auth/twofa/maintenance.ts`
- [X] T2FA-017 Update OpenAPI with 2FA endpoints `openapi/openapi.yaml`
- [X] T2FA-018 Document manual 2FA validation `docs/manual-validation/2fa.md`
- [X] T2FA-019 Refresh quickstart with 2FA steps `specs/001-specify-scripts-bash/quickstart.md`
- [X] T2FA-020 Update release notes for 2FA `docs/releases/001-ft-backend-core.md`
- [X] T2FA-021 Extend full-run manual checklist for 2FA `docs/manual-validation/full-run.md`
- [X] T2FA-022 Execute manual validation and log outcome `docs/releases/001-ft-backend-core.md`

---

## Phase 9: Docs UI Enhancements (Priority: P7)

**Goal**: Ship Scalar-based interactive API documentation with hardened production access controls.

- [X] DOCS-001 Bundle OpenAPI YAML into JSON artifact `openapi/openapi.json`
- [X] DOCS-002 Expose `/api/openapi.json` Fastify route with caching `apps/api/src/docs/routes.ts`
- [X] DOCS-003 Integrate `@scalar/fastify-api-reference` serving `/docs` `apps/api/src/docs/routes.ts`
- [X] DOCS-004 Enforce production Basic Auth/JWT gate for `/docs` `apps/api/src/docs/routes.ts`
- [ ] DOCS-005 Ensure Docker build copies bundled spec `docker/api/Dockerfile`
- [ ] DOCS-006 Add CI step to validate OpenAPI schema `pipeline/.?`

---

## Phase 10: Smoke Test Automation (Priority: P8)

**Goal**: Provide black-box smoke coverage for all documented REST endpoints and WebSocket chat using a detached dev server.**

- [X] SMOKE-001 Add detached dev/test scripts, Port overrides, and `.env.test` scaffolding
- [X] SMOKE-002 Implement auth smoke suite `tests/auth.smoke.mjs`
- [X] SMOKE-003 Implement users & stats smoke suite `tests/users.smoke.mjs`
- [X] SMOKE-004 Implement chat REST smoke suite `tests/chat.rest.smoke.mjs`
- [X] SMOKE-005 Implement matches + docs smoke suite `tests/matches_docs.smoke.mjs`
- [X] SMOKE-006 Implement chat WebSocket smoke suite `tests/chat.ws.smoke.mjs` (cover join, broadcast echo, block enforcement)
- [ ] SMOKE-007 Implement security headers & unauthorized smoke suite `tests/security.smoke.mjs` (assert healthz/docs gating and core headers)
- [ ] SMOKE-008 Build orchestration runner `tests/run-smoke.mjs` (wire new suites, tighten readiness + summary output)
- [ ] SMOKE-009 Add GitHub Actions smoke job and README documentation updates (document detached flow & CI usage)

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → **Foundational (Phase 2)** → **US1 (Phase 3)** → **US2 (Phase 4)** → **US3 (Phase 5)** → **US4 (Phase 6)** → **US5 (Phase 7)** → **Polish (Phase N)**
- US2 depends on chat migrations & auth session middleware from US1
- US3 depends on auth (for authenticated queue) and chat WS baseline (for WS scaffolding reuse)
- US4 depends on match results produced in US3
- US5 depends on all prior endpoints for comprehensive documentation

### Parallel Opportunities
- [P] tasks within Setup (directory creation, lint config) after T001 can execute in parallel
- [P] tasks within each story that touch distinct files (e.g., repository vs. routes) can proceed concurrently once migrations exist
- Dockerfile (T017) and Compose (T018) can progress in parallel after foundational config is defined

### Implementation Strategy

1. **MVP First**: Deliver Secure Account Access (US1) to enable frontend authentication
2. **Incremental Delivery**: Layer chat (US2), tournaments/matchmaking (US3), profiles/stats (US4), then documentation (US5)
3. **Polish**: Finalize manual validation bundles, security hardening, release documentation

---

## Notes

- Manual validation documents are required for each story since automated tests are disallowed.
- Keep OpenAPI and `/docs` updated in the same PR as endpoint changes.
- Ensure Docker Compose stack runs in <2 minutes per success criteria.
