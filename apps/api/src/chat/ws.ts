import type { SocketStream } from '@fastify/websocket';
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

import {
  blockUser,
  joinChannelBySlug,
  sendChannelMessage,
  sendDirectMessage,
  unblockUser,
  isConversationBlocked,
} from './service';

interface ClientMessageBase {
  type: string;
}

interface JoinMessage extends ClientMessageBase {
  type: 'join';
  room: string;
}

interface ChannelMessage extends ClientMessageBase {
  type: 'channel';
  room: string;
  body: string;
}

interface DirectMessage extends ClientMessageBase {
  type: 'dm';
  to: string;
  body: string;
}

interface BlockMessage extends ClientMessageBase {
  type: 'block';
  userId: string;
  reason?: string;
}

interface UnblockMessage extends ClientMessageBase {
  type: 'unblock';
  userId: string;
}

interface PingMessage extends ClientMessageBase {
  type: 'ping';
}

type ClientMessage = JoinMessage | ChannelMessage | DirectMessage | BlockMessage | UnblockMessage | PingMessage;

interface SocketContext {
  stream: SocketStream;
  userId: string;
  channels: Set<string>;
}

type RawData = string | Buffer | ArrayBuffer | Buffer[];

const serialize = (payload: Record<string, unknown>) => JSON.stringify(payload);

