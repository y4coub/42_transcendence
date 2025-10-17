# Feature: Optional TOTP 2FA

Goal
- Let users add a second factor to their account later, not required at signup.
- Support TOTP apps like Google Authenticator and 1Password.
- Support backup recovery codes.
- Work with both email+password and 42 OAuth.

Non-functional
- HTTPS only. JWT based sessions. Rate limit all 2FA endpoints.
- Clock skew tolerance: accept 1 step before and after current TOTP window.
- Secrets encrypted at rest. Recovery codes hashed.

User stories
- As a user I can enroll in 2FA by scanning a QR and confirming one TOTP code.
- As a user I can verify 2FA during login.

Acceptance
- If 2FA is enabled, login returns a 2FA challenge instead of full session.
- A challenge can be satisfied by TOTP code or one unused recovery code.
- All codes and attempts are auditable.
