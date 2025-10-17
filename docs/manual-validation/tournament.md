# Manual Validation — Tournament & Matchmaking

> Purpose: Verify tournament lifecycle, matchmaking queue, REST endpoints, and WebSocket relays using manual API calls and helper tooling.

## Prerequisites
- API running locally (`npm run dev` or Docker Compose stack)
- SQLite migrations applied (`npm run migrate:up`)
- `jq` and `curl` installed for scripted flows
- Optional: `websocat` (or similar) for WebSocket inspection
- Clean environment variables for JWT secrets (matches `.env.example`)

## Quick Smoke (Automated Helper)
1. `cd backend`
2. Run `bash scripts/smoke-tournament.sh`
   - Script registers/logs in a smoke user, creates a tournament, queues two players, announces a match, records a result, and prints bracket state.
   - Expect final output `Smoke test completed successfully` with match detail transitioning to `completed`.
3. If the script fails, capture the HTTP status + response emitted before proceeding to manual steps.

## Manual REST Walkthrough
1. **Access Token**
   - POST `/auth/register` (if account missing) and `/auth/login` to obtain `accessToken`.
   - Store token for authenticated match routes.
2. **Create Tournament**
   - POST `/tournament/start` with `{ "name": "Manual Cup" }` → expect `201` and `id`.
3. **Register Players**
   - POST `/tournament/register` twice with unique aliases → expect `201` with player ids.
4. **Queue Players**
   - POST `/tournament/queue/join` for each player id → expect `200` with `queuedAt` timestamps.
5. **Announce Match**
   - POST `/tournament/announce-next` with tournament id → expect `200` and pairing (`matchId`,`p1`,`p2`).
   - If `204`, ensure queue contains at least two players.
6. **Match Detail**
   - GET `/matches/{matchId}` with `Authorization: Bearer <token>` → expect `status: announced` and participants populated.
7. **Record Result**
   - PATCH `/matches/{matchId}/result` with `{ "matchId": "...", "p1Score": 3, "p2Score": 1, "winnerId": "{playerId}" }` → expect `{ "ok": true }`.
   - Re-fetch match detail to confirm `status: completed` and `lastScore` filled.
8. **Tournament Board**
   - GET `/tournament/board?tournamentId=...` → expect completed entry reflecting the recorded result.
9. **Leave Queue (optional)**
   - POST `/tournament/queue/leave` per player to ensure clean state → expect `200` and `queuedAt: null`.

## WebSocket Validation
1. **Tournament Feed**
   - Connect `websocat "ws://localhost:3000/ws/tournament?tournamentId=<id>"`.
   - After subscription, trigger `announce-next` or `result` to observe `announceNext` and `result` messages.
   - Send `{"type":"ping"}`; expect `{"type":"pong"}`.
2. **Match Relay**
   - Connect as each participant: `websocat "ws://localhost:3000/ws/match/<matchId>?playerId=<playerId>"`.
   - Send `{ "type": "join" }`; expect `joined` and `match` snapshot.
   - Send `{ "type": "state", "payload": { "ball": {"x": 1,"y": 1} } }`; other connection should receive identical `state` payload with timestamp.
   - Send `{ "type": "leave" }` to close gracefully.

## Failure Logging
- Capture any `4xx/5xx` responses with payloads.
- Check API logs for `TournamentServiceError`, `QueueServiceError`, or `MatchServiceError` entries when behavior deviates.

## Cleanup
- Optionally delete smoke user sessions via `/auth/logout`.
- Remove generated tournament/match rows by resetting the SQLite DB if a clean slate is required for future runs.

## Sign-off
- All REST calls succeed with expected payloads.
- WebSocket events observed for announcements and match state.
- Manual notes recorded in release checklist.