const chatWsPlugin: FastifyPluginAsync = async (app) => {
  const channelSubscriptions = new Map<string, Set<SocketContext>>();
  const userSockets = new Map<string, Set<SocketContext>>();

  const sendToContext = (context: SocketContext, payload: Record<string, unknown>) => {
    if (context.stream.socket.readyState === context.stream.socket.OPEN) {
      context.stream.socket.send(serialize(payload));
    }
  };

  const sendToUser = (userId: string, payload: Record<string, unknown>, except?: SocketContext) => {
    const sockets = userSockets.get(userId);
    if (!sockets) {
      return;
    }

    for (const context of sockets) {
      if (except && context === except) {
        continue;
      }

      if (context.stream.socket.readyState === context.stream.socket.OPEN) {
        context.stream.socket.send(serialize(payload));
      }
    }
  };

  const trackUserSocket = (context: SocketContext) => {
    let sockets = userSockets.get(context.userId);
    if (!sockets) {
      sockets = new Set();
      userSockets.set(context.userId, sockets);
    }

    sockets.add(context);
  };

  const untrackUserSocket = (context: SocketContext) => {
    const sockets = userSockets.get(context.userId);
    if (!sockets) {
      return;
    }

    sockets.delete(context);
    if (sockets.size === 0) {
      userSockets.delete(context.userId);
    }
  };

  const hasUserInChannel = (channelSlug: string, userId: string): boolean => {
    const subscribers = channelSubscriptions.get(channelSlug);
    if (!subscribers) {
      return false;
    }

    for (const context of subscribers) {
      if (context.userId === userId) {
        return true;
      }
    }

    return false;
  };

  const subscribeToChannel = (channelSlug: string, context: SocketContext) => {
    const alreadyPresent = hasUserInChannel(channelSlug, context.userId);

    let subscribers = channelSubscriptions.get(channelSlug);
    if (!subscribers) {
      subscribers = new Set();
      channelSubscriptions.set(channelSlug, subscribers);
    }

    subscribers.add(context);
    context.channels.add(channelSlug);

    if (!alreadyPresent) {
      const presenceEvent = {
        type: 'presence',
        room: channelSlug,
        userId: context.userId,
        online: true,
      } satisfies Record<string, unknown>;

      broadcastPresence(channelSlug, presenceEvent, context.userId);
    }
  };

  const unsubscribeFromChannel = (channelSlug: string, context: SocketContext) => {
    context.channels.delete(channelSlug);

    const subscribers = channelSubscriptions.get(channelSlug);
    if (!subscribers) {
      return;
    }

    subscribers.delete(context);
    if (subscribers.size === 0) {
      channelSubscriptions.delete(channelSlug);
      return;
    }

    if (!hasUserInChannel(channelSlug, context.userId)) {
      const presenceEvent = {
        type: 'presence',
        room: channelSlug,
        userId: context.userId,
        online: false,
      } satisfies Record<string, unknown>;

      broadcastPresence(channelSlug, presenceEvent, context.userId);
    }
  };

  const broadcastPresence = (
    channelSlug: string,
    payload: Record<string, unknown>,
    excludeUserId?: string,
  ) => {
    const subscribers = channelSubscriptions.get(channelSlug);
    if (!subscribers) {
      return;
    }

    const serialized = serialize(payload);

    for (const context of subscribers) {
      if (excludeUserId && context.userId === excludeUserId) {
        continue;
      }

      if (context.stream.socket.readyState === context.stream.socket.OPEN) {
        context.stream.socket.send(serialized);
      }
    }
  };

  const broadcastChannelMessage = (
    channelSlug: string,
    event: { type: 'message'; from: string; room: string; body: string; ts: string },
  ) => {
    const subscribers = channelSubscriptions.get(channelSlug);
    if (!subscribers) {
      return;
    }

    for (const context of subscribers) {
      if (isConversationBlocked(context.userId, event.from)) {
        continue;
      }

      if (context.stream.socket.readyState === context.stream.socket.OPEN) {
        context.stream.socket.send(serialize(event));
      }
    }
  };

  const closeWithCode = (stream: SocketStream, code: number, reason: string) => {
    try {
      stream.socket.close(code, reason);
    } catch (error) {
      app.log.warn({ err: error }, 'Failed to close WebSocket connection');
    }
  };

  const parseClientMessage = (raw: RawData): ClientMessage | undefined => {
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

  const handleJoin = async (context: SocketContext, message: JoinMessage) => {
    if (!message.room || typeof message.room !== 'string') {
      sendToContext(context, { type: 'error', error: 'Invalid join payload' });
      return;
    }

    try {
      await joinChannelBySlug(context.userId, message.room);
      subscribeToChannel(message.room, context);
      sendToContext(context, { type: 'joined', room: message.room });
    } catch (error) {
      app.log.warn({ err: error, room: message.room }, 'Failed to join channel');
      sendToContext(context, { type: 'error', error: 'Unable to join channel' });
    }
  };

  const handleChannelMessage = async (context: SocketContext, message: ChannelMessage) => {
    if (!message.room || typeof message.room !== 'string') {
      sendToContext(context, { type: 'error', error: 'Invalid channel payload' });
      return;
    }

    if (!context.channels.has(message.room)) {
      sendToContext(context, { type: 'error', error: 'Channel not joined' });
      return;
    }

    if (!message.body || typeof message.body !== 'string') {
      sendToContext(context, { type: 'error', error: 'Message body required' });
      return;
    }

    try {
      const stored = sendChannelMessage(context.userId, message.room, { content: message.body });
      const event = {
        type: 'message' as const,
        from: context.userId,
        room: message.room,
        body: stored.content,
        ts: stored.createdAt,
      };

      broadcastChannelMessage(message.room, event);
    } catch (error) {
      app.log.warn({ err: error, room: message.room }, 'Failed to publish channel message');
      sendToContext(context, { type: 'error', error: 'Unable to send channel message' });
    }
  };

  const handleDirectMessage = (context: SocketContext, message: DirectMessage) => {
    if (!message.to || typeof message.to !== 'string') {
      sendToContext(context, { type: 'error', error: 'Invalid direct message payload' });
      return;
    }

    if (!message.body || typeof message.body !== 'string') {
      sendToContext(context, { type: 'error', error: 'Message body required' });
      return;
    }

    try {
      const stored = sendDirectMessage(context.userId, message.to, { content: message.body });
      const event = {
        type: 'message' as const,
        from: context.userId,
        to: message.to,
        body: stored.content,
        ts: stored.createdAt,
      };

      sendToUser(context.userId, event);

      if (!isConversationBlocked(message.to, context.userId)) {
        sendToUser(message.to, event);
      }
    } catch (error) {
      app.log.warn({ err: error, to: message.to }, 'Failed to send direct message');
      sendToContext(context, { type: 'error', error: 'Unable to send direct message' });
    }
  };

  const handleBlock = (context: SocketContext, message: BlockMessage) => {
    if (!message.userId || typeof message.userId !== 'string') {
      sendToContext(context, { type: 'error', error: 'Invalid block payload' });
      return;
    }

    try {
      blockUser(context.userId, message.userId, { reason: message.reason });
      sendToContext(context, { type: 'blocked', userId: message.userId });
    } catch (error) {
      app.log.warn({ err: error, target: message.userId }, 'Failed to block user');
      sendToContext(context, { type: 'error', error: 'Unable to block user' });
    }
  };

  const handleUnblock = (context: SocketContext, message: UnblockMessage) => {
    if (!message.userId || typeof message.userId !== 'string') {
      sendToContext(context, { type: 'error', error: 'Invalid unblock payload' });
      return;
    }

    try {
      const removed = unblockUser(context.userId, message.userId);
      if (removed) {
        sendToContext(context, { type: 'unblocked', userId: message.userId });
      } else {
        sendToContext(context, {
          type: 'error',
          error: 'User was not blocked',
        });
      }
    } catch (error) {
      app.log.warn({ err: error, target: message.userId }, 'Failed to unblock user');
      sendToContext(context, { type: 'error', error: 'Unable to unblock user' });
    }
  };

  app.get('/ws/chat', { websocket: true }, async (stream, request) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      closeWithCode(stream, 4001, 'Unauthorized');
      return;
    }

    const token = authHeader.slice('Bearer '.length).trim();

    let payload: unknown;
    try {
      payload = await app.jwtTokens.verifyAccessToken(token);
    } catch (error) {
      app.log.warn({ err: error }, 'WS authentication failed');
      closeWithCode(stream, 4001, 'Unauthorized');
      return;
    }

    const userId = (payload as { sub?: string } | undefined)?.sub;
    if (!userId) {
      closeWithCode(stream, 4001, 'Unauthorized');
      return;
    }

    const context: SocketContext = {
      stream,
      userId,
      channels: new Set(),
    };

    trackUserSocket(context);
    sendToContext(context, { type: 'welcome', userId });

    const onMessage = async (raw: RawData) => {
      const message = parseClientMessage(raw);
      if (!message) {
        sendToContext(context, { type: 'error', error: 'Malformed payload' });
        return;
      }

      switch (message.type) {
        case 'join':
          await handleJoin(context, message);
          break;
        case 'channel':
          await handleChannelMessage(context, message);
          break;
        case 'dm':
          handleDirectMessage(context, message);
          break;
        case 'block':
          handleBlock(context, message);
          break;
        case 'unblock':
          handleUnblock(context, message);
          break;
        case 'ping':
          sendToContext(context, { type: 'pong', ts: Date.now() });
          break;
        default:
          sendToContext(context, { type: 'error', error: 'Unsupported message type' });
      }
    };

    stream.socket.on('message', (raw: RawData) => {
      void onMessage(raw);
    });

    stream.socket.on('close', () => {
      for (const channelSlug of context.channels) {
        unsubscribeFromChannel(channelSlug, context);
      }

      context.channels.clear();
      untrackUserSocket(context);
    });

    stream.socket.on('error', (error: Error) => {
      app.log.warn({ err: error, userId }, 'WebSocket error');
    });
  });
};

export default fp(chatWsPlugin, {
  name: 'chat-ws',
});
