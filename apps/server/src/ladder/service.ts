import { randomUUID } from 'node:crypto';

import { ladderOverviewSchema, ladderQueueStateSchema, type LadderOverview, type LadderQueueState } from './schemas';
import { listLeaderboard } from '@stats/repository';
import { getUserStats, listRecentMatches, getUserProfile } from '@users/repository';
import * as matchRepo from '@matches/repository';

type QueueEntry = {
	userId: string;
	joinedAt: number;
};

const ladderQueue: QueueEntry[] = [];
const notifications = new Map<string, string>();
let currentMatchId: string | null = null;

const MATCH_FOUND_MESSAGE = 'Match found! Launch the arena to start playing.';
const DEFAULT_QUEUE_MESSAGE = 'Searching for an opponent…';
const NOT_IN_QUEUE_MESSAGE = 'You are not currently in the ranked queue.';

const computeRating = (wins: number, losses: number, streak: number): number => {
	const base = 1000 + wins * 25 - losses * 10 + streak * 15;
	return Math.max(200, Math.round(base));
};

const estimateWait = (position: number | null): number | null => {
	if (!position) {
		return null;
	}

	// Rough heuristic: first pair within ~20s, each extra position adds 35s.
	return Math.max(15, 20 + (position - 1) * 35);
};

const removeQueueEntry = (userId: string): void => {
	const index = ladderQueue.findIndex((entry) => entry.userId === userId);
	if (index >= 0) {
		ladderQueue.splice(index, 1);
	}
};

const hasActiveMatch = (userId: string): boolean => {
	const match = matchRepo.findActiveMatchForUser(userId);
	return Boolean(match);
};

const createRankedMatch = (p1Id: string, p2Id: string): string | null => {
	try {
		const matchId = randomUUID();
		matchRepo.createMatch({
			id: matchId,
			p1Id,
			p2Id,
		});
		return matchId;
	} catch (error) {
		console.error('[Ladder] Failed to create ranked match', error);
		return null;
	}
};

const pushNotification = (userId: string, message: string): void => {
	notifications.set(userId, message);
};

const peekNotification = (userId: string): string | undefined => {
	return notifications.get(userId);
};

const pullNotification = (userId: string): string | undefined => {
	const message = notifications.get(userId);
	if (message !== undefined) {
		notifications.delete(userId);
	}
	return message;
};

const buildQueueState = (userId: string, consumeMessage: boolean): LadderQueueState => {
	const index = ladderQueue.findIndex((entry) => entry.userId === userId);
	const position = index >= 0 ? index + 1 : null;
	const inQueue = index >= 0;
	const estimatedWaitSeconds = estimateWait(position);

	const message =
		(consumeMessage ? pullNotification(userId) : peekNotification(userId)) ??
		(inQueue ? DEFAULT_QUEUE_MESSAGE : NOT_IN_QUEUE_MESSAGE);

	return ladderQueueStateSchema.parse({
		inQueue,
		position,
		estimatedWaitSeconds,
		matchmakingMessage: message,
	});
};

const buildQueueLineup = (viewerId: string) => {
	return ladderQueue.map((entry, index) => {
		const profile = getUserProfile(entry.userId);

		return {
			userId: entry.userId,
			displayName: profile?.displayName ?? `Player ${entry.userId.slice(0, 6).toUpperCase()}`,
			avatarUrl: profile?.avatarUrl ?? null,
			position: index + 1,
			joinedAt: new Date(entry.joinedAt).toISOString(),
			isYou: entry.userId === viewerId,
		};
	});
};

const attemptPairing = (): void => {
  if (currentMatchId) {
    return;
  }

  if (ladderQueue.length < 2) {
    return;
  }

  const challenger = ladderQueue[0];
  const opponent = ladderQueue[1];

  if (hasActiveMatch(challenger.userId)) {
    removeQueueEntry(challenger.userId);
    pushNotification(challenger.userId, 'Active match detected — removed from queue.');
    attemptPairing();
    return;
  }

  if (hasActiveMatch(opponent.userId)) {
    removeQueueEntry(opponent.userId);
    pushNotification(opponent.userId, 'Active match detected — removed from queue.');
    attemptPairing();
    return;
  }

  const matchId = createRankedMatch(challenger.userId, opponent.userId);
  if (!matchId) {
    pushNotification(challenger.userId, 'Unable to create match. Please try again shortly.');
    pushNotification(opponent.userId, 'Unable to create match. Please try again shortly.');
    return;
  }

  currentMatchId = matchId;
  pushNotification(challenger.userId, MATCH_FOUND_MESSAGE);
  pushNotification(opponent.userId, MATCH_FOUND_MESSAGE);

  ladderQueue.splice(0, 2);
};

