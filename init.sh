#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${1:-ft-backend}"
ROOT_DIR="$(pwd)/${APP_NAME}"

echo ">> Creating project at: ${ROOT_DIR}"
mkdir -p "${ROOT_DIR}"; cd "${ROOT_DIR}"

echo ">> Git + ignore"
git init -q
cat > .gitignore <<'GIT'
node_modules/
.env
.env.*
.DS_Store
.speckit/cache/
GIT

printf "# %s\n\nSpec-driven backend bootstrap (Fastify/TS, SQLite) created via Spec-Kit.\n" "${APP_NAME}" > README.md

echo ">> Minimal package.json (tooling only)"
cat > package.json <<'JSON'
{
  "name": "ft-backend-spec",
  "private": true,
  "type": "module",
  "scripts": {
    "spec:init": "npx -y @github/spec-kit init",
    "spec:plan": "npx -y @github/spec-kit plan spex/*.md",
    "spec:tasks": "npx -y @github/spec-kit tasks spex/*.md --out .speckit/tasks.md",
    "spec:all": "npm run spec:init && npm run spec:plan && npm run spec:tasks"
  }
}
JSON

echo ">> Folders"
mkdir -p apps/api apps/web infra/proxy spex

###############################################################################
# SPECS — aligned with subject (HTTPS/WSS, SPA, Fastify module, SQLite DB,
# mandatory Tournament + Matchmaking, security constraints, etc.)
# Game logic remains on the front team; backend provides auth, chat, tourney,
# matchmaking, profile/stats, and WS bridge.
###############################################################################

echo ">> product.md"
cat > spex/product.md <<'MD'
# Product Spec — FT_Transcendence Backend (Spec-Driven)

## Scope
Backend powering a 4-page SPA:
- Home/Login: email+password, OAuth (42 Intra), session state.
- Arena: real-time match channel (front team owns game logic/physics).
- Chat: channels + DMs, presence, block list, invites.
- Profile/Stats: editable profile, recent matches, simple aggregates.

## Subject Alignment
- Single-page app, Firefox compatible, one-command Docker run; HTTPS/WSS mandatory; validate all inputs; hash passwords; protect routes; secrets in `.env`. :contentReference[oaicite:0]{index=0}
- **Web (Major)**: backend uses **Fastify + Node.js** (framework module). :contentReference[oaicite:1]{index=1}
- **Web (Minor)**: **SQLite** is the database for all persistence. :contentReference[oaicite:2]{index=2}
- **Mandatory** tournament + matchmaking backbone exposed by backend (even if UI/game is on front). :contentReference[oaicite:3]{index=3}

## Deliverables
- Public REST API + WebSocket entry points.
- Single OpenAPI source `/openapi.yaml` and **/docs** page for the UI team.
- No server-side game physics here; only auth, chat, tournament/matchmaking, stats, and WS relay.
MD

echo ">> auth.spec.md"
cat > spex/auth.spec.md <<'MD'
# Spec — Authentication & Identity

## Module Mapping
- Web (Major): Fastify backend.
- User Management (Major): Standard user management (accounts, profiles).
- User Management (Major): Remote authentication (OAuth 2.0 — 42).

## Goals
Email+password with Argon2id; OAuth 42 (PKCE + state); JWT access (15m) + refresh (7d) with rotation; `/me`.

## REST
- POST /auth/register {email, password, displayName}
- POST /auth/login {email, password}
- POST /auth/token/refresh
- POST /auth/logout
- GET  /auth/me
- GET  /auth/42/start        # redirect to 42
- GET  /auth/42/callback     # exchange code->token, upsert user, issue JWTs

## Data
users(id, email UNIQUE, display_name, pass_hash, avatar_url,
      provider 'local'|'42', provider_sub, twofa_secret, created_at)
sessions(id, user_id, issued_at, expires_at)

## Rules
- Passwords hashed with Argon2id; parameterized SQL; input validation on all forms.
- Refresh rotation; revoke old refresh on use.
- First 42 login creates user bound to `provider_sub`; subsequent logins update profile fields.
MD

echo ">> chat.spec.md"
cat > spex/chat.spec.md <<'MD'
# Spec — Live Chat (Realtime + History)

## WebSocket
- WS /ws/chat (JWT required)
  - Client->Server:
    - join({room})
    - channel({room, body})
    - dm({to, body})
    - block({userId})
  - Server->Client:
    - message({from, room?, to?, body, ts})
    - presence({userId, online})
    - invite({fromUserId, matchId})                # invite to match
    - tournamentAnnounce({matchId, p1, p2, eta})   # tournament notice

## REST
- GET /api/chat/history?room=general&limit=50
- GET /api/chat/dm/:userId?cursor=...

## Data
chat_messages(id, from_id, to_id NULL, room NULL, body, created_at)
blocks(blocker_id, blocked_id, PRIMARY KEY(blocker_id,blocked_id))

