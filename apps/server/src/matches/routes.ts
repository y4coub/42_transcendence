import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

import * as matchRepo from './repository';
import * as chatRepo from '@chat/repository';
import * as ladderService from '../ladder/service';
import { applyMultiplayerResult, applyPracticeResult } from './statsUpdater';

// Schema for creating standalone Pong match
const createPongMatchSchema = z.object({
  opponentId: z.string().uuid(),
});

const pongMatchResponseSchema = z.object({
  matchId: z.string().uuid(),
  p1Id: z.string().uuid(),
  p2Id: z.string().uuid(),
  state: z.string(),
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

  // ========================================================================
  // Pong Match Endpoints (standalone game matches)
  // ========================================================================

  /**
   * POST /api/matches/pong
   * Create a new standalone Pong match between two players
   */
  router.post(
    '/matches/pong',
    {
      schema: {
        body: createPongMatchSchema,
        response: {
          200: pongMatchResponseSchema,
          201: pongMatchResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = await resolveUserId(request);
      const { opponentId } = request.body;

      // Validate players are different
      if (userId === opponentId) {
        throw app.httpErrors.badRequest('Cannot create match with yourself');
      }

      try {
        // Reuse pending match if one already exists between the players
        const existing = matchRepo.findPendingMatchBetween(userId, opponentId);
        if (existing) {
          app.log.info({ matchId: existing.id, p1Id: existing.p1Id, p2Id: existing.p2Id }, 'Reusing pending Pong match');
          return reply.code(200).send({
            matchId: existing.id,
            p1Id: existing.p1Id,
            p2Id: existing.p2Id,
            state: existing.state,
          });
        }

        // Create match
        const matchId = uuidv4();
        const match = matchRepo.createMatch({
          id: matchId,
          p1Id: userId,
          p2Id: opponentId,
        });

        app.log.info({ matchId, p1Id: userId, p2Id: opponentId }, 'Pong match created');

        return reply.code(201).send({
          matchId: match.id,
          p1Id: match.p1Id,
          p2Id: match.p2Id,
          state: match.state,
        });
      } catch (error) {
        app.log.error({ err: error }, 'Failed to create Pong match');
        throw app.httpErrors.internalServerError('Failed to create match');
      }
    },
  );

  /**
   * GET /api/matches/pong/:matchId
   * Get details of a Pong match
   */
  router.get(
    '/matches/pong/:matchId',
    {
      schema: {
        params: z.object({ matchId: z.string().uuid() }),
        response: {
          200: z.object({
            matchId: z.string().uuid(),
            id: z.string().uuid(),
            p1Id: z.string().uuid(),
            p2Id: z.string().uuid(),
            p1Score: z.number().int(),
            p2Score: z.number().int(),
            state: z.string(),
            winnerId: z.string().uuid().nullable(),
            pausedBy: z.string().uuid().nullable(),
            createdAt: z.string(),
            startedAt: z.string().nullable(),
            endedAt: z.string().nullable(),
          }),
        },
      },
    },
    async (request, reply) => {
      const userId = await resolveUserId(request);
      const { matchId } = request.params;

      const match = matchRepo.getMatch(matchId);
      if (!match) {
        throw app.httpErrors.notFound('Match not found');
      }

      // Verify user is a player in the match
      if (match.p1Id !== userId && match.p2Id !== userId) {
        throw app.httpErrors.forbidden('You are not a player in this match');
      }

      return reply.send({
        matchId: match.id,
        id: match.id,
        p1Id: match.p1Id,
        p2Id: match.p2Id,
        p1Score: match.p1Score,
        p2Score: match.p2Score,
        state: match.state,
        winnerId: match.winnerId,
        pausedBy: match.pausedBy,
        createdAt: match.createdAt,
        startedAt: match.startedAt,
        endedAt: match.endedAt,
      });
    },
  );

  /**
   * PATCH /api/matches/pong/:matchId
   * Update match result (called by game server after match ends)
   */
  router.patch(
    '/matches/pong/:matchId',
    {
      schema: {
        params: z.object({ matchId: z.string().uuid() }),
        body: z.object({
          winnerId: z.string().uuid(),
          p1Score: z.number().int().min(0).max(11),
          p2Score: z.number().int().min(0).max(11),
        }),
        response: {
          200: z.object({ ok: z.boolean() }),
        },
      },
    },
    async (request, reply) => {
      const userId = await resolveUserId(request);
      const { matchId } = request.params;
      const { winnerId, p1Score, p2Score } = request.body;

      const match = matchRepo.getMatch(matchId);
      if (!match) {
        throw app.httpErrors.notFound('Match not found');
      }

      // Verify user is a player in the match
      if (match.p1Id !== userId && match.p2Id !== userId) {
        throw app.httpErrors.forbidden('You are not a player in this match');
      }

      // Verify winnerId is a valid player
      if (winnerId !== match.p1Id && winnerId !== match.p2Id) {
        throw app.httpErrors.badRequest('Winner must be a player in the match');
      }

      // Record winner and final scores
	matchRepo.recordWinner({
		matchId,
		winnerId,
		p1Score,
		p2Score,
	});

	applyMultiplayerResult({
		matchId,
		p1Id: match.p1Id,
		p2Id: match.p2Id,
		winnerId,
		p1Score,
		p2Score,
	});

	const loserId = winnerId === match.p1Id ? match.p2Id : match.p1Id;
	ladderService.onMatchCompleted(matchId, winnerId, loserId ?? null);

	app.log.info({ matchId, winnerId, p1Score, p2Score }, 'Match result recorded');

	return reply.send({ ok: true });
	},
	);

	/**
	 * POST /api/matches/pong/practice
	 * Record a solo practice result against the bot
	 */
	router.post(
		'/matches/pong/practice',
		{
			schema: {
				body: z.object({
					playerScore: z.number().int().min(0).max(11),
					botScore: z.number().int().min(0).max(11),
					result: z.enum(['win', 'loss']),
				}),
				response: {
					200: z.object({ ok: z.boolean(), matchId: z.string() }),
				},
			},
		},
		async (request, reply) => {
			const userId = await resolveUserId(request);
			const { playerScore, botScore, result } = request.body;

			const matchId = applyPracticeResult({
				userId,
				playerScore,
				botScore,
				outcome: result,
			});

			app.log.info({ userId, matchId, playerScore, botScore, result }, 'Practice match recorded');

			return reply.send({ ok: true, matchId });
		},
	);

  /**
   * GET /api/matches/pong/:matchId/chat
   * Get chat history for a Pong match (Phase 6: T035)
   */
  router.get(
    '/matches/pong/:matchId/chat',
    {
      schema: {
        params: z.object({ matchId: z.string().uuid() }),
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(200).optional().default(50),
          since: z.string().optional(),
        }),
        response: {
          200: z.object({
            messages: z.array(z.object({
              id: z.string(),
              senderId: z.string(),
              content: z.string(),
              createdAt: z.string(),
            })),
          }),
        },
      },
    },
    async (request, reply) => {
      const userId = await resolveUserId(request);
      const { matchId } = request.params;
      const { limit, since } = request.query;

      const match = matchRepo.getMatch(matchId);
      if (!match) {
        throw app.httpErrors.notFound('Match not found');
      }

      // Verify user is a player in the match
      if (match.p1Id !== userId && match.p2Id !== userId) {
        throw app.httpErrors.forbidden('You are not a player in this match');
      }

      // Fetch chat messages for this match
      const messages = chatRepo.listMatchMessages(matchId, { limit, since });

      return reply.send({
        messages: messages.map((msg) => ({
          id: msg.id,
          senderId: msg.senderId,
          content: msg.content,
          createdAt: msg.createdAt,
        })),
      });
    },
  );

};

export default fp(matchRoutes, {
  name: 'match-routes',
});
