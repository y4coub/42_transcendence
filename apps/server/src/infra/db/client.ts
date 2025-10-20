import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { config } from '@infra/config/env';
import { logger } from '@infra/observability/logger';

let connection: Database.Database | null = null;

const resolveDatabasePath = (url: string): string => {
  if (!url.startsWith('file:')) {
    throw new Error('Only file-based SQLite URLs are supported.');
  }

  const filePath = url.replace(/^file:/, '');
  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  return path.resolve(process.cwd(), filePath);
};

const ensureDirectory = (filePath: string) => {
  const directory = path.dirname(filePath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
};

export const getDatabase = (): Database.Database => {
  if (connection) {
    return connection;
  }

  const sqlitePath = resolveDatabasePath(config.database.url);
  ensureDirectory(sqlitePath);

  connection = new Database(sqlitePath);
  connection.pragma('journal_mode = WAL');
  connection.pragma('foreign_keys = ON');

  logger.info({ sqlitePath }, 'SQLite connection established');
  return connection;
};

export const closeDatabase = () => {
  if (connection) {
    connection.close();
    connection = null;
  }
};