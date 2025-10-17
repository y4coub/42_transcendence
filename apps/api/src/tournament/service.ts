import { EventEmitter } from 'node:events';

import { enqueuePlayer, dequeuePlayer, listQueuedPlayers, createMatchFromQueue, QueueServiceError } from '@matches/queue';
import { logger } from '@infra/observability/logger';
import {
	createTournament as createTournamentRecord,
	getTournamentById,
	listTournaments,
	registerPlayer as registerPlayerRecord,
	getPlayerByAlias,
	getPlayerById,
	listPlayersForTournament,
	markTournamentRunning,
	markTournamentCompleted,
	getEarliestPendingMatch,
	getLatestAnnouncedMatch,
	markMatchAnnounced,
	recordMatchResult as recordMatchResultRecord,
	listBoardEntries,
	listMatchesForTournament,
	getMatchById,
} from './repository';
import {
	Tournament,
	TournamentBoard,
	TournamentMatch,
	TournamentPlayer,
	TournamentRegister,
	TournamentResult,
	TournamentAnnounceNextResponse,
	tournamentOpponentSchema,
	TournamentOpponent,
} from './schemas';

export interface TournamentAnnouncementEvent {
	tournamentId: string;
	announcement: TournamentAnnounceNextResponse;
}

export interface TournamentResultEvent {
	tournamentId: string;
	match: TournamentMatch;
}

type TournamentEventName = 'announce' | 'result';

type TournamentEventPayloads = {
	announce: TournamentAnnouncementEvent;
	result: TournamentResultEvent;
};

const tournamentEmitter = new EventEmitter();

const addListener = <E extends TournamentEventName>(event: E, listener: (payload: TournamentEventPayloads[E]) => void) => {
	tournamentEmitter.on(event, listener as (...args: unknown[]) => void);
	return () => tournamentEmitter.off(event, listener as (...args: unknown[]) => void);
};

export const onTournamentAnnouncement = (listener: (event: TournamentAnnouncementEvent) => void): (() => void) => {
	return addListener('announce', listener);
};

export const onTournamentResult = (listener: (event: TournamentResultEvent) => void): (() => void) => {
	return addListener('result', listener);
};

const emitTournamentEvent = <E extends TournamentEventName>(event: E, payload: TournamentEventPayloads[E]) => {
	tournamentEmitter.emit(event, payload as TournamentEventPayloads[TournamentEventName]);
};

export type TournamentServiceErrorCode =
	| 'TOURNAMENT_NOT_FOUND'
	| 'TOURNAMENT_CREATION_FAILED'
	| 'TOURNAMENT_CLOSED'
	| 'ALIAS_IN_USE'
	| 'REGISTRATION_FAILED'
	| 'PLAYER_NOT_FOUND'
	| 'MATCH_NOT_FOUND'
	| 'INVALID_WINNER';

export class TournamentServiceError extends Error {
	constructor(public readonly code: TournamentServiceErrorCode, message: string) {
		super(message);
		this.name = 'TournamentServiceError';
	}
}

const expectTournament = (tournamentId: string): Tournament => {
	const tournament = getTournamentById(tournamentId);
	if (!tournament) {
		throw new TournamentServiceError('TOURNAMENT_NOT_FOUND', 'Tournament not found');
	}

	return tournament;
};

const assertTournamentActive = (tournament: Tournament): void => {
	if (tournament.status === 'completed') {
		throw new TournamentServiceError('TOURNAMENT_CLOSED', 'Tournament has already completed');
	}
};

const expectPlayer = (playerId: string): TournamentPlayer => {
	const player = getPlayerById(playerId);
	if (!player) {
		throw new TournamentServiceError('PLAYER_NOT_FOUND', 'Tournament player not found');
	}

	return player;
};

const toOpponent = (player: TournamentPlayer): TournamentOpponent => {
	return tournamentOpponentSchema.parse({
		playerId: player.id,
		alias: player.alias,
	});
};

const resolveMatchOpponents = (match: TournamentMatch): { p1: TournamentOpponent; p2: TournamentOpponent } => {
	const p1 = expectPlayer(match.p1Id);
	const p2 = expectPlayer(match.p2Id);
	return { p1: toOpponent(p1), p2: toOpponent(p2) };
};

const ensureRunning = (tournament: Tournament): void => {
	if (tournament.status !== 'pending') {
		return;
	}

	const updated = markTournamentRunning(tournament.id);
	if (!updated) {
		logger.warn({ tournamentId: tournament.id }, 'Failed to mark tournament as running');
	}
};

