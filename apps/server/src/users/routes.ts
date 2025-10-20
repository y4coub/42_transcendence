import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  loadUserProfile,
  loadUserStats,
  loadOnlineUsers,
  loadFriendList,
  loadFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  searchUsers,
  updateProfile,
  ProfileServiceError,
  FriendServiceError,
} from './service';
import {
  userParamsSchema,
  userProfileSchema,
  userProfileUpdateSchema,
  userStatsQuerySchema,
  userStatsSchema,
  onlineUsersResponseSchema,
  friendListSchema,
  friendRequestsResponseSchema,
  friendRequestCreateSchema,
  friendRequestParamsSchema,
  userSearchQuerySchema,
  userSearchResponseSchema,
} from './schemas';

const usersRoutes: FastifyPluginAsync = async (app) => {
  const router = app.withTypeProvider<ZodTypeProvider>();

  const ensureAuthenticated = async (request: FastifyRequest): Promise<string> => {
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
    if (error instanceof ProfileServiceError) {
      switch (error.code) {
        case 'USER_NOT_FOUND':
          throw app.httpErrors.notFound(error.message);
        case 'FORBIDDEN':
          throw app.httpErrors.forbidden(error.message);
        case 'DISPLAY_NAME_TAKEN':
          throw app.httpErrors.conflict(error.message);
        case 'INVALID_PAYLOAD':
          throw app.httpErrors.badRequest(error.message);
        default:
          break;
      }
    }

    if (error instanceof FriendServiceError) {
      switch (error.code) {
        case 'FRIEND_SELF':
          throw app.httpErrors.badRequest(error.message);
        case 'FRIEND_ALREADY':
        case 'FRIEND_INCOMING_PENDING':
        case 'FRIEND_REQUEST_EXISTS':
          throw app.httpErrors.conflict(error.message);
        case 'FRIEND_REQUEST_NOT_FOUND':
          throw app.httpErrors.notFound(error.message);
        default:
          break;
      }
    }

    app.log.error({ err: error }, 'Unhandled profile service error');
    throw app.httpErrors.internalServerError();
  };

  router.get(
    '/users/:userId',
    {
      schema: {
        params: userParamsSchema,
        response: {
          200: userProfileSchema,
        },
      },
    },
    async (request, reply) => {
      await ensureAuthenticated(request);

      try {
        const profile = loadUserProfile(request.params.userId);
        return reply.send(profile);
      } catch (error) {
        translateServiceError(error);
      }
    },
  );

  router.patch(
    '/users/:userId',
    {
      schema: {
        params: userParamsSchema,
        body: userProfileUpdateSchema,
        response: {
          200: userProfileSchema,
        },
      },
    },
    async (request, reply) => {
      const actorId = await ensureAuthenticated(request);

      try {
        const profile = updateProfile(actorId, request.params.userId, request.body);
        return reply.send(profile);
      } catch (error) {
        translateServiceError(error);
      }
    },
  );

  router.get(
    '/users/:userId/stats',
    {
      schema: {
        params: userParamsSchema,
        querystring: userStatsQuerySchema,
        response: {
          200: userStatsSchema,
        },
      },
    },
    async (request, reply) => {
      await ensureAuthenticated(request);

      try {
        const stats = loadUserStats(request.params.userId, {
          refresh: request.query.refresh,
          limit: request.query.limit,
        });
        return reply.send(stats);
      } catch (error) {
        translateServiceError(error);
      }
    },
  );

  router.get(
    '/users/online',
    {
      schema: {
        response: {
          200: onlineUsersResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = await ensureAuthenticated(request);

      try {
        const onlineUsers = loadOnlineUsers(userId);
        return reply.send(onlineUsers);
      } catch (error) {
        translateServiceError(error);
      }
    },
  );

  router.get(
    '/users/search',
    {
      schema: {
        querystring: userSearchQuerySchema,
        response: {
          200: userSearchResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = await ensureAuthenticated(request);

      try {
        const results = searchUsers(userId, request.query.query, { limit: request.query.limit });
        return reply.send(results);
      } catch (error) {
        translateServiceError(error);
      }
    },
  );

  router.get(
    '/users/me/friends',
    {
      schema: {
        response: {
          200: friendListSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = await ensureAuthenticated(request);

      try {
        const friends = loadFriendList(userId);
        return reply.send(friends);
      } catch (error) {
        translateServiceError(error);
      }
    },
  );

  router.get(
    '/users/me/friend-requests',
    {
      schema: {
        response: {
          200: friendRequestsResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = await ensureAuthenticated(request);

      try {
        const requests = loadFriendRequests(userId);
        return reply.send(requests);
      } catch (error) {
        translateServiceError(error);
      }
    },
  );

  router.post(
    '/users/me/friend-requests',
    {
      schema: {
        body: friendRequestCreateSchema,
        response: {
          201: friendRequestsResponseSchema.pick({ incoming: true, outgoing: true }).extend({ requestId: z.string().uuid() }),
        },
      },
    },
    async (request, reply) => {
      const userId = await ensureAuthenticated(request);

      try {
        const { targetUserId } = request.body;
        const requestId = sendFriendRequest(userId, targetUserId);
        const requests = loadFriendRequests(userId);
        return reply.code(201).send({ ...requests, requestId });
      } catch (error) {
        translateServiceError(error);
      }
    },
  );

  router.post(
    '/users/me/friend-requests/:requestId/accept',
    {
      schema: {
        params: friendRequestParamsSchema,
        response: {
          200: friendRequestsResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = await ensureAuthenticated(request);

      try {
        await acceptFriendRequest(userId, request.params.requestId);
        const requests = loadFriendRequests(userId);
        return reply.send(requests);
      } catch (error) {
        translateServiceError(error);
      }
    },
  );

  router.post(
    '/users/me/friend-requests/:requestId/decline',
    {
      schema: {
        params: friendRequestParamsSchema,
        response: {
          200: friendRequestsResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = await ensureAuthenticated(request);

      try {
        await declineFriendRequest(userId, request.params.requestId);
        const requests = loadFriendRequests(userId);
        return reply.send(requests);
      } catch (error) {
        translateServiceError(error);
      }
    },
  );

  router.post(
    '/users/me/friend-requests/:requestId/cancel',
    {
      schema: {
        params: friendRequestParamsSchema,
        response: {
          200: friendRequestsResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = await ensureAuthenticated(request);

      try {
        await cancelFriendRequest(userId, request.params.requestId);
        const requests = loadFriendRequests(userId);
        return reply.send(requests);
      } catch (error) {
        translateServiceError(error);
      }
    },
  );
};

export default fp(usersRoutes, {
  name: 'users-routes',
});
