import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

import { onTournamentResult } from '@tournament/service';

import { processMatchResult } from './aggregator';

const statsModule: FastifyPluginAsync = async (app) => {
	const removeListener = onTournamentResult(({ match }) => {
		try {
			processMatchResult(match);
		} catch (error) {
			app.log.error({ err: error, matchId: match.id }, 'Failed to refresh stats after match result');
		}
	});

	app.addHook('onClose', async () => {
		removeListener();
	});
};

export default fp(statsModule, {
	name: 'stats-module',
});
