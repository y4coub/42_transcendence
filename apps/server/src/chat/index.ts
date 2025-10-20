import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

import chatRoutes from './routes';
import chatWebsocket from './ws';

const chatModule: FastifyPluginAsync = async (app) => {
  await app.register(chatRoutes);
  await app.register(chatWebsocket);
};

export default fp(chatModule, {
  name: 'chat-module',
});
