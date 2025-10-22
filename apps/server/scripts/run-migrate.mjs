#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const args = process.argv.slice(2);

const runCommand = (command, commandArgs) => {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit', cwd: projectRoot });
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 0;
};

const distMigrationPath = path.join(projectRoot, 'dist', 'infra', 'db', 'migrate.js');

if (existsSync(distMigrationPath)) {
  const status = runCommand(process.execPath, [distMigrationPath, ...args]);
  process.exit(status);
}

const binaryName = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
const tsxBin = path.join(projectRoot, 'node_modules', '.bin', binaryName);

if (existsSync(tsxBin)) {
  const status = runCommand(tsxBin, ['src/infra/db/migrate.ts', ...args]);
  process.exit(status);
}

console.error('Migration runner not found. Build the project or install dev dependencies to run migrations.');
process.exit(1);
