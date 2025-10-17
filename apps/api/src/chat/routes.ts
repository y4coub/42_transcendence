import fp from 'fastify-plugin';
import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  ChatServiceError,
  blockUser,
  createChannel,
  deleteChannel,
  joinChannelBySlug,
  leaveChannel,
  sendChannelMessage,
  sendDirectMessage,
  listAvailableChannels,
  listBlocks,
  listChannelMessages,
  listDirectMessages,
  listRecentConversations,
  loadChannelBySlug,
  updateChannel,
  unblockUser,
} from './service';
import {
  chatBlockCreateSchema,
  chatBlockSchema,
  chatChannelCreateSchema,
  chatChannelSchema,
  chatChannelMessageCreateSchema,
  chatChannelSlugSchema,
  chatChannelUpdateSchema,
  chatDirectMessageCreateSchema,
  chatMembershipSchema,
  chatMessageSchema,
} from './schemas';

const channelParamsSchema = z.object({
  slug: chatChannelSlugSchema,
});

const channelHistoryQuerySchema = z.object({
  room: chatChannelSlugSchema,
  limit: z.coerce.number().int().positive().max(100).optional(),
  since: z.string().datetime().optional(),
});

const dmParamsSchema = z.object({
  userId: z.string().uuid(),
});

const dmHistoryQuerySchema = z
  .object({
    cursor: z.string().datetime().optional(),
    since: z.string().datetime().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  })
  .refine((value) => value.cursor === undefined || value.since === undefined, {
    message: 'Use either cursor or since, not both',
    path: ['cursor'],
  });

const blockParamsSchema = z.object({
  userId: z.string().uuid(),
});

const conversationsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).optional(),
});

const createChannelResponseSchema = z.object({
  channel: chatChannelSchema,
  membership: chatMembershipSchema,
});

const conversationsSchema = z.array(
  z.object({
    otherId: z.string().uuid(),
    lastMessageAt: z.string().datetime(),
  }),
);