export const joinLadderQueue = (userId: string): LadderQueueState => {
	if (hasActiveMatch(userId)) {
		pushNotification(userId, 'You already have an active ranked match.');
		removeQueueEntry(userId);
		return buildQueueState(userId, true);
	}

	removeQueueEntry(userId);
	ladderQueue.push({
		userId,
		joinedAt: Date.now(),
	});
	pushNotification(userId, DEFAULT_QUEUE_MESSAGE);

	attemptPairing();
	return buildQueueState(userId, true);
};

export const leaveLadderQueue = (userId: string): LadderQueueState => {
	removeQueueEntry(userId);
	pushNotification(userId, 'You left the ranked queue.');
	return buildQueueState(userId, true);
};

const buildLeaderboard = (userId: string) => {
	const records = listLeaderboard(10);

	const entries = records.map((record, index) => ({
		userId: record.userId,
		displayName: record.displayName,
		avatarUrl: record.avatarUrl ?? null,
		rating: computeRating(record.wins, record.losses, record.streak),
		rank: index + 1,
		streak: Math.max(0, record.streak),
	}));

	const yourEntry = entries.find((entry) => entry.userId === userId);

	return {
		entries,
		yourRank: yourEntry?.rank ?? null,
	};
};

const buildRecentMatches = (userId: string) => {
	const recent = listRecentMatches(userId, 5);

	return recent.map((match) => {
		const opponentId = match.opponentId ?? undefined;
		const opponentProfile = opponentId ? getUserProfile(opponentId) : null;
		const opponentStats = opponentId ? getUserStats(opponentId) : undefined;

		const opponentDisplayName = opponentProfile?.displayName ?? 'Challenger';
		const opponentRating = opponentStats
			? computeRating(opponentStats.wins, opponentStats.losses, opponentStats.streak)
			: 1000;

		return {
			matchId: match.matchId,
			opponentDisplayName,
			opponentRating,
			result: match.outcome,
			score: `${match.p1Score}-${match.p2Score}`,
			playedAt: match.ts,
		};
	});
};

const buildCurrentMatch = () => {
	if (!currentMatchId) {
		return null;
	}

	const match = matchRepo.getMatch(currentMatchId);
	if (!match) {
		currentMatchId = null;
		return null;
	}

	const championProfile = match.p1Id ? getUserProfile(match.p1Id) : null;
	const championStats = match.p1Id ? getUserStats(match.p1Id) : null;
	const challengerProfile = match.p2Id ? getUserProfile(match.p2Id) : null;
	const challengerStats = match.p2Id ? getUserStats(match.p2Id) : null;

	if (!match.p1Id || !match.p2Id || !championStats || !challengerStats) {
		return null;
	}

	const status =
		match.state === 'countdown' || match.state === 'playing'
			? match.state
			: 'waiting';

	return {
		matchId: match.id,
		startedAt: match.startedAt ?? match.createdAt,
		status,
		champion: {
			userId: match.p1Id,
			displayName: championProfile?.displayName ?? 'Champion',
			avatarUrl: championProfile?.avatarUrl ?? null,
			rating: computeRating(championStats.wins, championStats.losses, championStats.streak),
			role: 'champion' as const,
		},
		challenger: {
			userId: match.p2Id,
			displayName: challengerProfile?.displayName ?? 'Challenger',
			avatarUrl: challengerProfile?.avatarUrl ?? null,
			rating: computeRating(challengerStats.wins, challengerStats.losses, challengerStats.streak),
			role: 'challenger' as const,
		},
	};
};

export const getLadderOverview = (userId: string): LadderOverview => {
	const queueState = buildQueueState(userId, false);
	const queueLineup = buildQueueLineup(userId);
	const yourStats = getUserStats(userId);
	const { entries: leaderboardEntries, yourRank } = buildLeaderboard(userId);
	const recentMatches = buildRecentMatches(userId);
	const currentMatch = buildCurrentMatch();

	const overview = ladderOverviewSchema.parse({
		leaderboard: leaderboardEntries,
		you: {
			rating: computeRating(yourStats.wins, yourStats.losses, yourStats.streak),
			rank: yourRank,
			streak: Math.max(0, yourStats.streak),
		},
		queue: {
			inQueue: queueState.inQueue,
			position: queueState.position,
			estimatedWaitSeconds: queueState.estimatedWaitSeconds,
		},
		queueLineup,
		currentMatch,
		recentMatches,
	});

	return overview;
};

export const onMatchCompleted = (matchId: string, winnerId: string, loserId: string | null): void => {
	if (currentMatchId !== matchId) {
		return;
	}

	currentMatchId = null;

	if (loserId) {
		removeQueueEntry(loserId);
		pushNotification(loserId, 'You were removed from the ranked queue.');
	}

	removeQueueEntry(winnerId);
	ladderQueue.unshift({
		userId: winnerId,
		joinedAt: Date.now(),
	});
	pushNotification(winnerId, 'You have the throne! Waiting to face the next challenger.');

	if (ladderQueue.length > 1) {
		pushNotification(ladderQueue[1].userId, 'Get ready — you are next in line.');
	}

	attemptPairing();
};
