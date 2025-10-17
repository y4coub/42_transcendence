# Spec — Live Chat (Realtime + History)

## WebSocket
- WS /ws/chat (JWT required)
  - Client->Server:
    - join({room})
    - channel({room, body})
    - dm({to, body})
    - block({userId})
  - Server->Client:
    - message({from, room?, to?, body, ts})
    - presence({userId, online})
    - invite({fromUserId, matchId})                # invite to match
    - tournamentAnnounce({matchId, p1, p2, eta})   # tournament notice

## REST
- GET /api/chat/history?room=general&limit=50
- GET /api/chat/dm/:userId?cursor=...

## Data
chat_messages(id, from_id, to_id NULL, room NULL, body, created_at)
blocks(blocker_id, blocked_id, PRIMARY KEY(blocker_id,blocked_id))

## Rules
- Enforce blocks on delivery + history.
- Max message length 2000; store plain text; UI escapes on render.
- Backpressure + rate-limit on WS sends; auth required for all ops.
