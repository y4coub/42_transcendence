# Feature Specification: FT Backend Core Services

**Feature Branch**: `001-specify-scripts-bash`  
**Created**: 2025-10-16  
**Status**: Draft  
**Input**: Build the backend for a simplified FT_Transcendence clone covering auth, chat, tournaments, profiles, stats, and OpenAPI docs under provided security and deployment constraints.

## User Scenarios & Validation *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must deliver value independently. Validation is manual by default and
  should describe observable outcomes or smoke steps that confirm the story works.
  
  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Validated independently (manual or observational)
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - Secure Account Access (Priority: P1)

A player signs in with email/password or 42 Intra OAuth and receives active session tokens for the SPA.

**Why this priority**: Without authenticated access the SPA cannot reach personalized features such as chat or matchmaking.

**Validation Approach**: Perform a manual login flow through API client (or SPA) verifying JWT issuance, refresh rotation, and HTTPS redirect from 42 sandbox.

**Acceptance Scenarios**:

1. **Given** a registered local account, **When** the player submits valid credentials, **Then** the API responds 200 with access/refresh tokens and session metadata.
2. **Given** an unlinked 42 account, **When** the player completes the OAuth callback, **Then** the backend creates/updates the user profile and returns valid tokens within 5 seconds.

---

### User Story 2 - Real-Time Chat Collaboration (Priority: P2)

A signed-in player exchanges messages via channels or direct messages with presence, invites, and block enforcement.

**Why this priority**: Chat is core to the social experience and must work before competitive features launch.

**Validation Approach**: Open two browser sessions, join the same channel, and observe live message exchange plus block/invite effects using browser dev tools and WS inspector.

**Acceptance Scenarios**:

1. **Given** two authenticated players in the same channel, **When** one posts a message, **Then** the other receives it within 1 second and the message persists for reload.
2. **Given** a player has blocked another, **When** the blocked player attempts a DM invite, **Then** the backend rejects it and emits a policy violation event.

---

### User Story 3 - Tournament and Matchmaking Flow (Priority: P3)

A player queues for matchmaking or tournament play, receives bracket placement, and gets real-time updates about opponents.

**Why this priority**: Competitive play is the product differentiator; coordinated scheduling drives retention.

**Validation Approach**: Use API client to create a tournament, enroll multiple test accounts, and observe WS notifications for bracket updates while verifying persisted brackets.

**Acceptance Scenarios**:

1. **Given** a scheduled tournament, **When** registration closes, **Then** the system seeds brackets, notifies entrants via WS, and records match pairings.
2. **Given** players enter matchmaking queue, **When** a compatible match is found, **Then** the backend emits match assignment events and updates player status to “in-match”.

---

### User Story 4 - Player Profile & Stats Overview (Priority: P4)

An authenticated player reviews and edits their profile while tracking recent match history and aggregate statistics.

**Why this priority**: Profiles personalize the experience and give feedback loops on performance.

**Validation Approach**: Manually PATCH profile fields, reload the SPA, and confirm profile card plus stats endpoints reflect updates and historical match totals.

**Acceptance Scenarios**:

1. **Given** a player updates display name or avatar, **When** they reload their profile, **Then** the response delivers the new values and audit trail entry.
2. **Given** recent matches completed, **When** the player requests stats, **Then** the API returns win/loss totals and streak states within 2 seconds.

---

### User Story 5 - Self-Service API Documentation (Priority: P5)

Frontend and partner tools consume always-current OpenAPI definitions and rendered docs at `/docs`.

**Why this priority**: Reliable documentation prevents integration drift and unblocks iteration without backend coordination.

**Validation Approach**: Manually regenerate OpenAPI spec, visit `/docs`, and verify key routes render with accurate parameters and WebSocket events.

**Acceptance Scenarios**:

1. **Given** a new route is added, **When** the OpenAPI file is updated, **Then** `/docs` reflects the change immediately after deploy.
2. **Given** a frontend developer references `/docs`, **When** they copy example payloads, **Then** requests succeed without schema mismatches.

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

