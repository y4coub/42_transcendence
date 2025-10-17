import { randomUUID } from 'node:crypto';

import { Database } from 'better-sqlite3';

import { getDatabase } from '@infra/db/client';
import {
  tournamentBoardEntrySchema,
  tournamentBoardSchema,
  tournamentMatchSchema,
  tournamentMatchStatusSchema,
  tournamentOpponentSchema,
  tournamentPlayerSchema,
  tournamentSchema,
} from './schemas';

const mapRow = <T>(row: Record<string, unknown> | undefined, schema: { parse: (value: unknown) => T }) => {
  if (!row) {
    return undefined;
  }

  return schema.parse(row);
};

const mapRows = <T>(rows: Record<string, unknown>[], schema: { parse: (value: unknown) => T }) => {
  return rows.map((row) => schema.parse(row));
};

const selectTournament = `
  SELECT
    id,
    name,
    status,
    STRFTIME('%Y-%m-%dT%H:%M:%fZ', created_at) AS createdAt,
    STRFTIME('%Y-%m-%dT%H:%M:%fZ', started_at) AS startedAt,
    STRFTIME('%Y-%m-%dT%H:%M:%fZ', completed_at) AS completedAt
  FROM tournaments
`;

const selectPlayer = `
  SELECT
    id,
    tournament_id AS tournamentId,
    alias,
    user_id AS userId,
    STRFTIME('%Y-%m-%dT%H:%M:%fZ', queued_at) AS queuedAt,
    STRFTIME('%Y-%m-%dT%H:%M:%fZ', created_at) AS createdAt
  FROM tournament_players
`;

const selectMatch = `
  SELECT
    id,
    tournament_id AS tournamentId,
    p1_id AS p1Id,
    p2_id AS p2Id,
    order_idx AS "order",
    status,
    winner_id AS winnerId,
    p1_score AS p1Score,
    p2_score AS p2Score,
    STRFTIME('%Y-%m-%dT%H:%M:%fZ', created_at) AS createdAt,
    STRFTIME('%Y-%m-%dT%H:%M:%fZ', announced_at) AS announcedAt,
    STRFTIME('%Y-%m-%dT%H:%M:%fZ', completed_at) AS completedAt
  FROM tournament_matches
`;

const selectBoardRows = `
  SELECT
    m.id AS matchId,
    m.order_idx AS "order",
    m.status,
    m.winner_id AS winnerId,
    m.p1_score AS p1Score,
    m.p2_score AS p2Score,
    p1.id AS p1_playerId,
    p1.alias AS p1_alias,
    p2.id AS p2_playerId,
    p2.alias AS p2_alias
  FROM tournament_matches m
  INNER JOIN tournament_players p1 ON p1.id = m.p1_id
  INNER JOIN tournament_players p2 ON p2.id = m.p2_id
`;

const buildBoardEntry = (row: Record<string, unknown>) => {
  const opponentSchema = tournamentOpponentSchema;
  const entrySchema = tournamentBoardEntrySchema;

  const opponentA = opponentSchema.parse({
    playerId: row.p1_playerId,
    alias: row.p1_alias,
  });

  const opponentB = opponentSchema.parse({
    playerId: row.p2_playerId,
    alias: row.p2_alias,
  });

  return entrySchema.parse({
    matchId: row.matchId,
    order: row.order,
    status: row.status,
    winnerId: row.winnerId,
    p1Score: row.p1Score,
    p2Score: row.p2Score,
    p1: opponentA,
    p2: opponentB,
  });
};

const withTransaction = <T>(db: Database, handler: () => T) => {
  const run = db.transaction(handler);
  return run();
};

