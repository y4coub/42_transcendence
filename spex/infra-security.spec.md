# Spec — Infra, Delivery, Security

## Docker
- One command spins up reverse proxy (TLS), API service, and serves the SPA bundle provided by front.
- Works on campus constraints; no bind-mount dependency required for runtime.

## Security Baseline
- HTTPS/WSS mandatory; HSTS at proxy.
- Hashing: Argon2id; validation on all inputs; parameterized SQL; rate-limits on auth & WS connects.
- JWT access 15m, refresh 7d with rotation & revoke; secrets in `.env` (ignored by git).
- CORS restricted to SPA origin; cookies Secure+HttpOnly if used.

## Observability
- Health: /api/health, /api/version; request/error logs.
