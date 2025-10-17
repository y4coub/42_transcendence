# Manual Validation — API Documentation (US5)

Use this checklist to confirm the documentation experience before release.

## Prerequisites
- Backend running locally via `docker compose -f docker/compose.yml up`.
- Latest OpenAPI bundle generated: `npm run docs:generate` (from `apps/api`).
- Tools: `curl`, browser, and `jq` (optional) for quick inspections.

## 1. OpenAPI Bundle Available
1. Request the raw spec:
   ```bash
   curl -sS https://localhost/openapi.yaml
   ```
   - Expect HTTP `200` with YAML payload.
   - (Optional) pipe to `head`/`jq` to confirm structure.
2. Introduce network failure (disable API) and re-try to ensure the server returns an error (should fail, confirming live endpoint).

## 2. Scalar UI Rendering
1. Visit `https://localhost/docs` in a browser.
   - Confirm Scalar loads without mixed-content warnings.
   - Verify the title shows "FT Backend API Docs" and navigation lists all modules (Auth, Users, Chat, Tournament, Matches, Docs).
2. Expand an endpoint (e.g., `POST /auth/login`) and ensure request/response schemas align with expectations.

## 3. Spec Freshness Check
1. Make a small, temporary edit to `openapi/openapi.yaml` (e.g., change a description) and rerun:
   ```bash
   (cd apps/api && npm run docs:generate)
   ```
2. Reload `/openapi.yaml`; confirm the change appears. Revert the edit afterward.

## 4. Download & Client Integration
1. Save the spec locally:
   ```bash
   curl -sS https://localhost/openapi.yaml -o api-spec.yaml
   ```
   - Confirm file size is reasonable (>0 bytes) and `head api-spec.yaml` shows YAML header.
2. Import the downloaded file into a REST client (Insomnia, Postman, etc.) to verify schema parses cleanly.

## 5. Security & CORS
- From a new terminal, attempt to fetch without HTTPS (e.g., `http://localhost/openapi.yaml`). Caddy should redirect to HTTPS (301/308).
- Optional: check network tab to confirm Scalar only requests `/openapi.yaml` with GET and no unexpected endpoints.

## 6. Cleanup
- Remove any temporary spec edits or downloaded files (`rm api-spec.yaml`).
- Document pass/fail status and observations in the release notes.
