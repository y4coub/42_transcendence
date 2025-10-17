// Placeholder entrypoint to satisfy initial TypeScript configuration. Implementation arrives in Phase 2.
import Fastify, { type FastifyBaseLogger } from 'fastify';
import fastifySensible from '@fastify/sensible';
import fastifyWebsocket from '@fastify/websocket';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';

import { config } from '@infra/config/env';
import { createLogger } from '@infra/observability/logger';
import securityPlugin from '@plugins/security';
import jwtPlugin from '@plugins/jwt';
import docsPlugin from '@plugins/docs';
import authModule from '@auth/index';
import chatModule from '@chat/index';
import tournamentModule from '@tournament/index';
import matchModule from '@matches/index';
import statsModule from '@stats/index';
import usersModule from '@users/index';
import docsRoutes from '@docs/routes';

declare module 'fastify' {
	interface FastifyInstance {
		config: typeof config;
	}
}

export const buildApp = () => {
	const loggerInstance = createLogger();
	Object.assign(loggerInstance, { msgPrefix: undefined });

	const app = Fastify({
		logger: loggerInstance as unknown as FastifyBaseLogger,
		trustProxy: config.server.trustProxy,
	}).withTypeProvider<ZodTypeProvider>();

	app.setValidatorCompiler(validatorCompiler);
	app.setSerializerCompiler(serializerCompiler);

	app.decorate('config', config);

	app.get('/healthz', async () => ({ status: 'ok' }));

	void app.register(fastifySensible);
	void app.register(fastifyWebsocket);
	void app.register(securityPlugin);
	void app.register(jwtPlugin);
 	void app.register(docsPlugin);
	void app.register(authModule);
	void app.register(chatModule);
	void app.register(tournamentModule);
	void app.register(matchModule);
 	void app.register(usersModule);
 	void app.register(statsModule);
 	void app.register(docsRoutes);

	return app;
};

export const start = async () => {
	const app = buildApp();
	try {
		await app.listen({ port: config.server.port, host: config.server.host });
		app.log.info({ host: config.server.host, port: config.server.port }, 'Server listening');
	} catch (error) {
		app.log.error({ err: error }, 'Failed to start server');
		process.exit(1);
	}
	return app;
};

if (import.meta.url === `file://${process.argv[1]}`) {
	void start();
}
