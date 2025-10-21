#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { Database } from 'better-sqlite3';

import { getDatabase, closeDatabase } from '@infra/db/client';
import { config } from '@infra/config/env';
import { logger } from '@infra/observability/logger';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'db/migrations');

const ensureMigrationsTable = (db: Database) => {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();
};

const listMigrationFiles = (): string[] => {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found at ${MIGRATIONS_DIR}`);
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
};

const getAppliedMigrations = (db: Database): Set<string> => {
  const rows = db.prepare('SELECT id FROM schema_migrations').all() as Array<{ id: string }>;
  return new Set(rows.map((row) => row.id));
};

const applyMigration = (db: Database, fileName: string) => {
  const filePath = path.join(MIGRATIONS_DIR, fileName);
  const sql = fs.readFileSync(filePath, 'utf-8');

  const containsExplicitTransaction = /^\s*BEGIN\b/im.test(sql);

  if (containsExplicitTransaction) {
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(fileName);
  } else {
    const transaction = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(fileName);
    });

    transaction();
  }
  logger.info({ migration: fileName }, 'Migration applied');
};

const migrateUp = () => {
  const db = getDatabase();
  ensureMigrationsTable(db);

  const files = listMigrationFiles();
  const applied = getAppliedMigrations(db);

  files
    .filter((file) => !applied.has(file))
    .forEach((file) => {
      logger.info({ migration: file }, 'Applying migration');
      applyMigration(db, file);
    });

  logger.info('Migrations complete');
};

const main = () => {
  const command = process.argv[2] ?? 'up';

  if (command !== 'up') {
    // eslint-disable-next-line no-console
    console.error(`Unsupported command "${command}". Only "up" is supported.`);
    process.exit(1);
  }

  try {
    logger.info({ database: config.database.url }, 'Running migrations');
    migrateUp();
  } catch (error) {
    logger.error({ err: error }, 'Migration failed');
    process.exitCode = 1;
  } finally {
    closeDatabase();
  }
};

main();
