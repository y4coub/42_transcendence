# Manual Validation — Optional TOTP 2FA

## Prerequisites
- Base authentication flows validated per `docs/manual-validation/auth.md`.
- Environment variables populated in `.env`:
  - `TWOFA_ENCRYPTION_KEY` (64 hex chars)
  - `TWOFA_CHALLENGE_TTL_SECONDS` (default 300)
  - `TWOFA_TRUSTED_DEVICE_SECRET`, `TWOFA_TRUSTED_DEVICE_TTL_DAYS`, `TWOFA_TRUSTED_DEVICE_MAX`.
- API running locally with TLS (`docker compose -f docker/compose.yml up --build` or `npm run dev`).
- Test account credentials from auth validation (e.g., `player1@example.com`).
- HTTP client (Postman, curl) and optional QR-capable authenticator app.

> Tip: When capturing QR data in headless environments, use the returned `otpauthUrl` to seed your authenticator manually if rendering the data URL is inconvenient.

## 1. Baseline Status
1. GET `https://localhost/auth/2fa/status` with `Authorization: Bearer <accessToken>`.
2. Expect `200` with `status: "disabled"` and `pendingExpiresAt`, `lastVerifiedAt`, `recoveryCodesCreatedAt` all `null`.

## 2. Start Enrollment
1. POST `https://localhost/auth/2fa/enroll/start`.
2. Expect `200` with:
   - `status: "pending"`.
   - `secret`, `otpauthUrl`, and `qrCodeDataUrl` (base64 data URL).
   - `recoveryCodes` array (record securely for next step).
   - `expiresAt` timestamp in the future.
3. Import the TOTP secret into an authenticator (scan QR code or paste `otpauthUrl`).

## 3. Confirm Enrollment
1. Generate a current TOTP code from the authenticator.
2. POST `https://localhost/auth/2fa/enroll/confirm` with body `{ "code": "123456" }` (replace with real code).
3. Expect `200` with `status: "active"`, `pendingExpiresAt: null`, and `recoveryCodesCreatedAt` populated.
4. GET `/auth/2fa/status` again to confirm persisted state (`lastVerifiedAt` should be non-null).

## 4. Login Challenge Flow
1. Logout to clear the active session (`POST /auth/logout`).
2. Attempt standard login `POST /auth/login` with email/password.
3. Expect `202` and response `{ type: "challenge", challengeId, challengeToken, expiresAt }`.
4. Immediately POST `https://localhost/auth/login/challenge` with body:
   ```json
   {
     "challengeId": "<from step 3>",
     "challengeToken": "<from step 3>",
     "code": "<current TOTP>",
     "rememberDevice": true,
     "deviceName": "Manual Validation Laptop"
   }
   ```
5. Expect `200` containing `accessToken`, `refreshToken`, `expiresIn`, and `trustedDevice` metadata. Note the returned trusted device token for later.
6. GET `/auth/2fa/status`; `lastVerifiedAt` should update to the recent timestamp.

## 5. Trusted Device Reuse & Management
1. Logout again. Retry login `POST /auth/login` providing `trustedDevice` assertion:
   ```json
   {
     "email": "player1@example.com",
     "password": "CorrectHorse1!",
     "trustedDevice": {
       "deviceId": "<trustedDevice.deviceId>",
       "token": "<trustedDevice.token>"
     }
   }
   ```
2. Expect direct `200` without challenge. This confirms trusted-device bypass.
3. GET `/auth/2fa/trusted-devices`; ensure the device list includes the remembered entry and `totalActive >= 1`.
4. DELETE `/auth/2fa/trusted-devices/{deviceId}` using the same ID and verify `204`.
5. POST `/auth/2fa/trusted-devices/revoke-all` and confirm response `{ "removed": <number> }` equals remaining entries (0 afterwards).

## 6. Recovery Codes
1. POST `/auth/2fa/recovery/regenerate` with body `{ "code": "<current TOTP>" }`.
2. Expect `200` with a new `recoveryCodes` array (store temporarily).
3. Intentionally complete a login challenge using one of these recovery codes instead of a TOTP to ensure fallback path works:
   - Trigger login to obtain challenge (`/auth/login`).
   - POST `/auth/login/challenge` with `code` set to one unused recovery code.
   - Expect `200` tokens and observe `trustedDevice` optional data.
4. Attempt to reuse the same recovery code; expect `401` (challenge fails) and confirm logs mark the attempt.

## 7. Disable & Cancel Scenarios
1. While active, POST `/auth/2fa/disable` without `code`; expect `400` with error message.
2. Repeat with body `{ "code": "<current TOTP>" }`; expect `200` and `status: "disabled"`.
3. Start enrollment again (Step 2) and immediately POST `/auth/2fa/enroll/cancel`; expect `status: "disabled"` and cleanup of pending enrollment (status doc and status endpoint).

## 8. Maintenance Sweep (Optional)
1. With at least one pending enrollment left to expire (adjust system clock or wait), run:
   ```bash
   npm run twofa:maintenance
   ```
2. Inspect logs for `Cancelled expired two-factor enrollment` or `Removed expired trusted devices` messages.

## Exit Criteria
- All endpoints return expected status codes and payloads.
- Trusted device reuse works when enabled and revocation removes bypass ability.
- Recovery codes are rotated, tracked, and single-use enforced.
- Enrollment state transitions (`disabled` → `pending` → `active` → `disabled`) behave deterministically.
- Maintenance script performs cleanup without errors.

Record notable timestamps, challenge IDs, and trusted device identifiers in the release notes validation table.
