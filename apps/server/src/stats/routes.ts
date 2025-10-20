import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';

import { getLeaderboard, getRecentMatches } from './service';
import {
	leaderboardQuerySchema,
	leaderboardResponseSchema,
	recentMatchesResponseSchema,
} from './schemas';

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

	router.get(
		'/stats/recent-matches',
		{
			schema: {
				tags: ['Stats'],
				response: {
					200: recentMatchesResponseSchema,
				},
			},
		},
		async (_request, reply) => {
			const matches = getRecentMatches();
			return reply.send(matches);
		},
	);
};

export default fp(statsRoutes, {
	name: 'stats-routes',
});
