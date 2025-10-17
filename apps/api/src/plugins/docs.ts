import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

const OPENAPI_YAML_RELATIVE_PATH = path.join('openapi', 'openapi.yaml');
const OPENAPI_JSON_RELATIVE_PATH = path.join('openapi', 'openapi.json');

const collectCandidateRoots = (): string[] => {
  const roots = new Set<string>();

  let cwdCursor = process.cwd();
  for (let i = 0; i < 4; i += 1) {
    roots.add(cwdCursor);
    const parent = path.resolve(cwdCursor, '..');
    if (parent === cwdCursor) {
      break;
    }
    cwdCursor = parent;
  }

  if (typeof __dirname === 'string') {
    let dirCursor = __dirname;
    for (let i = 0; i < 6; i += 1) {
      roots.add(dirCursor);
      const parent = path.resolve(dirCursor, '..');
      if (parent === dirCursor) {
        break;
      }
      dirCursor = parent;
    }
  }

  return Array.from(roots);
};

const findSpecPath = async (relativePath: string): Promise<string> => {
  const candidateRoots = collectCandidateRoots();
  const attempted = new Set<string>();

  for (const root of candidateRoots) {
    const candidate = path.resolve(root, relativePath);
    if (attempted.has(candidate)) {
      continue;
    }
    attempted.add(candidate);

    try {
      await fs.stat(candidate);
      return candidate;
    } catch {
      // Ignore missing candidate; try next root.
    }
  }

  throw new Error(
    `Unable to locate OpenAPI spec relative to roots: ${candidateRoots.join(', ')}`,
  );
};

type CachedSpec<TContent> = {
  mtimeMs: number;
  raw: string;
  hash: string;
  content: TContent;
};

const createSpecLoader = <TContent>(
  specPath: string,
  parse: (raw: string) => TContent,
) => {
  let cache: CachedSpec<TContent> | null = null;

  return async (): Promise<CachedSpec<TContent>> => {
    let stats;
    try {
      stats = await fs.stat(specPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to access OpenAPI spec at ${specPath}: ${message}`);
    }

    if (cache && cache.mtimeMs === stats.mtimeMs) {
      return cache;
    }

    let raw: string;
    try {
      raw = await fs.readFile(specPath, 'utf-8');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to read OpenAPI spec at ${specPath}: ${message}`);
    }

    let content: TContent;
    try {
      content = parse(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to parse OpenAPI spec at ${specPath}: ${message}`);
    }

    const hash = createHash('sha256').update(raw).digest('hex').slice(0, 12);
    cache = {
      mtimeMs: stats.mtimeMs,
      raw,
      hash,
      content,
    } satisfies CachedSpec<TContent>;

    return cache;
  };
};

declare module 'fastify' {
  interface FastifyInstance {
    openapiPaths: {
      yaml: string;
      json: string;
    };
    loadOpenapiYamlSpec: () => Promise<CachedSpec<string>>;
    loadOpenapiJsonSpec: () => Promise<CachedSpec<Record<string, unknown>>>;
  }
}

const docsPlugin: FastifyPluginAsync = async (app) => {
  const yamlPath = await findSpecPath(OPENAPI_YAML_RELATIVE_PATH);
  const jsonPath = await findSpecPath(OPENAPI_JSON_RELATIVE_PATH);

  const loadYamlSpec = createSpecLoader<string>(yamlPath, (raw) => raw);
  const loadJsonSpec = createSpecLoader<Record<string, unknown>>(jsonPath, (raw) => {
    return JSON.parse(raw) as Record<string, unknown>;
  });

  app.decorate('openapiPaths', {
    yaml: yamlPath,
    json: jsonPath,
  });

  app.decorate('loadOpenapiYamlSpec', () => loadYamlSpec());
  app.decorate('loadOpenapiJsonSpec', () => loadJsonSpec());

  app.get('/openapi.yaml', async (_request, reply) => {
    try {
      const spec = await app.loadOpenapiYamlSpec();
      reply
        .type('application/yaml; charset=utf-8')
        .header('cache-control', app.config.nodeEnv === 'production' ? 'private, max-age=86400, immutable' : 'private, max-age=5, must-revalidate')
        .header('etag', `"${spec.hash}"`);
      return reply.send(spec.raw);
    } catch (error) {
      app.log.error({ err: error }, 'Failed to load OpenAPI specification');
      throw app.httpErrors.internalServerError('Unable to load OpenAPI specification');
    }
  });
};

export default fp(docsPlugin, {
  name: 'docs-plugin',
});
