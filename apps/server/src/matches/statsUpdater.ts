import { randomUUID } from 'crypto';

import { getDatabase } from '@infra/db/client';
import type { MatchOutcome } from '@stats/aggregator';

const RECENT_LIMIT = 10;

interface PlayerStatsRow {
	wins: number;
	losses: number;
	streak: number;
	lastResult: MatchOutcome | null;
}

interface PlayerUpdatePayload {
	userId: string;
	opponentId: string | null;
	matchId: string;
	selfScore: number;
	opponentScore: number;
	outcome: MatchOutcome;
}

export interface MultiplayerResultPayload {
	matchId: string;
	p1Id: string;
	p2Id: string;
	winnerId: string;
	p1Score: number;
	p2Score: number;
}

export interface PracticeResultPayload {
	userId: string;
	playerScore: number;
	botScore: number;
	outcome: MatchOutcome;
}

const fetchPlayerStats = (userId: string): PlayerStatsRow => {
	const db = getDatabase();
	const row = db
		.prepare(`
			SELECT wins, losses, streak, last_result AS lastResult
			FROM user_stats
			WHERE user_id = ?
		`)
		.get(userId) as PlayerStatsRow | undefined;

	if (!row) {
		return { wins: 0, losses: 0, streak: 0, lastResult: null };
	}

	const normalized: PlayerStatsRow = {
		wins: Number(row.wins) || 0,
		losses: Number(row.losses) || 0,
		streak: Math.max(0, Math.abs(Number(row.streak) || 0)),
		lastResult: row.lastResult ?? null,
	};

	if (normalized.lastResult !== 'win') {
		normalized.streak = 0;
	}

	return normalized;
};

const resolveOpponentUserId = (db: ReturnType<typeof getDatabase>, opponentId: string | null | undefined): string | null => {
	if (!opponentId) {
		return null;
	}
	const row = db.prepare('SELECT 1 FROM users WHERE id = ?').get(opponentId);
	return row ? opponentId : null;
};

const persistPlayerStats = (payload: PlayerUpdatePayload): void => {
	const db = getDatabase();
	const current = fetchPlayerStats(payload.userId);

	let wins = current.wins;
	let losses = current.losses;
	let streak = current.streak;
	let lastResult = current.lastResult;

	if (payload.outcome === 'win') {
		wins += 1;
		streak = lastResult === 'win' ? streak + 1 : 1;
		lastResult = 'win';
	} else {
		losses += 1;
		streak = 0;
		lastResult = 'loss';
	}

	db.prepare(`
		INSERT INTO user_stats (user_id, wins, losses, streak, last_result, updated_at)
		VALUES (@user_id, @wins, @losses, @streak, @last_result, datetime('now'))
		ON CONFLICT(user_id) DO UPDATE SET
			wins = excluded.wins,
			losses = excluded.losses,
			streak = excluded.streak,
			last_result = excluded.last_result,
			updated_at = datetime('now')
	`).run({
		user_id: payload.userId,
		wins,
		losses,
		streak,
		last_result: lastResult,
	});

	db.prepare(`
		DELETE FROM user_recent_matches
		WHERE user_id = @user_id
		  AND match_id = @match_id
	`).run({
		user_id: payload.userId,
		match_id: payload.matchId,
	});

	const opponentUserId = resolveOpponentUserId(db, payload.opponentId);

	db.prepare(`
		INSERT INTO user_recent_matches (
			id,
			user_id,
			opponent_user_id,
			match_id,
			p1_score,
			p2_score,
			outcome,
			played_at
		) VALUES (
			@id,
			@user_id,
			@opponent_user_id,
			@match_id,
			@p1_score,
			@p2_score,
			@outcome,
			datetime('now')
		)
	`).run({
		id: `${payload.userId}:${payload.matchId}`,
		user_id: payload.userId,
		opponent_user_id: opponentUserId,
		match_id: payload.matchId,
		p1_score: payload.selfScore,
		p2_score: payload.opponentScore,
		outcome: payload.outcome,
	});

	db.prepare(`
		DELETE FROM user_recent_matches
		WHERE user_id = @user_id
		  AND id NOT IN (
				SELECT id
				FROM user_recent_matches
				WHERE user_id = @user_id
				ORDER BY played_at DESC
				LIMIT @limit
			)
	`).run({
		user_id: payload.userId,
		limit: RECENT_LIMIT,
	});
};

export const applyMultiplayerResult = (payload: MultiplayerResultPayload): void => {
	const db = getDatabase();

	db.transaction(() => {
		const p1Outcome: MatchOutcome = payload.winnerId === payload.p1Id ? 'win' : 'loss';
		const p2Outcome: MatchOutcome = payload.winnerId === payload.p2Id ? 'win' : 'loss';

		persistPlayerStats({
			userId: payload.p1Id,
			opponentId: payload.p2Id,
			matchId: payload.matchId,
			selfScore: payload.p1Score,
			opponentScore: payload.p2Score,
			outcome: p1Outcome,
		});

		persistPlayerStats({
			userId: payload.p2Id,
			opponentId: payload.p1Id,
			matchId: payload.matchId,
			selfScore: payload.p2Score,
			opponentScore: payload.p1Score,
			outcome: p2Outcome,
		});
	})();
};

export const applyPracticeResult = (payload: PracticeResultPayload): string => {
	const db = getDatabase();
	const matchId = `practice-${randomUUID()}`;

	db.transaction(() => {
		persistPlayerStats({
			userId: payload.userId,
			opponentId: null,
			matchId,
			selfScore: payload.playerScore,
			opponentScore: payload.botScore,
			outcome: payload.outcome,
		});
	})();

	return matchId;
};
