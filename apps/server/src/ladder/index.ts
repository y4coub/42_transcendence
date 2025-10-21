import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

import ladderRoutes from './routes';

const ladderModule: FastifyPluginAsync = async (app) => {
	await app.register(ladderRoutes);
};

export default fp(ladderModule, {
	name: 'ladder-module',
});
