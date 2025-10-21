import type { FastifyPluginAsync, FastifyPluginOptions, RawServerDefault } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export type FastifyPluginAsyncZod<
	Options extends FastifyPluginOptions = FastifyPluginOptions
> = FastifyPluginAsync<Options, RawServerDefault, ZodTypeProvider>;