const chatRoutes: FastifyPluginAsync = async (app) => {
  const router = app.withTypeProvider<ZodTypeProvider>();

  const resolveUserId = async (request: FastifyRequest): Promise<string> => {
    try {
      await request.jwtVerify();
    } catch {
      throw app.httpErrors.unauthorized();
    }

    await app.verifyActiveSession(request);

    const userId = (request.user as { sub?: string } | undefined)?.sub;
    if (!userId) {
      throw app.httpErrors.unauthorized();
    }

    return userId;
  };

  const translateServiceError = (error: unknown): never => {
    if (error instanceof ChatServiceError) {
      switch (error.code) {
        case 'CHANNEL_NOT_FOUND':
          throw app.httpErrors.notFound(error.message);
        case 'CHANNEL_SLUG_IN_USE':
          throw app.httpErrors.conflict(error.message);
        case 'NOT_CHANNEL_MEMBER':
        case 'NOT_CHANNEL_ADMIN':
        case 'USER_BLOCKED':
          throw app.httpErrors.forbidden(error.message);
        case 'SELF_ACTION_NOT_ALLOWED':
          throw app.httpErrors.badRequest(error.message);
        default:
          break;
      }
    }

    app.log.error({ err: error }, 'Unhandled chat service failure');
    throw app.httpErrors.internalServerError();
  };

  router.get(
    '/chat/channels',
    {
      schema: {
        response: {
          200: z.array(chatChannelSchema),
        },
      },
    },
    async (request) => {
      await resolveUserId(request);
      return listAvailableChannels();
    },
  );

  router.post(
    '/chat/channels',
    {
      schema: {
        body: chatChannelCreateSchema,
        response: {
          201: createChannelResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = await resolveUserId(request);

      try {
        const result = createChannel(userId, request.body);
        return reply.code(201).send(result);
      } catch (error) {
        translateServiceError(error);
      }
    },
  );

  router.patch(
    '/chat/channels/:slug',
    {
      schema: {
        params: channelParamsSchema,
        body: chatChannelUpdateSchema,
        response: {
          200: chatChannelSchema,
        },
      },
    },
    async (request) => {
      const userId = await resolveUserId(request);
      try {
        const channel = loadChannelBySlug(request.params.slug);
        return updateChannel(userId, channel.id, request.body);
      } catch (error) {
        translateServiceError(error);
      }
    },
  );

  router.delete(
    '/chat/channels/:slug',
    {
      schema: {
        params: channelParamsSchema,
        response: {
          204: { type: 'null' },
        },
      },
    },
    async (request, reply) => {
      const userId = await resolveUserId(request);
      try {
        const channel = loadChannelBySlug(request.params.slug);
        deleteChannel(userId, channel.id);
      } catch (error) {
        translateServiceError(error);
      }

      return reply.code(204).send();
    },
  );

  router.post(
    '/chat/channels/:slug/join',
    {
      schema: {
        params: channelParamsSchema,
        response: {
          200: chatMembershipSchema,
        },
      },
    },
    async (request) => {
      const userId = await resolveUserId(request);

      try {
        return joinChannelBySlug(userId, request.params.slug);
      } catch (error) {
        translateServiceError(error);
      }
    },
  );

  router.post(
    '/chat/channels/:slug/messages',
    {
      schema: {
        params: channelParamsSchema,
        body: chatChannelMessageCreateSchema,
        response: {
          201: chatMessageSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = await resolveUserId(request);

      try {
        const message = sendChannelMessage(userId, request.params.slug, request.body);
        return reply.code(201).send(message);
      } catch (error) {
        translateServiceError(error);
      }
    },
  );

  router.post(
    '/chat/channels/:slug/leave',
    {
      schema: {
        params: channelParamsSchema,
        response: {
          204: { type: 'null' },
        },
      },
    },
    async (request, reply) => {
      const userId = await resolveUserId(request);

      try {
        leaveChannel(userId, request.params.slug);
      } catch (error) {
        translateServiceError(error);
      }

      return reply.code(204).send();
    },
  );

  router.get(
    '/chat/history',
    {
      schema: {
        querystring: channelHistoryQuerySchema,
        response: {
          200: z.array(chatMessageSchema),
        },
      },
    },
    async (request) => {
      const userId = await resolveUserId(request);

      try {
        return listChannelMessages(userId, request.query.room, {
          limit: request.query.limit,
          since: request.query.since,
        });
      } catch (error) {
        translateServiceError(error);
      }
    },
  );

  router.get(
    '/chat/dm/:userId',
    {
      schema: {
        params: dmParamsSchema,
        querystring: dmHistoryQuerySchema,
        response: {
          200: z.array(chatMessageSchema),
        },
      },
    },
    async (request) => {
      const userId = await resolveUserId(request);
      const since = request.query.cursor ?? request.query.since;

      try {
        return listDirectMessages(userId, request.params.userId, {
          limit: request.query.limit,
          since,
        });
      } catch (error) {
        translateServiceError(error);
      }
    },
  );

  router.post(
    '/chat/dm/:userId',
    {
      schema: {
        params: dmParamsSchema,
        body: chatDirectMessageCreateSchema,
        response: {
          201: chatMessageSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = await resolveUserId(request);

      try {
        const message = sendDirectMessage(userId, request.params.userId, request.body);
        return reply.code(201).send(message);
      } catch (error) {
        translateServiceError(error);
      }
    },
  );

  router.get(
    '/chat/blocks',
    {
      schema: {
        response: {
          200: z.array(chatBlockSchema),
        },
      },
    },
    async (request) => {
      const userId = await resolveUserId(request);
      return listBlocks(userId);
    },
  );

  router.post(
    '/chat/blocks/:userId',
    {
      schema: {
        params: blockParamsSchema,
        body: chatBlockCreateSchema.optional(),
        response: {
          200: chatBlockSchema,
        },
      },
    },
    async (request) => {
      const userId = await resolveUserId(request);

      try {
        return blockUser(userId, request.params.userId, request.body ?? {});
      } catch (error) {
        translateServiceError(error);
      }
    },
  );

  router.delete(
    '/chat/blocks/:userId',
    {
      schema: {
        params: blockParamsSchema,
        response: {
          204: { type: 'null' },
        },
      },
    },
    async (request, reply) => {
      const userId = await resolveUserId(request);

      try {
        const removed = unblockUser(userId, request.params.userId);
        if (!removed) {
          throw app.httpErrors.notFound('Block not found');
        }
      } catch (error) {
        if (error instanceof ChatServiceError) {
          translateServiceError(error);
        }

        if (typeof (error as { statusCode?: number }).statusCode === 'number') {
          throw error;
        }

        app.log.warn({ err: error }, 'Failed to unblock user');
        throw app.httpErrors.internalServerError();
      }

      return reply.code(204).send();
    },
  );

  router.get(
    '/chat/conversations',
    {
      schema: {
        querystring: conversationsQuerySchema,
        response: {
          200: conversationsSchema,
        },
      },
    },
    async (request) => {
      const userId = await resolveUserId(request);
      const limit = request.query.limit ?? 20;

      return listRecentConversations(userId, limit);
    },
  );
};

export default fp(chatRoutes, {
  name: 'chat-routes',
});
