# Release Notes — FT Backend Core Services (v0.1.0)

## Highlights
- ✅ Authentication: email/password and 42 OAuth with session rotation and Argon2id hashing.
- ✅ Real-time chat: channel CRUD, DM support, block list enforcement, WebSocket broadcasting.
- ✅ Tournament & matchmaking: queue pairing, REST control surface, WS announcements, match relay.
- ✅ Player profiles & stats: editable profile fields plus aggregated results and recent match history.
- ✅ Documentation portal: `/openapi.yaml` bundle and Scalar UI at `/docs` bundled via `npm run docs:generate`.
- ✅ Optional TOTP 2FA: enrollment QR codes, recovery codes, login challenges, trusted devices, and audit logging.

## Migration Summary
- `000_init.sql`: schema ledger bootstrap.
- `001_users_sessions.sql`: users + sessions.
- `002_chat.sql`: chat channels, memberships, messages.
- `003_tournaments.sql`: tournaments, players, matches.
- `004_profiles_stats.sql`: user_stats and user_recent_matches cache tables.
- `005_2fa_totp.sql`: two-factor settings, challenges, recovery codes, and trusted device registries.

Apply migrations in order with `npm run migrate:up` (from `apps/api`) or `docker compose exec api npm run migrate:up`.

## Manual Validation
Run `docs/manual-validation/full-run.md` for the complete smoke sequence. Individual modules retain dedicated guides under `docs/manual-validation/`, including the new `2fa.md` flow.

## Deployment Checklist
1. `npm run docs:generate && npm run build`
2. `docker compose -f docker/compose.yml up --build`
3. `docker compose -f docker/compose.yml exec api npm run migrate:up`
4. Verify:
   - `https://localhost:3000/healthz`
   - `https://localhost:3000/openapi.yaml`
   - `https://localhost:3000/docs`
5. Execute manual validation runbook and log findings below.

## Known Issues & Follow-Ups
- None at this time. Capture future findings here.

## Validation Log
| Date | Operator | Result | Notes |
|------|----------|--------|-------|
| 2025-10-17 | GitHub Copilot | ✅ | 2FA enrollment, challenge, trusted device, and recovery code flows pass per docs/manual-validation/2fa.md |
