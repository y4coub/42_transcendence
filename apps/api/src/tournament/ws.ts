import type { SocketStream } from '@fastify/websocket';
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import {
  TournamentServiceError,
  getCurrentAnnouncedMatch,
  getTournament,
  onTournamentAnnouncement,
  onTournamentResult,
  type TournamentAnnouncementEvent,
  type TournamentResultEvent,
} from './service';
import { tournamentAnnounceNextResponseSchema, tournamentIdSchema, tournamentMatchSchema } from './schemas';

type RawData = string | Buffer | ArrayBuffer | Buffer[];

interface SubscribeMessage {
  type: 'subscribe';
  tournamentId: string;
}

interface UnsubscribeMessage {
  type: 'unsubscribe';
  tournamentId: string;
}

interface PingMessage {
  type: 'ping';
}

type ClientMessage = SubscribeMessage | UnsubscribeMessage | PingMessage;

interface SocketContext {
  stream: SocketStream;
  userId?: string;
  tournaments: Set<string>;
}

const subscribeSchema = z.object({
  tournamentId: tournamentIdSchema,
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

const tournamentWsPlugin: FastifyPluginAsync = async (app) => {
  const tournamentSubscriptions = new Map<string, Set<SocketContext>>();

  const sendToContext = (context: SocketContext, payload: Record<string, unknown>) => {
    if (context.stream.socket.readyState === context.stream.socket.OPEN) {
      context.stream.socket.send(serialize(payload));
    }
  };

  const broadcastToTournament = (tournamentId: string, payload: Record<string, unknown>) => {
    const subscribers = tournamentSubscriptions.get(tournamentId);
    if (!subscribers) {
      return;
    }

    const serialized = serialize(payload);
    for (const context of subscribers) {
      if (context.stream.socket.readyState === context.stream.socket.OPEN) {
        context.stream.socket.send(serialized);
      }
    }
  };

  const handleAnnouncement = (event: TournamentAnnouncementEvent) => {
    const payload = tournamentAnnounceNextResponseSchema.parse(event.announcement);
    broadcastToTournament(event.tournamentId, {
      type: 'announceNext',
      tournamentId: event.tournamentId,
      payload,
    });
  };

  const handleResult = (event: TournamentResultEvent) => {
    const payload = tournamentMatchSchema.parse(event.match);
    broadcastToTournament(event.tournamentId, {
      type: 'result',
      tournamentId: event.tournamentId,
      payload,
    });
  };

  const offAnnouncement = onTournamentAnnouncement(handleAnnouncement);
  const offResult = onTournamentResult(handleResult);

  app.addHook('onClose', (_instance, done) => {
    offAnnouncement();
    offResult();
    done();
  });

  const subscribe = async (context: SocketContext, tournamentId: string) => {
    if (context.tournaments.has(tournamentId)) {
      sendToContext(context, { type: 'subscribed', tournamentId });
      return;
    }

    try {
      getTournament(tournamentId);
    } catch (error) {
      if (error instanceof TournamentServiceError && error.code === 'TOURNAMENT_NOT_FOUND') {
        sendToContext(context, { type: 'error', error: 'Tournament not found', tournamentId });
        return;
      }

      app.log.warn({ err: error, tournamentId }, 'Failed to verify tournament during subscription');
      sendToContext(context, { type: 'error', error: 'Unable to subscribe', tournamentId });
      return;
    }

    let subscribers = tournamentSubscriptions.get(tournamentId);
    if (!subscribers) {
      subscribers = new Set();
      tournamentSubscriptions.set(tournamentId, subscribers);
    }

    subscribers.add(context);
    context.tournaments.add(tournamentId);

    sendToContext(context, { type: 'subscribed', tournamentId });

    const latest = getCurrentAnnouncedMatch(tournamentId);
    if (latest) {
      sendToContext(context, {
        type: 'announceNext',
        tournamentId,
        payload: tournamentAnnounceNextResponseSchema.parse(latest),
      });
    }
  };

  const unsubscribe = (context: SocketContext, tournamentId: string) => {
    if (!context.tournaments.delete(tournamentId)) {
      return;
    }

    const subscribers = tournamentSubscriptions.get(tournamentId);
    if (!subscribers) {
      return;
    }

    subscribers.delete(context);
    if (subscribers.size === 0) {
      tournamentSubscriptions.delete(tournamentId);
    }

    sendToContext(context, { type: 'unsubscribed', tournamentId });
  };

  app.get('/ws/tournament', { websocket: true }, async (stream, request) => {
    const authHeader = request.headers.authorization;
    let userId: string | undefined;

    if (authHeader) {
      if (!authHeader.startsWith('Bearer ')) {
        stream.socket.close(4001, 'Unauthorized');
        return;
      }

      const token = authHeader.slice('Bearer '.length).trim();

      try {
        const payload = await app.jwtTokens.verifyAccessToken(token);
        userId = (payload as { sub?: string } | undefined)?.sub;
        if (!userId) {
          stream.socket.close(4001, 'Unauthorized');
          return;
        }
      } catch (error) {
        app.log.warn({ err: error }, 'Tournament WS authentication failed');
        stream.socket.close(4001, 'Unauthorized');
        return;
      }
    }

    const context: SocketContext = {
      stream,
      userId,
      tournaments: new Set(),
    };

  stream.socket.on('message', async (raw: RawData) => {
      const message = parseMessage(raw);
      if (!message) {
        sendToContext(context, { type: 'error', error: 'Invalid payload' });
        return;
      }

      switch (message.type) {
        case 'ping':
          sendToContext(context, { type: 'pong' });
          break;
        case 'subscribe': {
          const parsed = subscribeSchema.safeParse({ tournamentId: message.tournamentId });
          if (!parsed.success) {
            sendToContext(context, { type: 'error', error: 'Invalid tournament id' });
            return;
          }

          await subscribe(context, parsed.data.tournamentId);
          break;
        }
        case 'unsubscribe': {
          const parsed = subscribeSchema.safeParse({ tournamentId: message.tournamentId });
          if (!parsed.success) {
            sendToContext(context, { type: 'error', error: 'Invalid tournament id' });
            return;
          }

          unsubscribe(context, parsed.data.tournamentId);
          break;
        }
        default:
          sendToContext(context, { type: 'error', error: 'Unsupported message type' });
      }
    });

    const cleanup = () => {
      for (const tournamentId of context.tournaments) {
        const subscribers = tournamentSubscriptions.get(tournamentId);
        if (!subscribers) {
          continue;
        }

        subscribers.delete(context);
        if (subscribers.size === 0) {
          tournamentSubscriptions.delete(tournamentId);
        }
      }

      context.tournaments.clear();
    };

    stream.socket.on('close', cleanup);
  stream.socket.on('error', (error: unknown) => {
      app.log.warn({ err: error }, 'Tournament WS stream error');
      cleanup();
    });
  });
};

export default fp(tournamentWsPlugin, {
  name: 'tournament-ws',
});
