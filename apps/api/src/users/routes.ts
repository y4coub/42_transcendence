import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';

import {
  loadUserProfile,
  loadUserStats,
  loadOnlineUsers,
  updateProfile,
  ProfileServiceError,
} from './service';
import {
  userParamsSchema,
  userProfileSchema,
  userProfileUpdateSchema,
  userStatsQuerySchema,
  userStatsSchema,
  onlineUsersResponseSchema,
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
        case 'INVALID_PAYLOAD':
          throw app.httpErrors.badRequest(error.message);
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
};

export default fp(usersRoutes, {
  name: 'users-routes',
});
