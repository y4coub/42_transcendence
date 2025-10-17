# Spec — Match Bridge (REST + WS Relay; Game Logic on Front)

## REST
- POST  /api/matches {opponentId?} -> {matchId}
- GET   /api/matches/:id           -> {players, startedAt, finishedAt, lastScore?}
- PATCH /api/matches/:id/result {p1Score,p2Score,winnerId} -> {ok:true}

## WebSocket
- WS /ws/match/:id
  - Client->Server: join, leave
  - Engine(front)->Server: state({ball,paddles,score,timestamp})
  - Server->Client: state(...)

## Rules
- Server is authoritative for room membership; only participants can join.
- Backend relays frames and persists final results; no physics here.
