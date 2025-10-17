import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';

import { getLeaderboard } from './service';
import { leaderboardQuerySchema, leaderboardResponseSchema } from './schemas';

const statsRoutes: FastifyPluginAsync = async (app) => {
	const router = app.withTypeProvider<ZodTypeProvider>();

	router.get(
		'/stats/leaderboard',
		{
			schema: {
				tags: ['Stats'],
				querystring: leaderboardQuerySchema,
				response: {
					200: leaderboardResponseSchema,
				},
			},
		},
		async (request, reply) => {
			const entries = getLeaderboard({ limit: request.query.limit });
			return reply.send(entries);
		},
	);
};

export default fp(statsRoutes, {
	name: 'stats-routes',
});
