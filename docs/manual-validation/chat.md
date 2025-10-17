# Manual Validation — Real-Time Chat

> Purpose: Confirm baseline chat functionality covering channel messaging, direct messages, and block enforcement via REST and WebSocket flows.

## Prerequisites
- Backend running locally with `npm run dev` (ensure `.env` values for JWT/OAuth are configured)
- Two test users registered (e.g., `alice@example.com`, `bob@example.com`)
- Tools: cURL or Postman for REST, browser or `wscat` for WS

## Session Setup
1. **Register + Login (if needed)**
   - POST `/auth/register` for any missing users.
   - POST `/auth/login` to obtain `accessToken`/`refreshToken` for each tester.
   - Store Alice/Bob tokens for later requests.
2. **Health Check**
   - GET `/healthz` to confirm server is running.

## Channel Messaging
1. **Create Channel** (Alice)
   - POST `/chat/channels` with body `{ "title": "General" }` using Alice's token.
   - Expect `201` response with channel + membership payload; note returned `slug`.
2. **Join Channel** (Bob)
   - POST `/chat/channels/{slug}/join` using Bob's token.
   - Expect `200` membership response.
3. **Fetch History (empty)**
   - GET `/chat/history?room={slug}&limit=20` (Alice).
   - Expect `200` with empty array.
4. **Post Messages**
   - Alice: connect to `/ws/chat` via WebSocket (send `Authorization: Bearer <token>` header).
   - After `welcome`, send `{ "type": "join", "room": "{slug}" }` then `{ "type": "channel", "room": "{slug}", "body": "Hello team" }`.
   - Bob: connect similarly, join room, ensure he receives `message` event with body `Hello team`.
5. **History After Message**
   - GET `/chat/history?room={slug}&limit=20` (Bob).
   - Expect latest entry matches message content, `senderId` = Alice.

## Direct Messages
1. **Send DM**
   - Alice WS: `{ "type": "dm", "to": "{bobId}", "body": "Ping" }`.
   - Bob WS: confirm `message` event with `from` = Alice, `to` = Bob.
2. **Fetch DM History**
   - GET `/chat/dm/{aliceId}?limit=10` using Bob's token.
   - Expect `200` with the DM entry.

## Block Enforcement
1. **Alice Blocks Bob**
   - POST `/chat/blocks/{bobId}` with body `{ "reason": "Testing" }`.
   - Response `200` with block record.
   - Verify `GET /chat/blocks` includes Bob.
2. **Blocked DM Attempt**
   - Bob sends `{ "type": "dm", "to": "{aliceId}", "body": "Are you there?" }`.
   - Expect `error` event `Unable to send direct message` and no message delivery to Alice.
3. **Channel Filter**
   - Alice posts new channel message.
   - Bob should NOT receive the event because block resolves to drop delivery.
4. **Unblock & Retry**
   - DELETE `/chat/blocks/{bobId}`; expect `204`.
   - Repeat DM send (Bob to Alice); message should now deliver.

## Admin Controls (Spot Check)
1. Promote Bob to Admin
   - PATCH `/chat/channels/{slug}` body `{ "visibility": "private" }` using Alice’s token (should succeed).
   - Attempt same PATCH with Bob’s token (should succeed after verifying admin status via service logs or membership list).
2. Leave Channel as Admin
   - Alice POST `/chat/channels/{slug}/leave`.
   - Confirm service promoted Bob to admin (check `/chat/channels` membership list via future endpoint/log).

## Cleanup
- DELETE `/chat/channels/{slug}` with remaining admin token; expect `204`.
- Optional: `POST /auth/logout` to revoke tokens.

## Observations
- Record any errors, timestamps, payloads, or unexpected behavior.
- If latency feels high or events missing, capture logs from server for follow-up.
