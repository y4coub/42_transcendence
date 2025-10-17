# Manual Validation Index

This directory captures the manual smoke procedures required by the project constitution. Each feature slice ships with its own checklist so releases can be validated without automated tests.

| Story | Document | Scope |
|-------|----------|-------|
| US1 - Secure Account Access | `auth.md` | Email/password login, OAuth 42 callback, token rotation |
| US2 - Real-Time Chat Collaboration | `chat.md` | Channel messaging, DM invites, block enforcement, WebSocket presence |
| US3 - Tournament and Matchmaking Flow | `tournament.md` | Bracket seeding, queue operations, match assignment notifications |
| US4 - Player Profile & Stats Overview | `profile.md` | Profile updates, stats aggregation, cache refresh |
| US5 - Self-Service API Documentation | `docs.md` | `/docs` rendering, OpenAPI parity, schema examples |
| Release Smoke | `full-run.md` | End-to-end verification across modules, Docker bring-up |

## Execution Guidance

- Run the story-specific checklist whenever a related module changes.
- Log observed latencies alongside measurable success criteria from `spec.md`.
- Capture incidents or deviations in the corresponding document to inform follow-up fixes.
- Update this index if new stories or manual flows are introduced.
