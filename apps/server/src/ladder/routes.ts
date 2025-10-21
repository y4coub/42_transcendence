import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';

import { getLadderOverview, joinLadderQueue, leaveLadderQueue } from './service';
import { ladderOverviewSchema, ladderQueueStateSchema } from './schemas';

const ladderRoutes: FastifyPluginAsync = async (app) => {
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

	router.get(
		'/ladder/overview',
		{
			schema: {
				tags: ['Ladder'],
				response: {
					200: ladderOverviewSchema,
				},
			},
		},
		async (request, reply) => {
			const userId = await resolveUserId(request);
			const overview = getLadderOverview(userId);
			return reply.send(overview);
		},
	);

	router.post(
		'/ladder/queue/join',
		{
			schema: {
				tags: ['Ladder'],
				response: {
					200: ladderQueueStateSchema,
				},
			},
		},
		async (request, reply) => {
			const userId = await resolveUserId(request);
			const state = joinLadderQueue(userId);
			return reply.send(state);
		},
	);

	router.post(
		'/ladder/queue/leave',
		{
			schema: {
				tags: ['Ladder'],
				response: {
					200: ladderQueueStateSchema,
				},
			},
		},
		async (request, reply) => {
			const userId = await resolveUserId(request);
			const state = leaveLadderQueue(userId);
			return reply.send(state);
		},
	);
};

export default fp(ladderRoutes, {
	name: 'ladder-routes',
});
