import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

import statsRoutes from './routes';

const statsModule: FastifyPluginAsync = async (app) => {
	await app.register(statsRoutes);
};

export default fp(statsModule, {
	name: 'stats-module',
});
