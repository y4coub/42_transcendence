import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

import usersRoutes from './routes';

const usersModule: FastifyPluginAsync = async (app) => {
  await app.register(usersRoutes);
};

export default fp(usersModule, {
  name: 'users-module',
});
