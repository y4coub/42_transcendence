import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  MatchServiceError,
  createMatchSession,
  getMatchDetail,
  recordMatchOutcome,
} from './service';
import {
  matchCreateSchema,
  matchCreateResponseSchema,
  matchDetailSchema,
  matchOkSchema,
  matchResultSchema,
} from './schemas';
import { tournamentMatchIdSchema } from '@tournament/schemas';

const matchIdParamsSchema = z.object({
  matchId: tournamentMatchIdSchema,
});

const matchRoutes: FastifyPluginAsync = async (app) => {
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
    if (error instanceof MatchServiceError) {
      switch (error.code) {
        case 'PLAYER_NOT_FOUND':
        case 'MATCH_NOT_FOUND':
          throw app.httpErrors.notFound(error.message);
        case 'MISMATCHED_TOURNAMENT':
        case 'SAME_PLAYER':
          throw app.httpErrors.badRequest(error.message);
        case 'QUEUE_EMPTY':
          throw app.httpErrors.conflict(error.message);
        case 'MATCH_CREATION_FAILED':
          throw app.httpErrors.internalServerError(error.message);
        default:
          break;
      }
    }

    app.log.error({ err: error }, 'Unhandled match service error');
    throw app.httpErrors.internalServerError();
  };

  router.post(
    '/matches',
    {
      schema: {
        body: matchCreateSchema,
        response: {
          201: matchCreateResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await resolveUserId(request);

      try {
        const match = createMatchSession(request.body);
        return reply.code(201).send({ matchId: match.id });
      } catch (error) {
        translateServiceError(error);
      }
    },
  );

  router.get(
    '/matches/:matchId',
    {
      schema: {
        params: matchIdParamsSchema,
        response: {
          200: matchDetailSchema,
        },
      },
    },
    async (request, reply) => {
      await resolveUserId(request);

      try {
        const detail = getMatchDetail(request.params.matchId);
        return reply.send(detail);
      } catch (error) {
        translateServiceError(error);
      }
    },
  );

  router.patch(
    '/matches/:matchId/result',
    {
      schema: {
        params: matchIdParamsSchema,
        body: matchResultSchema,
        response: {
          200: matchOkSchema,
        },
      },
    },
    async (request, reply) => {
      await resolveUserId(request);

      try {
        if (request.params.matchId !== request.body.matchId) {
          throw app.httpErrors.badRequest('Path and body matchId must match');
        }

        recordMatchOutcome(request.body);
        return reply.send({ ok: true });
      } catch (error) {
        translateServiceError(error);
      }
    },
  );
};

export default fp(matchRoutes, {
  name: 'match-routes',
});
