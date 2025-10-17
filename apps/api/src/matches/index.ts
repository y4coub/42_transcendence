import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

import matchRoutes from './routes';
import matchWebsocket from './ws';

const matchModule: FastifyPluginAsync = async (app) => {
  await app.register(matchRoutes);
  await app.register(matchWebsocket);
};

export default fp(matchModule, {
  name: 'match-module',
});
