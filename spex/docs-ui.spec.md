# Feature: API Docs UI with Scalar

Goal
- Serve interactive API reference at /docs using Scalar
- Source of truth is openapi.yaml in specs/backend
- Auto-refresh in dev, versioned in prod builds

Non-functional
- HTTPS only through proxy
- In production, restrict access (either logged-in admin or Basic Auth)
- Zero PII in examples, CORS off for /docs assets
- Cache: short-lived in dev, long-lived in prod with cache-busting hash

Acceptances
- GET /api/openapi.json returns bundled spec
- GET /docs renders Scalar and loads spec successfully
- 200 lighthouse performance score for static docs shell in prod build
- If gated, unauthorized users get 401
