import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  QueueServiceError,
  TournamentServiceError,
  announceNextMatch,
  createNewTournament,
  getCurrentAnnouncedMatch,
  getTournament,
  getTournamentBoard,
  joinQueue,
  leaveQueue,
  listAllTournaments,
  listQueuedPlayersForTournament,
  listTournamentPlayers,
  recordMatchResult,
  registerPlayer,
} from './service';
import {
  tournamentAnnounceNextResponseSchema,
  tournamentBoardSchema,
  tournamentCreateSchema,
  tournamentIdSchema,
  tournamentMatchSchema,
  tournamentNextMatchResponseSchema,
  tournamentPlayerSchema,
  tournamentQueueJoinSchema,
  tournamentQueueLeaveSchema,
  tournamentRegisterSchema,
  tournamentResultSchema,
  tournamentSchema,
} from './schemas';
import type { TournamentResult } from './schemas';

const tournamentIdParamsSchema = z.object({
  tournamentId: tournamentIdSchema,
});

const tournamentIdQuerySchema = z.object({
  tournamentId: tournamentIdSchema,
});

const queueListQuerySchema = tournamentIdQuerySchema.extend({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const announceBodySchema = z.object({
  tournamentId: tournamentIdSchema,
});

const translateServiceError = (app: Parameters<FastifyPluginAsync>[0], error: unknown): never => {
  if (error instanceof TournamentServiceError) {
    switch (error.code) {
      case 'TOURNAMENT_NOT_FOUND':
      case 'PLAYER_NOT_FOUND':
      case 'MATCH_NOT_FOUND':
        throw app.httpErrors.notFound(error.message);
      case 'TOURNAMENT_CLOSED':
      case 'ALIAS_IN_USE':
        throw app.httpErrors.conflict(error.message);
      case 'INVALID_WINNER':
        throw app.httpErrors.badRequest(error.message);
      case 'TOURNAMENT_CREATION_FAILED':
      case 'REGISTRATION_FAILED':
      default:
        break;
    }
  }

  if (error instanceof QueueServiceError) {
    switch (error.code) {
      case 'PLAYER_NOT_FOUND':
        throw app.httpErrors.notFound(error.message);
      case 'PLAYER_ALREADY_QUEUED':
        throw app.httpErrors.conflict(error.message);
      case 'MATCH_CREATION_FAILED':
      default:
        break;
    }
  }

  app.log.error({ err: error }, 'Unhandled tournament service failure');
  throw app.httpErrors.internalServerError();
};

const tournamentRoutes: FastifyPluginAsync = async (app) => {
  const router = app.withTypeProvider<ZodTypeProvider>();

  router.get(
    '/tournament',
    {
      schema: {
        response: {
          200: z.array(tournamentSchema),
        },
      },
    },
    async () => {
      return listAllTournaments();
    },
  );

  router.post(
    '/tournament/start',
    {
      schema: {
        body: tournamentCreateSchema,
        response: {
          201: tournamentSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const tournament = createNewTournament(request.body.name);
        return reply.code(201).send(tournament);
      } catch (error) {
        translateServiceError(app, error);
      }
    },
  );

  router.get(
    '/tournament/:tournamentId',
    {
      schema: {
        params: tournamentIdParamsSchema,
        response: {
          200: tournamentSchema,
        },
      },
    },
    async (request) => {
      try {
        return getTournament(request.params.tournamentId);
      } catch (error) {
        translateServiceError(app, error);
      }
    },
  );

  router.get(
    '/tournament/:tournamentId/players',
    {
      schema: {
        params: tournamentIdParamsSchema,
        response: {
          200: z.array(tournamentPlayerSchema),
        },
      },
    },
    async (request) => {
      try {
        return listTournamentPlayers(request.params.tournamentId);
      } catch (error) {
        translateServiceError(app, error);
      }
    },
  );

  router.post(
    '/tournament/register',
    {
      schema: {
        body: tournamentRegisterSchema,
        response: {
          201: tournamentPlayerSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const player = registerPlayer(request.body);
        return reply.code(201).send(player);
      } catch (error) {
        translateServiceError(app, error);
      }
    },
  );

  router.post(
    '/tournament/queue/join',
    {
      schema: {
        body: tournamentQueueJoinSchema,
        response: {
          200: tournamentPlayerSchema,
        },
      },
    },
    async (request) => {
      try {
        return joinQueue(request.body.playerId);
      } catch (error) {
        translateServiceError(app, error);
      }
    },
  );

  router.post(
    '/tournament/queue/leave',
    {
      schema: {
        body: tournamentQueueLeaveSchema,
        response: {
          200: tournamentPlayerSchema,
        },
      },
    },
    async (request) => {
      try {
        return leaveQueue(request.body.playerId);
      } catch (error) {
        translateServiceError(app, error);
      }
    },
  );

  router.get(
    '/tournament/queue',
    {
      schema: {
        querystring: queueListQuerySchema,
        response: {
          200: z.array(tournamentPlayerSchema),
        },
      },
    },
    async (request) => {
      try {
        return listQueuedPlayersForTournament(request.query.tournamentId, request.query.limit);
      } catch (error) {
        translateServiceError(app, error);
      }
    },
  );

  router.get(
    '/tournament/board',
    {
      schema: {
        querystring: tournamentIdQuerySchema,
        response: {
          200: tournamentBoardSchema,
        },
      },
    },
    async (request) => {
      try {
        return getTournamentBoard(request.query.tournamentId);
      } catch (error) {
        translateServiceError(app, error);
      }
    },
  );

  router.get(
    '/tournament/next',
    {
      schema: {
        querystring: tournamentIdQuerySchema,
        response: {
          200: tournamentNextMatchResponseSchema,
          204: z.null(),
        },
      },
    },
    async (request, reply) => {
      try {
        const result = getCurrentAnnouncedMatch(request.query.tournamentId);
        if (!result) {
          return reply.code(204).send();
        }

        return result;
      } catch (error) {
        translateServiceError(app, error);
      }
    },
  );

  router.post(
    '/tournament/announce-next',
    {
      schema: {
        body: announceBodySchema,
        response: {
          200: tournamentAnnounceNextResponseSchema,
          204: z.null(),
        },
      },
    },
    async (request, reply) => {
      try {
        const result = announceNextMatch(request.body.tournamentId);
        if (!result) {
          return reply.code(204).send();
        }

        return result;
      } catch (error) {
        translateServiceError(app, error);
      }
    },
  );

  router.post<{ Body: TournamentResult }>(
    '/tournament/result',
    {
      schema: {
        body: tournamentResultSchema,
        response: {
          200: tournamentMatchSchema,
        },
      },
    },
    async (request) => {
      try {
        return recordMatchResult(request.body);
      } catch (error) {
        translateServiceError(app, error);
      }
    },
  );
};

export default fp(tournamentRoutes, {
  name: 'tournament-routes',
});
