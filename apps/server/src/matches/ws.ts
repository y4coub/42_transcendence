import type { SocketStream } from '@fastify/websocket';
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { getMatchById, getPlayerById } from '@tournament/repository';
import { tournamentMatchSchema, tournamentMatchIdSchema, tournamentPlayerIdSchema } from '@tournament/schemas';

import { matchStatePayloadSchema, clientMessageSchema, type ClientMessage as PongClientMessage } from './schemas';
import * as matchRepo from './repository';
import { PongGameService } from './pongService';

interface JoinMessage {
  type: 'join';
}

interface LeaveMessage {
  type: 'leave';
}

interface PingMessage {
  type: 'ping';
}

interface StateMessage {
  type: 'state';
  payload: Record<string, unknown>;
}

type ClientMessage = JoinMessage | LeaveMessage | PingMessage | StateMessage;

type RawData = string | Buffer | ArrayBuffer | Buffer[];

interface SocketContext {
  stream: SocketStream;
  playerId: string;
  matchId: string;
  joined: boolean;
}

const matchParamsSchema = z.object({
  matchId: tournamentMatchIdSchema,
});

const matchQuerySchema = z.object({
  playerId: tournamentPlayerIdSchema,
});

const serialize = (payload: Record<string, unknown>) => JSON.stringify(payload);

const parseMessage = (raw: RawData): ClientMessage | undefined => {
  let payload: string;

  if (typeof raw === 'string') {
    payload = raw;
  } else if (raw instanceof Buffer) {
    payload = raw.toString('utf-8');
  } else if (Array.isArray(raw)) {
    payload = Buffer.concat(raw).toString('utf-8');
  } else if (raw instanceof ArrayBuffer) {
    payload = Buffer.from(raw).toString('utf-8');
  } else {
    return undefined;
  }

  try {
    const parsed = JSON.parse(payload) as ClientMessage;
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
      return undefined;
    }

    return parsed;
  } catch {
    return undefined;
  }
};

