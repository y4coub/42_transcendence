# Spec — Authentication & Identity

## Module Mapping
- Web (Major): Fastify backend.
- User Management (Major): Standard user management (accounts, profiles).
- User Management (Major): Remote authentication (OAuth 2.0 — 42).

## Goals
Email+password with Argon2id; OAuth 42 (PKCE + state); JWT access (15m) + refresh (7d) with rotation; `/me`.

## REST
- POST /auth/register {email, password, displayName}
- POST /auth/login {email, password}
- POST /auth/token/refresh
- POST /auth/logout
- GET  /auth/me
- GET  /auth/42/start        # redirect to 42
- GET  /auth/42/callback     # exchange code->token, upsert user, issue JWTs

## Data
users(id, email UNIQUE, display_name, pass_hash, avatar_url,
      provider 'local'|'42', provider_sub, twofa_secret, created_at)
sessions(id, user_id, issued_at, expires_at)

## Rules
- Passwords hashed with Argon2id; parameterized SQL; input validation on all forms.
- Refresh rotation; revoke old refresh on use.
- First 42 login creates user bound to `provider_sub`; subsequent logins update profile fields.