const maybeCompleteTournament = (tournamentId: string): void => {
	const matches = listMatchesForTournament(tournamentId);
	const hasRemainingMatches = matches.some((match) => match.status !== 'completed');
	if (hasRemainingMatches) {
		return;
	}

	const queued = listQueuedPlayers(tournamentId, 1);
	if (queued.length > 0) {
		return;
	}

	const updated = markTournamentCompleted(tournamentId);
	if (!updated) {
		logger.warn({ tournamentId }, 'Failed to mark tournament as completed');
	}
};

const buildAnnouncement = (
	match: TournamentMatch,
	predefinedOpponents?: { p1: TournamentOpponent; p2: TournamentOpponent },
): TournamentAnnounceNextResponse => {
	const opponents = predefinedOpponents ?? resolveMatchOpponents(match);
	return {
		matchId: match.id,
		order: match.order,
		p1: opponents.p1,
		p2: opponents.p2,
	};
};

export const createNewTournament = (name: string): Tournament => {
	const tournament = createTournamentRecord(name);
	if (!tournament) {
		throw new TournamentServiceError('TOURNAMENT_CREATION_FAILED', 'Unable to create tournament');
	}

	return tournament;
};

export const listAllTournaments = (): Tournament[] => {
	return listTournaments();
};

export const getTournament = (tournamentId: string): Tournament => {
	return expectTournament(tournamentId);
};

export const registerPlayer = (input: TournamentRegister): TournamentPlayer => {
	const tournament = expectTournament(input.tournamentId);
	assertTournamentActive(tournament);

	const existing = getPlayerByAlias(input.tournamentId, input.alias);
	if (existing) {
		throw new TournamentServiceError('ALIAS_IN_USE', 'Alias already registered for this tournament');
	}

	const player = registerPlayerRecord(input);
	if (!player) {
		throw new TournamentServiceError('REGISTRATION_FAILED', 'Unable to register player for tournament');
	}

	return player;
};

export const listTournamentPlayers = (tournamentId: string): TournamentPlayer[] => {
	expectTournament(tournamentId);
	return listPlayersForTournament(tournamentId);
};

export const joinQueue = (playerId: string): TournamentPlayer => {
	const player = expectPlayer(playerId);
	const tournament = expectTournament(player.tournamentId);
	assertTournamentActive(tournament);

	return enqueuePlayer(player.id);
};

export const leaveQueue = (playerId: string): TournamentPlayer => {
	expectPlayer(playerId);
	return dequeuePlayer(playerId);
};

export const listQueuedPlayersForTournament = (tournamentId: string, limit?: number): TournamentPlayer[] => {
	expectTournament(tournamentId);
	return listQueuedPlayers(tournamentId, limit);
};

export const getCurrentAnnouncedMatch = (tournamentId: string): TournamentAnnounceNextResponse | null => {
	const match = getLatestAnnouncedMatch(tournamentId);
	if (!match) {
		return null;
	}

	return buildAnnouncement(match);
};

export const announceNextMatch = (tournamentId: string): TournamentAnnounceNextResponse | null => {
	const tournament = expectTournament(tournamentId);
	assertTournamentActive(tournament);

	const existing = getLatestAnnouncedMatch(tournamentId);
	if (existing) {
		return buildAnnouncement(existing);
	}

	let pending = getEarliestPendingMatch(tournamentId);
	let opponents: { p1: TournamentOpponent; p2: TournamentOpponent } | undefined;

	if (!pending) {
		const pairing = createMatchFromQueue(tournamentId);
		if (!pairing) {
			return null;
		}

		pending = pairing.match;
		opponents = { p1: pairing.p1, p2: pairing.p2 };
	}

	const announced = markMatchAnnounced(pending.id) ?? pending;
	ensureRunning(tournament);
	const announcement = buildAnnouncement(announced, opponents);
	emitTournamentEvent('announce', { tournamentId, announcement });
	return announcement;
};

export const recordMatchResult = (input: TournamentResult): TournamentMatch => {
	const match = getMatchById(input.matchId);
	if (!match) {
		throw new TournamentServiceError('MATCH_NOT_FOUND', 'Match not found');
	}

	const tournament = expectTournament(match.tournamentId);
	assertTournamentActive(tournament);

	if (match.p1Id !== input.winnerId && match.p2Id !== input.winnerId) {
		throw new TournamentServiceError('INVALID_WINNER', 'Winner must be one of the match participants');
	}

	const updated = recordMatchResultRecord(input);
	if (!updated) {
		throw new TournamentServiceError('MATCH_NOT_FOUND', 'Unable to record match result');
	}

	maybeCompleteTournament(updated.tournamentId);

	emitTournamentEvent('result', { tournamentId: updated.tournamentId, match: updated });

	return updated;
};

export const getTournamentBoard = (tournamentId: string): TournamentBoard => {
	expectTournament(tournamentId);
	return listBoardEntries(tournamentId);
};

export { QueueServiceError };