- OAuth callback arrives without state or with replayed state token → deny login and log security incident.
- Player attempts to join chat while rate-limited or banned → block connection and return policy details.
- Tournament bracket fills while a player disconnects mid-registration → maintain waitlist order and notify reserves.
- Concurrent profile edits conflict (e.g., from multiple devices) → last-write wins with revision metadata exposed to clients.
- SQLite migration fails during deploy → rollback Docker Compose release and keep prior schema snapshot.

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: System MUST support email/password registration, login, logout, and token refresh with Argon2id hashing and JWT rotation.
- **FR-002**: System MUST integrate with 42 Intra OAuth using state+PKCE and map new OAuth users to persistent profiles.
- **FR-003**: System MUST expose REST endpoints for channel list, message history, DM invites, and block management.
- **FR-004**: System MUST broadcast chat and tournament events over WebSocket routes with authenticated sessions only.
- **FR-005**: System MUST persist chat messages, invites, blocks, tournaments, matches, and profile updates in SQLite.
- **FR-006**: System MUST enforce HTTPS and WSS for all external interactions and terminate HTTP with redirects.
- **FR-007**: System MUST provide centralized rate limiting and payload validation on every endpoint and message event.
- **FR-008**: System MUST schedule and manage tournament brackets, including seeding, advancing winners, and notifying participants.
- **FR-009**: System MUST matchmake players based on queue inputs, update player availability, and handle timeouts gracefully.
- **FR-010**: System MUST maintain profile data (display name, avatar, bio) and surface aggregated match statistics per player.
- **FR-011**: System MUST deliver an up-to-date `openapi.yaml` covering REST and WS schemas and serve `/docs` via the same container.
- **FR-012**: System MUST deploy via a single Docker Compose command spinning up proxy, API, and SQLite services.
- **FR-013**: System MUST apply forward-only database migrations for every schema evolution and track applied versions.
- **FR-014**: System MUST emit structured logs and metrics per module to support manual smoke validation and monitoring.
- **FR-015**: System MUST reject automated test suites; manual validation checklists accompany releases.
- **FR-016**: System MUST structure Fastify TypeScript modules for auth, chat, tournament, and stats with plugin registration enforcing separation of concerns.

### Key Entities *(include if feature involves data)*

- **UserAccount**: Player identity including credential type (local or 42), display info, security flags, and links to sessions.
- **SessionToken**: Access and refresh token records with issuance, expiration, and revocation status.
- **ChatChannel**: Named conversation with membership rules, invite settings, and message retention configuration.
- **ChatMessage**: Individual message payload with author, channel/DM context, timestamps, and moderation flags.
- **Tournament**: Event definition with schedule, bracket configuration, participant roster, and state lifecycle.
- **MatchRecord**: Head-to-head assignment leveraging queue or tournament context, including results and timestamps.
- **PlayerProfile**: Aggregated statistics, recent match summaries, and customizable profile attributes.
- **RateLimitWindow**: Tracking structure for per-user/IP action counts governing throttling decisions.
- **SchemaMigration**: Metadata about applied migrations ensuring SQLite remains the single source of truth.

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: 95% of login or OAuth callback flows complete within 5 seconds end-to-end.
- **SC-002**: Chat messages deliver to subscribed participants within 1 second during manual smoke sessions with 50 simultaneous messages.
- **SC-003**: Tournament bracket generation completes within 10 seconds for events up to 128 players, with real-time notifications observed for all entrants.
- **SC-004**: `/docs` endpoint reflects the latest `openapi.yaml` within 1 minute of deployment and covers 100% of public routes and WS events.
- **SC-005**: Manual release checklist confirms Docker Compose up command brings proxy, API, and SQLite online in under 2 minutes.

## Assumptions

- Frontend SPA already satisfies UI flows and will integrate via documented REST/WS contracts.
- 42 Intra sandbox credentials are available for manual validation and preconfigured in environment variables.
- Manual validation will rely on staging tooling (Postman, browser dev tools) rather than automated suites.

## Dependencies

- Access to DNS/SSL certificates enabling HTTPS/WSS endpoints.
- Deployment environment capable of running Docker Compose with proxy routing (e.g., Traefik or Nginx) and persistent volume for SQLite.
- OAuth redirect URIs whitelisted within 42 developer portal prior to release.

