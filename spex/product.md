# Product Spec — FT_Transcendence Backend (Spec-Driven)

## Scope
Backend powering a 4-page SPA:
- Home/Login: email+password, OAuth (42 Intra), session state.
- Arena: real-time match channel (front team owns game logic/physics).
- Chat: channels + DMs, presence, block list, invites.
- Profile/Stats: editable profile, recent matches, simple aggregates.

## Subject Alignment
- Single-page app, Firefox compatible, one-command Docker run; HTTPS/WSS mandatory; validate all inputs; hash passwords; protect routes; secrets in `.env`. 
- **Web (Major)**: backend uses **Fastify + Node.js** (framework module).
- **Web (Minor)**: **SQLite** is the database for all persistence.
- **Mandatory** tournament + matchmaking backbone exposed by backend (even if UI/game is on front).

## Deliverables
- Public REST API + WebSocket entry points.
- Single OpenAPI source `/openapi.yaml` and **/docs** page for the UI team.
- No server-side game physics here; only auth, chat, tournament/matchmaking, stats, and WS relay.