## Rules
- Enforce blocks on delivery + history.
- Max message length 2000; store plain text; UI escapes on render.
- Backpressure + rate-limit on WS sends; auth required for all ops.
MD

echo ">> tournament.spec.md"
cat > spex/tournament.spec.md <<'MD'
# Spec — Tournament & Matchmaking (Mandatory Backbone)

## Purpose
Provide minimal backend to satisfy subject: registration by alias or account, FIFO matchmaking, “announce next”, results store. UI/game handled on front.

## REST
- POST  /api/tournament/start {name} -> {tournamentId}
- POST  /api/tournament/register {alias, userId?} -> {playerId}
- POST  /api/tournament/queue/join {playerId} -> {ok:true}
- POST  /api/tournament/announce-next -> {matchId, p1, p2, order}
- GET   /api/tournament/next -> {matchId, p1, p2, order}
- POST  /api/tournament/result {matchId, p1Score, p2Score, winnerId} -> {ok:true}
- GET   /api/tournament/board -> [{matchId, p1, p2, status, winnerId?}]

## WS (optional but recommended)
- WS /ws/tournament  (JWT optional when alias-only)
  - server->client: announceNext({matchId,p1,p2,startsAt})
  - server->client: result({matchId,winnerId})

## Data
tournaments(id,name,created_at,status)
tournament_players(id,tournament_id, alias, user_id NULL)
tournament_matches(id,tournament_id,p1_id,p2_id,order_idx,status,winner_id NULL)

## Notes
- Works with or without accounts (alias mode). When Standard User Management is present, `alias` may link to user id and persist stats.  
- Equal treatment: backend does not change paddle speeds; front/engine must enforce identical speeds.
MD

echo ">> match-bridge.spec.md"
cat > spex/match-bridge.spec.md <<'MD'
# Spec — Match Bridge (REST + WS Relay; Game Logic on Front)

## REST
- POST  /api/matches {opponentId?} -> {matchId}
- GET   /api/matches/:id           -> {players, startedAt, finishedAt, lastScore?}
- PATCH /api/matches/:id/result {p1Score,p2Score,winnerId} -> {ok:true}

## WebSocket
- WS /ws/match/:id
  - Client->Server: join, leave
  - Engine(front)->Server: state({ball,paddles,score,timestamp})
  - Server->Client: state(...)

## Rules
- Server is authoritative for room membership; only participants can join.
- Backend relays frames and persists final results; no physics here.
MD

echo ">> profile.spec.md"
cat > spex/profile.spec.md <<'MD'
# Spec — Profile & Stats

## REST
- GET   /api/users/:id
- PATCH /api/users/:id {displayName, avatarUrl}
- GET   /api/users/:id/stats -> {wins, losses, streak, recent:[{opponentId, p1Score, p2Score, ts}]}

## Notes
- Auth required; a user can only PATCH their own profile.
- Stats derived from `matches` (and possibly tournament tables).
MD

echo ">> api-docs.spec.md"
cat > spex/api-docs.spec.md <<'MD'
# Spec — API Documentation

## Deliverables
- Single OpenAPI 3 source at `/openapi.yaml`.
- Human docs at **GET /docs** (Redoc/Scalar UI static page).
- Policy: any route change must update OpenAPI in the same PR.

## Must Document
- Auth: /auth/register, /auth/login, /auth/token/refresh, /auth/logout, /auth/me, /auth/42/*
- Users: /api/users/:id, /api/users/:id/stats
- Chat: /api/chat/history, /api/chat/dm/:userId, WS /ws/chat events
- Tournament: all endpoints above + WS notices
- Matches: /api/matches*, WS /ws/match/:id events
MD

echo ">> infra-security.spec.md"
cat > spex/infra-security.spec.md <<'MD'
# Spec — Infra, Delivery, Security

## Docker
- One command spins up reverse proxy (TLS), API service, and serves the SPA bundle provided by front.
- Works on campus constraints; no bind-mount dependency required for runtime.

## Security Baseline
- HTTPS/WSS mandatory; HSTS at proxy.
- Hashing: Argon2id; validation on all inputs; parameterized SQL; rate-limits on auth & WS connects.
- JWT access 15m, refresh 7d with rotation & revoke; secrets in `.env` (ignored by git).
- CORS restricted to SPA origin; cookies Secure+HttpOnly if used.

## Observability
- Health: /api/health, /api/version; request/error logs.
MD

echo ">> Initialize Spec-Kit"
npm run -s spec:init

echo ">> Generate plan + tasks"
npm run -s spec:plan
npm run -s spec:tasks

echo
echo "All set. Review:"
echo " - Plan:   .speckit/plan.md (or tool output)"
echo " - Tasks:  .speckit/tasks.md"
echo "Next: feed tasks to your codegen to scaffold Fastify+TS, SQLite, WS, and /docs."
