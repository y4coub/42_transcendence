# Spec — Profile & Stats

## REST
- GET   /api/users/:id
- PATCH /api/users/:id {displayName, avatarUrl}
- GET   /api/users/:id/stats -> {wins, losses, streak, recent:[{opponentId, p1Score, p2Score, ts}]}

## Notes
- Auth required; a user can only PATCH their own profile.
- Stats derived from `matches` (and possibly tournament tables).
