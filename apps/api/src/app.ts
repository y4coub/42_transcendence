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

type StartOptions = {
	port?: number;
	host?: string;
};

const parseCliOptions = (argv: string[]): StartOptions => {
	const options: StartOptions = {};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === '--port' && argv[index + 1]) {
			const maybePort = Number.parseInt(argv[index + 1], 10);
			if (Number.isFinite(maybePort)) {
				options.port = maybePort;
			}
			index += 1;
			continue;
		}

		if (arg === '--host' && argv[index + 1]) {
			options.host = argv[index + 1];
			index += 1;
			continue;
		}
	}
	return options;
};

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

export const start = async (overrides: StartOptions = {}) => {
	const app = buildApp();
	try {
		const envPort = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : undefined;
		const normalizedEnvPort = typeof envPort === 'number' && Number.isFinite(envPort) ? envPort : undefined;
		const port = overrides.port ?? normalizedEnvPort ?? config.server.port;
		const host = overrides.host ?? process.env.HOST ?? config.server.host;
		await app.listen({ port, host });
		app.log.info({ host, port }, 'Server listening');
	} catch (error) {
		app.log.error({ err: error }, 'Failed to start server');
		process.exit(1);
	}
	return app;
};

if (import.meta.url === `file://${process.argv[1]}`) {
	const cliOptions = parseCliOptions(process.argv.slice(2));
	void start(cliOptions);
}
