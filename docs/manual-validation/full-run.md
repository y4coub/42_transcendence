# Manual Validation — Full Release Runbook

Use this script for end-to-end validation before shipping a release. Estimated time: ~45 minutes.

## Prerequisites
- Fresh database or known seed state.
- Docker Compose stack running via `docker compose -f docker/compose.yml up --build`.
- Two test users (`userA`, `userB`) with email/password credentials.
- Tools installed: `curl`, `jq`, browser, and WebSocket inspector (e.g., browser devtools).

## 1. Bootstrap & Health
1. Hit `http://localhost/healthz`; expect `{ "status": "ok" }`.
2. Confirm Caddy presents valid certificate (self-signed or trusted dev CA).
3. Review API logs for startup messages and absence of errors.

## 2. Authentication
Follow `docs/manual-validation/auth.md`:
- Register `userA` and `userB`.
- Login both, capture tokens, verify `GET /auth/me`.
- Exercise refresh + logout flows.

## 3. Optional TOTP 2FA
Follow `docs/manual-validation/2fa.md`:
- Enroll TOTP for `userA` using authenticator app.
- Verify login challenges (202 responses) and trusted device reuse.
- Regenerate recovery codes and confirm single-use behavior.
- Disable and cancel enrollment flows when finished.

## 4. Chat Experience
Follow `docs/manual-validation/chat.md`:
- Create channel as `userA`, join with `userB`.
- Exchange messages over REST + WS (`/ws/chat/{channelId}`).
- Test block/unblock mechanics and ensure blocked messages are suppressed.

## 5. Tournament & Matchmaking
Follow `docs/manual-validation/tournament.md`:
- Create tournament, register players (using both users + guest aliases).
- Queue players, observe `/tournament/announce-next` behavior and WS events.
- Record match results through `/matches/:id/result` and verify downstream announcements.

## 6. Profiles & Stats
Follow `docs/manual-validation/profile.md`:
- Fetch both profiles, update display name/avatar for owner only.
- Validate `GET /users/{id}/stats` with and without refresh flag; confirm recent matches reflect tournament outcomes.

## 7. Documentation Portal
Follow `docs/manual-validation/docs.md`:
- Ensure `http://localhost/openapi.yaml` serves the bundle.
- Confirm Scalar UI renders at `/docs` and displays endpoints updated above.

## 8. Observability & Rate Limits
- Trigger intentional rapid requests to `/auth/me` (> config limit) and observe `429` responses and `x-ratelimit-*` headers.
- Verify logs include structured context (`module`, `req`, `res`).

## 9. Shutdown & Cleanup
- Stop Docker stack (`docker compose -f docker/compose.yml down`).
- Optionally remove volumes for clean next run.
- Record outcomes, anomalies, and follow-ups in release notes (`docs/releases/001-ft-backend-core.md`).

> ✅ If any step fails, capture logs, restore baseline data, and rerun from the failing section.
