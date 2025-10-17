import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

import authRoutes from './routes';
import twofaRoutes from './twofa/routes';

const authModule: FastifyPluginAsync = async (app) => {
  await app.register(authRoutes);
  await app.register(twofaRoutes);
};

export default fp(authModule, {
  name: 'auth-module',
});