export const createTournament = (name: string) => {
  const db = getDatabase();
  const id = randomUUID();

  db.prepare(
    `INSERT INTO tournaments (id, name, status)
     VALUES (@id, @name, 'pending')`,
  ).run({ id, name });

  const row = db.prepare(`${selectTournament} WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return mapRow(row, tournamentSchema) ?? null;
};

export const getTournamentById = (tournamentId: string) => {
  const row = getDatabase()
    .prepare(`${selectTournament} WHERE id = ?`)
    .get(tournamentId) as Record<string, unknown> | undefined;

  return mapRow(row, tournamentSchema);
};

export const listTournaments = () => {
  const rows = getDatabase()
    .prepare(`${selectTournament} ORDER BY created_at DESC`)
    .all() as Record<string, unknown>[];

  return mapRows(rows, tournamentSchema);
};

export const markTournamentRunning = (tournamentId: string) => {
  const db = getDatabase();
  db.prepare(
    `UPDATE tournaments
     SET status = 'running', started_at = COALESCE(started_at, datetime('now'))
     WHERE id = @id`,
  ).run({ id: tournamentId });

  return getTournamentById(tournamentId) ?? null;
};

export const markTournamentCompleted = (tournamentId: string) => {
  const db = getDatabase();
  db.prepare(
    `UPDATE tournaments
     SET status = 'completed', completed_at = COALESCE(completed_at, datetime('now'))
     WHERE id = @id`,
  ).run({ id: tournamentId });

  return getTournamentById(tournamentId) ?? null;
};

export interface RegisterPlayerInput {
  tournamentId: string;
  alias: string;
  userId?: string;
}

export const registerPlayer = (input: RegisterPlayerInput) => {
  const db = getDatabase();
  const id = randomUUID();

  db.prepare(
    `INSERT INTO tournament_players (id, tournament_id, alias, user_id)
     VALUES (@id, @tournament_id, @alias, @user_id)`,
  ).run({
    id,
    tournament_id: input.tournamentId,
    alias: input.alias,
    user_id: input.userId ?? null,
  });

  const row = db.prepare(`${selectPlayer} WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return mapRow(row, tournamentPlayerSchema) ?? null;
};

export const getPlayerById = (playerId: string) => {
  const row = getDatabase()
    .prepare(`${selectPlayer} WHERE id = ?`)
    .get(playerId) as Record<string, unknown> | undefined;

  return mapRow(row, tournamentPlayerSchema);
};

export const getPlayerByAlias = (tournamentId: string, alias: string) => {
  const row = getDatabase()
    .prepare(`${selectPlayer} WHERE tournament_id = @tournament_id AND alias = @alias COLLATE NOCASE`)
    .get({ tournament_id: tournamentId, alias }) as Record<string, unknown> | undefined;

  return mapRow(row, tournamentPlayerSchema);
};

export const listPlayersForTournament = (tournamentId: string) => {
  const rows = getDatabase()
    .prepare(`${selectPlayer} WHERE tournament_id = ? ORDER BY created_at ASC`)
    .all(tournamentId) as Record<string, unknown>[];

  return mapRows(rows, tournamentPlayerSchema);
};

export const markPlayerQueued = (playerId: string) => {
  const db = getDatabase();
  db.prepare(`UPDATE tournament_players SET queued_at = datetime('now') WHERE id = @id`).run({ id: playerId });
  const row = db.prepare(`${selectPlayer} WHERE id = ?`).get(playerId) as Record<string, unknown> | undefined;
  return mapRow(row, tournamentPlayerSchema) ?? null;
};

export const clearPlayerQueue = (playerId: string) => {
  const db = getDatabase();
  db.prepare(`UPDATE tournament_players SET queued_at = NULL WHERE id = @id`).run({ id: playerId });
  const row = db.prepare(`${selectPlayer} WHERE id = ?`).get(playerId) as Record<string, unknown> | undefined;
  return mapRow(row, tournamentPlayerSchema) ?? null;
};

export const getQueuedPlayers = (tournamentId: string, limit = 2) => {
  const rows = getDatabase()
    .prepare(
      `${selectPlayer}
       WHERE tournament_id = @tournament_id AND queued_at IS NOT NULL
       ORDER BY queued_at ASC
       LIMIT @limit`,
    )
    .all({ tournament_id: tournamentId, limit }) as Record<string, unknown>[];

  return mapRows(rows, tournamentPlayerSchema);
};

const nextOrderForTournament = (db: Database, tournamentId: string) => {
  const row = db
    .prepare(`SELECT COALESCE(MAX(order_idx), 0) + 1 AS next_order FROM tournament_matches WHERE tournament_id = ?`)
    .get(tournamentId) as { next_order: number } | undefined;

  return row?.next_order ?? 1;
};

export interface CreateMatchInput {
  tournamentId: string;
  p1Id: string;
  p2Id: string;
  order?: number;
}

export const createMatch = (input: CreateMatchInput) => {
  const db = getDatabase();
  const id = randomUUID();

  let computedOrder = input.order;

  withTransaction(db, () => {
    const orderIndex = computedOrder ?? nextOrderForTournament(db, input.tournamentId);
    computedOrder = orderIndex;

    db.prepare(
      `INSERT INTO tournament_matches (id, tournament_id, p1_id, p2_id, order_idx)
       VALUES (@id, @tournament_id, @p1_id, @p2_id, @order_idx)`,
    ).run({
      id,
      tournament_id: input.tournamentId,
      p1_id: input.p1Id,
      p2_id: input.p2Id,
      order_idx: orderIndex,
    });
  });

  const row = db.prepare(`${selectMatch} WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return mapRow(row, tournamentMatchSchema) ?? null;
};

export const getMatchById = (matchId: string) => {
  const row = getDatabase()
    .prepare(`${selectMatch} WHERE id = ?`)
    .get(matchId) as Record<string, unknown> | undefined;

  return mapRow(row, tournamentMatchSchema);
};

export const listMatchesForTournament = (tournamentId: string) => {
  const rows = getDatabase()
    .prepare(`${selectMatch} WHERE tournament_id = ? ORDER BY order_idx ASC`)
    .all(tournamentId) as Record<string, unknown>[];

  return mapRows(rows, tournamentMatchSchema);
};

export const getEarliestPendingMatch = (tournamentId: string) => {
  const row = getDatabase()
    .prepare(
      `${selectMatch}
       WHERE tournament_id = @tournament_id AND status = 'pending'
       ORDER BY order_idx ASC
       LIMIT 1`,
    )
    .get({ tournament_id: tournamentId }) as Record<string, unknown> | undefined;

  return mapRow(row, tournamentMatchSchema);
};

export const getLatestAnnouncedMatch = (tournamentId: string) => {
  const row = getDatabase()
    .prepare(
      `${selectMatch}
       WHERE tournament_id = @tournament_id AND status = 'announced'
       ORDER BY announced_at DESC
       LIMIT 1`,
    )
    .get({ tournament_id: tournamentId }) as Record<string, unknown> | undefined;

  return mapRow(row, tournamentMatchSchema);
};

export const markMatchAnnounced = (matchId: string) => {
  const db = getDatabase();
  db.prepare(
    `UPDATE tournament_matches
     SET status = 'announced', announced_at = datetime('now')
     WHERE id = @id`,
  ).run({ id: matchId });

  const row = db.prepare(`${selectMatch} WHERE id = ?`).get(matchId) as Record<string, unknown> | undefined;
  return mapRow(row, tournamentMatchSchema) ?? null;
};

export interface RecordMatchResultInput {
  matchId: string;
  winnerId: string;
  p1Score: number;
  p2Score: number;
}

export const recordMatchResult = (input: RecordMatchResultInput) => {
  const db = getDatabase();
  db.prepare(
    `UPDATE tournament_matches
     SET status = 'completed', winner_id = @winner_id, p1_score = @p1_score, p2_score = @p2_score, completed_at = datetime('now')
     WHERE id = @id`,
  ).run({
    id: input.matchId,
    winner_id: input.winnerId,
    p1_score: input.p1Score,
    p2_score: input.p2Score,
  });

  const row = db.prepare(`${selectMatch} WHERE id = ?`).get(input.matchId) as Record<string, unknown> | undefined;
  return mapRow(row, tournamentMatchSchema) ?? null;
};

export const listBoardEntries = (tournamentId: string) => {
  const rows = getDatabase()
    .prepare(
      `${selectBoardRows}
       WHERE m.tournament_id = @tournament_id
       ORDER BY m.order_idx ASC`,
    )
    .all({ tournament_id: tournamentId }) as Record<string, unknown>[];

  return tournamentBoardSchema.parse(rows.map((row) => buildBoardEntry(row)));
};

export const resetAnnouncedMatch = (matchId: string) => {
  const db = getDatabase();
  db.prepare(
    `UPDATE tournament_matches
     SET status = 'pending', announced_at = NULL
     WHERE id = @id`,
  ).run({ id: matchId });

  const row = db.prepare(`${selectMatch} WHERE id = ?`).get(matchId) as Record<string, unknown> | undefined;
  return mapRow(row, tournamentMatchSchema) ?? null;
};

export const updateMatchOrder = (matchId: string, order: number) => {
  const db = getDatabase();
  db.prepare(`UPDATE tournament_matches SET order_idx = @order WHERE id = @id`).run({ id: matchId, order });
  const row = db.prepare(`${selectMatch} WHERE id = ?`).get(matchId) as Record<string, unknown> | undefined;
  return mapRow(row, tournamentMatchSchema) ?? null;
};

export const validateMatchStatus = (status: unknown) => {
  return tournamentMatchStatusSchema.safeParse(status).success;
};
