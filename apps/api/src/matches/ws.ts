import type { SocketStream } from '@fastify/websocket';
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { getMatchById, getPlayerById } from '@tournament/repository';
import { tournamentMatchSchema, tournamentMatchIdSchema, tournamentPlayerIdSchema } from '@tournament/schemas';

import { matchStatePayloadSchema } from './schemas';

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

  const sendToContext = (context: SocketContext, payload: Record<string, unknown>) => {
    if (context.stream.socket.readyState === context.stream.socket.OPEN) {
      context.stream.socket.send(serialize(payload));
    }
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
};

export default fp(matchWsPlugin, {
  name: 'match-ws',
});
