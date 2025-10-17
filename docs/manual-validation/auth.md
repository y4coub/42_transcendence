# Manual Validation — Secure Account Access

## Prerequisites
- `.env` populated with JWT and 42 OAuth credentials (client id/secret/redirect).
- Dependencies installed and TypeScript compiled: `npm install && npm run build` inside `apps/api`.
- Database bootstrapped: `npm run migrate:up`.
- API running locally (`npm run dev` in `apps/api`) or via Docker Compose with TLS termination.

## 1. Email + Password Registration
1. POST `https://localhost/auth/register` with JSON body:
   ```json
   {"email":"player1@example.com","password":"CorrectHorse1!","displayName":"PlayerOne"}
   ```
2. Expect `201` with `accessToken`, `refreshToken`, and `expiresIn`. Record both tokens for later steps.
3. Attempt the same payload again and confirm `409`.

## 2. Login & Token Refresh
1. POST `https://localhost/auth/login` with the same credentials. Expect `200` with new tokens.
2. POST `https://localhost/auth/token/refresh` with the issued `refreshToken`. Expect `200` and verify the returned `accessToken` differs from the previous one.
3. Retain the latest tokens for downstream calls.

## 3. Authenticated Profile (`/auth/me`)
1. GET `https://localhost/auth/me` with `Authorization: Bearer <accessToken>` from the refresh step.
2. Expect `200` containing `id`, `displayName`, `email`, and `provider` (`local`).
3. Repeat with an invalid/expired token and confirm `401`.

## 4. Logout
1. POST `https://localhost/auth/logout` with the active access token.
2. Expect `204`.
3. Retry `/auth/me` with the same token and confirm `401`.

## 5. OAuth 42 Flow (PKCE + State)
1. Trigger `GET https://localhost/auth/42/start`. Capture the `Location` header and associated `state` query value.
2. Manually visit the redirect URL in a browser, approve the application, and allow the 42 sandbox to call back.
3. On success, the backend responds with `accessToken` and `refreshToken`. Verify the user now exists in the database and `/auth/me` reports `provider` = `42`.
4. Repeat the callback using the same `state` value to confirm the backend rejects it with `400`.

## 6. Refresh Revocation Check
1. After a successful refresh, reuse the previous (now invalidated) `refreshToken` against `/auth/token/refresh` and confirm `401`.

## 7. Observability Spot Check
- Inspect API logs to ensure registration/login/refresh entries include structured context (`service`, `env`, `migration`, etc.) and that OAuth errors would emit diagnostic data without secrets.

Document outcomes (status codes, payload snippets, notable logs) before marking T031 complete.
