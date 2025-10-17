# Spec — Tournament & Matchmaking (Mandatory Backbone)

## Purpose
Provide minimal backend to satisfy subject: registration by alias or account, FIFO matchmaking, “announce next”, results store. UI/game handled on front.

## REST
- POST  /api/tournament/start {name} -> {tournamentId}
- POST  /api/tournament/register {alias, userId?} -> {playerId}
- POST  /api/tournament/queue/join {playerId} -> {ok:true}
- POST  /api/tournament/announce-next -> {matchId, p1, p2, order}
- GET   /api/tournament/next -> {matchId, p1, p2, order}
- POST  /api/tournament/result {matchId, p1Score, p2Score, winnerId} -> {ok:true}
- GET   /api/tournament/board -> [{matchId, p1, p2, status, winnerId?}]

## WS (optional but recommended)
- WS /ws/tournament  (JWT optional when alias-only)
  - server->client: announceNext({matchId,p1,p2,startsAt})
  - server->client: result({matchId,winnerId})

## Data
tournaments(id,name,created_at,status)
tournament_players(id,tournament_id, alias, user_id NULL)
tournament_matches(id,tournament_id,p1_id,p2_id,order_idx,status,winner_id NULL)

## Notes
- Works with or without accounts (alias mode). When Standard User Management is present, `alias` may link to user id and persist stats.  
- Equal treatment: backend does not change paddle speeds; front/engine must enforce identical speeds.