const matchWsPlugin: FastifyPluginAsync = async (app) => {
  const matchSubscribers = new Map<string, Set<SocketContext>>();
  
  // Initialize Pong game service
  const pongGameService = new PongGameService(app.log);
  const pendingRematches = new Map<string, { requesterId: string; timeout: ReturnType<typeof setTimeout> }>();

  const clearPendingRematch = (matchId: string, requesterId?: string): void => {
    const pending = pendingRematches.get(matchId);
    if (!pending) {
      return;
    }

    if (requesterId && pending.requesterId !== requesterId) {
      pendingRematches.delete(matchId);
      return;
    }

    clearTimeout(pending.timeout);
    pendingRematches.delete(matchId);
  };

  const sendToContext = (context: SocketContext, payload: Record<string, unknown>) => {
    if (context.stream.socket.readyState === context.stream.socket.OPEN) {
      context.stream.socket.send(serialize(payload));
    }
  };

  const broadcastRematch = (matchId: string, payload: Record<string, unknown>) => {
    pongGameService.broadcastMessage(matchId, payload);
  };

  const broadcastState = (matchId: string, payload: Record<string, unknown>, except?: SocketContext) => {
    const subscribers = matchSubscribers.get(matchId);
    if (!subscribers) {
      return;
    }

    const serialized = serialize(payload);
    for (const context of subscribers) {
      if (except && context === except) {
        continue;
      }

      if (context.stream.socket.readyState === context.stream.socket.OPEN) {
        context.stream.socket.send(serialized);
      }
    }
  };

  const subscribe = (matchId: string, context: SocketContext) => {
    let subscribers = matchSubscribers.get(matchId);
    if (!subscribers) {
      subscribers = new Set();
      matchSubscribers.set(matchId, subscribers);
    }

    subscribers.add(context);
    context.joined = true;

    sendToContext(context, { type: 'joined', matchId });
  };

  const unsubscribe = (matchId: string, context: SocketContext) => {
    const subscribers = matchSubscribers.get(matchId);
    if (!subscribers) {
      return;
    }

    subscribers.delete(context);
    if (subscribers.size === 0) {
      matchSubscribers.delete(matchId);
    }

    context.joined = false;
    sendToContext(context, { type: 'left', matchId });
  };

  app.get<{ Params: { matchId: string }; Querystring: { playerId: string } }>(
    '/ws/match/:matchId',
    { websocket: true },
    async (stream, request) => {
      const params = matchParamsSchema.safeParse(request.params);
      const query = matchQuerySchema.safeParse(request.query);

      if (!params.success || !query.success) {
        stream.socket.close(4400, 'Invalid parameters');
        return;
      }

      const matchId = params.data.matchId;
      const playerId = query.data.playerId;

      const match = getMatchById(matchId);
      if (!match) {
        stream.socket.close(4404, 'Match not found');
        return;
      }

      const player = getPlayerById(playerId);
      if (!player || player.tournamentId !== match.tournamentId) {
        stream.socket.close(4401, 'Unauthorized');
        return;
      }

      if (match.p1Id !== playerId && match.p2Id !== playerId) {
        stream.socket.close(4401, 'Unauthorized');
        return;
      }

      const context: SocketContext = {
        stream,
        playerId,
        matchId,
        joined: false,
      };

      stream.socket.on('message', (raw: RawData) => {
        const message = parseMessage(raw);
        if (!message) {
          sendToContext(context, { type: 'error', error: 'Invalid payload' });
          return;
        }

        switch (message.type) {
          case 'ping':
            sendToContext(context, { type: 'pong' });
            break;
          case 'join':
            if (context.joined) {
              sendToContext(context, { type: 'error', error: 'Already joined' });
              break;
            }

            subscribe(matchId, context);
            sendToContext(context, {
              type: 'match',
              match: tournamentMatchSchema.parse(match),
              playerId,
            });
            break;
          case 'leave':
            if (context.joined) {
              unsubscribe(matchId, context);
            }
            stream.socket.close(1000, 'Client left');
            break;
          case 'state':
            if (!context.joined) {
              sendToContext(context, { type: 'error', error: 'Join before sending state' });
              break;
            }

            if (!matchStatePayloadSchema.safeParse(message.payload).success) {
              sendToContext(context, { type: 'error', error: 'Invalid state payload' });
              break;
            }

            broadcastState(matchId, {
              type: 'state',
              matchId,
              from: playerId,
              payload: message.payload,
              ts: new Date().toISOString(),
            }, context);
            break;
          default:
            sendToContext(context, { type: 'error', error: 'Unsupported message type' });
        }
      });

      const cleanup = () => {
        if (context.joined) {
          unsubscribe(matchId, context);
        }
      };

      stream.socket.on('close', cleanup);
      stream.socket.on('error', (error: unknown) => {
        app.log.warn({ err: error }, 'Match WS stream error');
        cleanup();
      });
    },
  );

  // ========================================================================
  // Pong Game WebSocket Handler
  // ========================================================================

  /**
   * WebSocket endpoint for real-time Pong game matches
   * Endpoint: /ws/pong/:matchId?token=<jwt>
   * 
   * Authentication: JWT token passed as query parameter
   * Authorization: User must be p1 or p2 in the match
   * 
   * Features:
   * - Server-authoritative physics at 60 Hz
   * - Player input validation with rate limiting
   * - Game state broadcasting
   * - Countdown before game starts
   * - Game over detection and winner recording
   */
  app.get<{ Params: { matchId: string }; Querystring: { token?: string } }>(
    '/ws/pong/:matchId',
    { websocket: true },
    async (stream, request) => {
      const { matchId } = request.params;
      const { token } = request.query;

      // Validate JWT token from query parameter
      if (!token) {
        stream.socket.close(4401, 'Missing authentication token');
        return;
      }

      let userId: string;
      try {
        // Verify JWT token
        const decoded = await app.jwt.verify(token) as { sub?: string };
        userId = decoded.sub ?? '';
        
        if (!userId) {
          stream.socket.close(4401, 'Invalid token: missing user ID');
          return;
        }
      } catch (error) {
        app.log.warn({ err: error }, 'JWT verification failed');
        stream.socket.close(4401, 'Invalid or expired token');
        return;
      }

      // Get match from database
      const match = matchRepo.getMatch(matchId);
      if (!match) {
        stream.socket.close(4404, 'Match not found');
        return;
      }

      // Verify user is a player in the match
      if (match.p1Id !== userId && match.p2Id !== userId) {
        stream.socket.close(4401, 'You are not a player in this match');
        return;
      }

      // Send connection_ok message
      const sendMessage = (payload: Record<string, unknown>) => {
        if (stream.socket.readyState === stream.socket.OPEN) {
          stream.socket.send(JSON.stringify(payload));
        }
      };

      sendMessage({
        type: 'connection_ok',
        userId,
        matchId,
      });

      app.log.info({ matchId, userId }, 'Pong WebSocket connected');

      // Get or create game instance
      const game = pongGameService.getOrCreateGame(matchId, match.p1Id, match.p2Id);

      // Message handler
      stream.socket.on('message', (raw: RawData) => {
        try {
          const payload = raw.toString('utf-8');
          const parsed = JSON.parse(payload);
          
          // Validate message with Zod schema
          const result = clientMessageSchema.safeParse(parsed);
          if (!result.success) {
            sendMessage({
              type: 'error',
              code: 'INVALID_INPUT',
              message: 'Invalid message format',
              matchId,
            });
            return;
          }

          const message = result.data as PongClientMessage;

          // Handle different message types
          switch (message.type) {
            case 'ping':
              sendMessage({
                type: 'pong',
                timestamp: Date.now(),
              });
              break;

            case 'join_match':
              // Add player to game
              app.log.info({ matchId, userId }, 'Received join_match message');
              pongGameService.addPlayer(matchId, userId, stream);
              
              // Send joined confirmation with current game state
              const currentState = pongGameService.getGameState(matchId);
              sendMessage({
                type: 'joined',
                matchId: message.matchId,
                playerId: userId,
                match: {
                  id: match.id,
                  p1Id: match.p1Id,
                  p2Id: match.p2Id,
                  state: match.state,
                  p1Score: match.p1Score,
                  p2Score: match.p2Score,
                },
                ...(currentState && {
                  gameState: {
                    ball: currentState.ball,
                    p1: currentState.p1,
                    p2: currentState.p2,
                    score: currentState.score,
                  }
                })
              });
              app.log.info({ matchId, userId }, 'Player joined match');
              break;

            case 'leave_match':
              // Remove player from game
              pongGameService.removePlayer(matchId, userId);
              
              sendMessage({
                type: 'left',
                matchId: message.matchId,
              });
              stream.socket.close(1000, 'Player left match');
              break;

            case 'request_state':
              // Send current game state
              const state = pongGameService.getGameState(matchId);
              if (state) {
                sendMessage({
                  type: 'state',
                  matchId: message.matchId,
                  timestamp: state.timestamp,
                  ball: state.ball,
                  p1: state.p1,
                  p2: state.p2,
                  score: state.score,
                });
              }
              break;

            case 'input':
              // Handle player input
              pongGameService.handleInput(
                matchId,
                userId,
                message.direction,
                message.seq,
                message.clientTime,
              );
              break;

            case 'ready':
              // Set player ready status
              app.log.info({ matchId, userId }, 'Received ready message');
              pongGameService.setPlayerReady(matchId, userId);
              break;

            case 'pause':
              // Pause the game (T023)
              {
                const success = pongGameService.pauseGame(matchId, userId);
                if (!success) {
                  sendMessage({
                    type: 'error',
                    code: 'PAUSE_FAILED',
                    message: 'Cannot pause game',
                    matchId,
                  });
                }
              }
              break;

            case 'resume':
              // Resume the game (T023)
              {
                const success = pongGameService.resumeGame(matchId, userId);
                if (!success) {
                  sendMessage({
                    type: 'error',
                    code: 'RESUME_FAILED',
                    message: 'Cannot resume game - only pauser can resume',
                    matchId,
                  });
                }
              }
              break;

            case 'rematch_request': {
              const opponentId = match.p1Id === userId ? match.p2Id : match.p1Id;
              if (!opponentId) {
                sendMessage({
                  type: 'error',
                  code: 'REMATCH_UNAVAILABLE',
                  message: 'Opponent unavailable for rematch',
                  matchId,
                });
                break;
              }

              const existing = pendingRematches.get(matchId);
              if (existing) {
                if (existing.requesterId === userId) {
                  // Duplicate request from same player - ignore
                  break;
                }

                // Opponent already requested - treat as accept
                clearPendingRematch(matchId);
                broadcastRematch(matchId, {
                  type: 'rematch_accept',
                  matchId,
                  from: userId,
                });
                break;
              }

              const timeout = setTimeout(() => {
                const pending = pendingRematches.get(matchId);
                if (!pending || pending.requesterId !== userId) {
                  return;
                }

                pendingRematches.delete(matchId);
                const responderId = match.p1Id === userId ? match.p2Id : match.p1Id;
                broadcastRematch(matchId, {
                  type: 'rematch_decline',
                  matchId,
                  from: responderId ?? userId,
                  reason: 'timeout',
                });
              }, 15000);

              pendingRematches.set(matchId, { requesterId: userId, timeout });
              broadcastRematch(matchId, {
                type: 'rematch_request',
                matchId,
                from: userId,
              });
              break;
            }

            case 'rematch_accept': {
              const pending = pendingRematches.get(matchId);
              if (!pending) {
                break;
              }

              if (pending.requesterId === userId) {
                // Requester cannot accept their own request
                break;
              }

              clearPendingRematch(matchId);
              broadcastRematch(matchId, {
                type: 'rematch_accept',
                matchId,
                from: userId,
              });
              break;
            }

            case 'rematch_decline': {
              const pending = pendingRematches.get(matchId);
              if (!pending) {
                break;
              }

              clearPendingRematch(matchId);
              broadcastRematch(matchId, {
                type: 'rematch_decline',
                matchId,
                from: userId,
                reason: message.reason ?? 'decline',
              });
              break;
            }

            case 'forfeit': {
              clearPendingRematch(matchId);
              pongGameService.forfeitGame(matchId, userId);
              break;
            }

            default:
              sendMessage({
                type: 'error',
                code: 'INVALID_INPUT',
                message: 'Unsupported message type',
                matchId,
              });
          }
        } catch (error) {
          app.log.error({ err: error }, 'Failed to process message');
          sendMessage({
            type: 'error',
            code: 'INVALID_INPUT',
            message: 'Failed to process message',
            matchId,
          });
        }
      });

      stream.socket.on('close', (code: number, reason: Buffer) => {
        app.log.info({ matchId, userId, code, reason: reason.toString() }, 'Pong WebSocket closed');
        if (pendingRematches.has(matchId)) {
          clearPendingRematch(matchId);
          broadcastRematch(matchId, {
            type: 'rematch_decline',
            matchId,
            from: userId,
            reason: 'disconnect',
          });
        }
        // Clean up player connection
        pongGameService.removePlayer(matchId, userId);
      });

      stream.socket.on('error', (error: unknown) => {
        app.log.warn({ err: error, matchId, userId }, 'Pong WebSocket error');
        if (pendingRematches.has(matchId)) {
          clearPendingRematch(matchId);
          broadcastRematch(matchId, {
            type: 'rematch_decline',
            matchId,
            from: userId,
            reason: 'disconnect',
          });
        }
        // Clean up player connection
        pongGameService.removePlayer(matchId, userId);
      });
    },
  );
};

export default fp(matchWsPlugin, {
  name: 'match-ws',
});
