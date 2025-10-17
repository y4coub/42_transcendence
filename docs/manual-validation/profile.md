# Manual Validation — Profile & Stats (US4)

This checklist verifies the profile editing and stats aggregation endpoints. Run with a clean database or known seed to ensure deterministic expectations.

## Prerequisites
- Backend running locally via `docker compose -f docker/compose.yml up`.
- SQLite database with at least two registered users (Email/42) and tournament data to produce matches.
- Tools: `curl`, `jq`, and a REST client for convenience.
- Obtain access tokens for two distinct users (`USER_A`, `USER_B`).

## 1. Profile Retrieval
1. Request: `GET /users/{userId}` using `USER_A` token.
   ```bash
   curl -sS -H "Authorization: Bearer ${USER_A_TOKEN}" \
     http://localhost:3000/users/${USER_A_ID} | jq
   ```
   - Expect `200` with `userId` and `displayName` matching `USER_A`.
   - Verify timestamps exist and `avatarUrl` is nullable.
2. Repeat for `USER_B` while authenticated as `USER_A`.
   - Expect `200` and read-only access to other profiles.

## 2. Profile Update
1. Issue PATCH as the owner:
   ```bash
   curl -sS -X PATCH \
     -H "Authorization: Bearer ${USER_A_TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{"displayName":"NewHandle","avatarUrl":"https://example.com/avatar.png"}' \
     http://localhost:3000/users/${USER_A_ID} | jq
   ```
   - Expect `200`; response reflects new values.
2. Re-fetch via `GET` to confirm persistence.
3. Attempt PATCH on `USER_B` while authenticated as `USER_A`.
   - Expect `403 Forbidden`.
4. Send PATCH with empty body or invalid URL.
   - Expect `400` with validation message.

## 3. Stats Retrieval
1. Ensure matches exist (run tournament smoke script or manually record results).
2. Fetch stats without refresh:
   ```bash
   curl -sS -H "Authorization: Bearer ${USER_A_TOKEN}" \
     http://localhost:3000/users/${USER_A_ID}/stats | jq
   ```
   - Expect `200` containing `wins`, `losses`, `streak`, `lastResult`, and `recent` array.
   - Confirm `recent` entries show opponent IDs and scores.
3. Fetch with refresh and custom limit:
   ```bash
   curl -sS -H "Authorization: Bearer ${USER_A_TOKEN}" \
     "http://localhost:3000/users/${USER_A_ID}/stats?refresh=true&limit=3" | jq
   ```
   - Expect recomputed aggregates and `recent` truncated to three entries.
4. Request stats for a non-existent user.
   - Expect `404`.

## 4. Cross-User Access
- Perform `GET /users/{USER_B_ID}/stats` authenticated as `USER_A`.
  - Expect `200`; stats are public to authenticated users.
- Attempt any request without JWT header.
  - Expect `401`.

## 5. Cleanup
- Optionally revert display names/avatars or reset database.

Document results (success/failure, notes) in the manual validation log for US4.
