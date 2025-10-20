import { createMatchFromQueue, QueueServiceError } from '@matches/queue';
import {
	clearPlayerQueue,
	createMatch,
	getMatchById,
	getPlayerById,
	markMatchAnnounced,
} from '@tournament/repository';
import {
	TournamentMatch,
	TournamentOpponent,
	TournamentPlayer,
	TournamentResult,
	tournamentOpponentSchema,
} from '@tournament/schemas';
import { recordMatchResult as recordTournamentMatchResult } from '@tournament/service';

import type { MatchCreate, MatchDetail } from './schemas';

export type MatchServiceErrorCode =
	| 'PLAYER_NOT_FOUND'
	| 'MATCH_NOT_FOUND'
	| 'MISMATCHED_TOURNAMENT'
	| 'SAME_PLAYER'
	| 'QUEUE_EMPTY'
	| 'MATCH_CREATION_FAILED';

export class MatchServiceError extends Error {
	constructor(public readonly code: MatchServiceErrorCode, message: string) {
		super(message);
		this.name = 'MatchServiceError';
	}
}

const toOpponent = (player: TournamentPlayer): TournamentOpponent => {
	return tournamentOpponentSchema.parse({
		playerId: player.id,
		alias: player.alias,
	});
};

const expectPlayer = (playerId: string): TournamentPlayer => {
	const player = getPlayerById(playerId);
	if (!player) {
		throw new MatchServiceError('PLAYER_NOT_FOUND', 'Tournament player not found');
	}

	return player;
};

const expectMatch = (matchId: string): TournamentMatch => {
	const match = getMatchById(matchId);
	if (!match) {
		throw new MatchServiceError('MATCH_NOT_FOUND', 'Match not found');
	}

	return match;
};

const ensureSameTournament = (tournamentId: string, ...players: TournamentPlayer[]) => {
	for (const player of players) {
		if (player.tournamentId !== tournamentId) {
			throw new MatchServiceError('MISMATCHED_TOURNAMENT', 'Players must belong to the target tournament');
		}
	}
};

const resolveTournamentId = (input: MatchCreate, player: TournamentPlayer) => {
	return input.tournamentId ?? player.tournamentId;
};

const finalizeMatchSetup = (match: TournamentMatch): TournamentMatch => {
	const announced = markMatchAnnounced(match.id);
	return announced ?? match;
};

export const createMatchSession = (input: MatchCreate): TournamentMatch => {
	const requester = expectPlayer(input.requesterId);
	const tournamentId = resolveTournamentId(input, requester);

	if (!tournamentId) {
		throw new MatchServiceError('MISMATCHED_TOURNAMENT', 'Tournament context is required');
	}

	if (input.opponentId) {
		const opponent = expectPlayer(input.opponentId);
		if (opponent.id === requester.id) {
			throw new MatchServiceError('SAME_PLAYER', 'Cannot create a match against the same player');
		}

		ensureSameTournament(tournamentId, requester, opponent);

		const created = createMatch({
			tournamentId,
			p1Id: requester.id,
			p2Id: opponent.id,
		});

		if (!created) {
			throw new MatchServiceError('MATCH_CREATION_FAILED', 'Unable to create match');
		}

		void clearPlayerQueue(requester.id);
		void clearPlayerQueue(opponent.id);

		return finalizeMatchSetup(created);
	}

	try {
		const pairing = createMatchFromQueue(tournamentId);
		if (!pairing) {
			throw new MatchServiceError('QUEUE_EMPTY', 'Not enough players queued to create a match');
		}

		return finalizeMatchSetup(pairing.match);
	} catch (error) {
		if (error instanceof MatchServiceError) {
			throw error;
		}

		if (error instanceof QueueServiceError) {
			switch (error.code) {
				case 'PLAYER_NOT_FOUND':
					throw new MatchServiceError('PLAYER_NOT_FOUND', error.message);
				case 'MATCH_CREATION_FAILED':
					throw new MatchServiceError('MATCH_CREATION_FAILED', error.message);
				default:
					break;
			}
		}

		throw error;
	}
};

export const getMatchDetail = (matchId: string): MatchDetail => {
	const match = expectMatch(matchId);
	const p1 = expectPlayer(match.p1Id);
	const p2 = expectPlayer(match.p2Id);

	const lastScore = match.p1Score !== null && match.p2Score !== null
		? {
			p1Score: match.p1Score,
			p2Score: match.p2Score,
			winnerId: match.winnerId ?? null,
		}
		: null;

	return {
		matchId: match.id,
		tournamentId: match.tournamentId,
		status: match.status,
		startedAt: match.announcedAt,
		finishedAt: match.completedAt,
		participants: {
			p1: toOpponent(p1),
			p2: toOpponent(p2),
		},
		lastScore,
	};
};

export const recordMatchOutcome = (input: TournamentResult): TournamentMatch => {
	return recordTournamentMatchResult(input);
};