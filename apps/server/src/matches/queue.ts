import { logger } from '@infra/observability/logger';
import {
  clearPlayerQueue,
  createMatch,
  getPlayerById,
  getQueuedPlayers,
  markPlayerQueued,
} from '@tournament/repository';
import {
  TournamentMatch,
  TournamentOpponent,
  TournamentPlayer,
  tournamentOpponentSchema,
} from '@tournament/schemas';

export type QueueServiceErrorCode =
  | 'PLAYER_NOT_FOUND'
  | 'PLAYER_ALREADY_QUEUED'
  | 'MATCH_CREATION_FAILED';

export class QueueServiceError extends Error {
  constructor(public readonly code: QueueServiceErrorCode, message: string) {
    super(message);
    this.name = 'QueueServiceError';
  }
}

const toOpponent = (player: TournamentPlayer): TournamentOpponent => {
  return tournamentOpponentSchema.parse({
    playerId: player.id,
    alias: player.alias,
  });
};

const ensurePlayer = (playerId: string): TournamentPlayer => {
  const player = getPlayerById(playerId);
  if (!player) {
    throw new QueueServiceError('PLAYER_NOT_FOUND', 'Tournament player not found');
  }

  return player;
};

export const enqueuePlayer = (playerId: string): TournamentPlayer => {
  const player = ensurePlayer(playerId);

  if (player.queuedAt) {
    throw new QueueServiceError('PLAYER_ALREADY_QUEUED', 'Player already queued');
  }

  const updated = markPlayerQueued(playerId);
  if (!updated) {
    throw new QueueServiceError('PLAYER_NOT_FOUND', 'Unable to enqueue player');
  }

  return updated;
};

export const dequeuePlayer = (playerId: string): TournamentPlayer => {
  ensurePlayer(playerId);
  const updated = clearPlayerQueue(playerId);
  if (!updated) {
    throw new QueueServiceError('PLAYER_NOT_FOUND', 'Unable to dequeue player');
  }

  return updated;
};

export const listQueuedPlayers = (tournamentId: string, limit?: number): TournamentPlayer[] => {
  return getQueuedPlayers(tournamentId, limit ?? 50);
};

export interface MatchPairing {
  match: TournamentMatch;
  p1: TournamentOpponent;
  p2: TournamentOpponent;
}

export const createMatchFromQueue = (tournamentId: string): MatchPairing | null => {
  const queued = getQueuedPlayers(tournamentId, 2);
  if (queued.length < 2) {
    return null;
  }

  const [p1, p2] = queued;
  const match = createMatch({
    tournamentId,
    p1Id: p1.id,
    p2Id: p2.id,
  });

  if (!match) {
    logger.error({ tournamentId, p1Id: p1.id, p2Id: p2.id }, 'Failed to create tournament match from queue');
    throw new QueueServiceError('MATCH_CREATION_FAILED', 'Unable to create match for queued players');
  }

  clearPlayerQueue(p1.id);
  clearPlayerQueue(p2.id);

  return {
    match,
    p1: toOpponent(p1),
    p2: toOpponent(p2),
  };
};
