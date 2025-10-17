# Spec — API Documentation

## Deliverables
- Single OpenAPI 3 source at `/openapi.yaml`.
- Human docs at **GET /docs** (Redoc/Scalar UI static page).
- Policy: any route change must update OpenAPI in the same PR.

## Must Document
- Auth: /auth/register, /auth/login, /auth/token/refresh, /auth/logout, /auth/me, /auth/42/*
- Users: /api/users/:id, /api/users/:id/stats
- Chat: /api/chat/history, /api/chat/dm/:userId, WS /ws/chat events
- Tournament: all endpoints above + WS notices
- Matches: /api/matches*, WS /ws/match/:id events
