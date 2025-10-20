import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

import tournamentRoutes from './routes';
import tournamentWebsocket from './ws';

const tournamentModule: FastifyPluginAsync = async (app) => {
  await app.register(tournamentRoutes);
  await app.register(tournamentWebsocket);
};

export default fp(tournamentModule, {
  name: 'tournament-module',
});
