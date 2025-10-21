import { getDatabase } from '@infra/db/client';
import type { MatchRecord } from '@matches/repository';

export type MatchOutcome = 'win' | 'loss';

export interface RecentMatchSnapshot {
	matchId: string;
	opponentId: string | null;
	p1Score: number;
	p2Score: number;
	outcome: MatchOutcome;
	ts: string;
}

export interface UserStatsSnapshot {
	userId: string;
	wins: number;
	losses: number;
	streak: number;
	lastResult: MatchOutcome | null;
	recent: RecentMatchSnapshot[];
}

const RECENT_MATCH_LIMIT = 10; // Keep a small rolling window in SQLite for quick profile lookups.

interface MatchPerspective {
	matchId: string;
	playedAt: string;
	opponentId: string | null;
	selfScore: number;
	opponentScore: number;
	outcome: MatchOutcome;
}

type SQLiteDatabase = ReturnType<typeof getDatabase>;

const selectMatchesForUser = `
	SELECT
		m.id AS matchId,
		m.p1Id AS p1Id,
		m.p2Id AS p2Id,
		m.winnerId AS winnerId,
		m.p1Score AS p1Score,
		m.p2Score AS p2Score,
		STRFTIME('%Y-%m-%dT%H:%M:%fZ', COALESCE(m.endedAt, m.createdAt)) AS playedAt
	FROM matches m
	WHERE (m.p1Id = @userId OR m.p2Id = @userId)
		AND m.state = 'ended'
	ORDER BY m.endedAt ASC, m.id ASC
`;

const buildRecentId = (userId: string, matchId: string) => {
	return `${userId}:${matchId}`;
};

const mapMatchRows = (db: SQLiteDatabase, userId: string): MatchPerspective[] => {
	const opponentLookup = db.prepare('SELECT 1 FROM users WHERE id = ?');
	const rows = db.prepare(selectMatchesForUser).all({ userId }) as Array<{
		matchId: string;
		p1Id: string;
		p2Id: string;
		winnerId: string | null;
		p1Score: number;
		p2Score: number;
		playedAt: string;
	}>;
	const matches: MatchPerspective[] = [];

	for (const row of rows) {
		const isP1 = row.p1Id === userId;
		const isP2 = !isP1 && row.p2Id === userId;
		if (!isP1 && !isP2) {
			continue;
		}

		const opponentIdRaw = isP1 ? row.p2Id : row.p1Id;
		const opponentExists = opponentIdRaw && opponentLookup.get(opponentIdRaw);
		const opponentId = opponentExists ? opponentIdRaw : null;
		const selfScore = isP1 ? row.p1Score : row.p2Score;
		const opponentScore = isP1 ? row.p2Score : row.p1Score;
		const resolvedOutcome: MatchOutcome = row.winnerId === (isP1 ? row.p1Id : row.p2Id) ? 'win' : 'loss';
		const playedAt = row.playedAt ?? new Date().toISOString();

		matches.push({
			matchId: row.matchId,
			playedAt,
			opponentId,
			selfScore,
			opponentScore,
			outcome: resolvedOutcome,
		});
	}

	return matches;
};

const persistRecentMatches = (db: SQLiteDatabase, userId: string, matches: MatchPerspective[]) => {
	db.prepare(`DELETE FROM user_recent_matches WHERE user_id = ?`).run(userId);

	const recent = matches.slice(-RECENT_MATCH_LIMIT).reverse();
	const insert = db.prepare(`
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
			@played_at
		)
	`);

	const opponentLookup = db.prepare('SELECT 1 FROM users WHERE id = ?');

	for (const record of recent) {
		const opponentId = record.opponentId && opponentLookup.get(record.opponentId) ? record.opponentId : null;
		insert.run({
			id: buildRecentId(userId, record.matchId),
			user_id: userId,
			opponent_user_id: opponentId,
			match_id: record.matchId,
			p1_score: record.selfScore,
			p2_score: record.opponentScore,
			outcome: record.outcome,
			played_at: record.playedAt,
		});
	}

	return recent;
};

const persistAggregates = (
	db: SQLiteDatabase,
	userId: string,
	wins: number,
	losses: number,
	streak: number,
	lastResult: MatchOutcome | null,
) => {
	db.prepare(`
		INSERT INTO user_stats (user_id, wins, losses, streak, last_result, updated_at)
		VALUES (@user_id, @wins, @losses, @streak, @last_result, datetime('now'))
		ON CONFLICT(user_id) DO UPDATE SET
			wins = @wins,
			losses = @losses,
			streak = @streak,
			last_result = @last_result,
			updated_at = datetime('now')
	`).run({
		user_id: userId,
		wins,
		losses,
		streak,
		last_result: lastResult,
	});
};

export const rebuildUserStats = (userId: string): UserStatsSnapshot => {
	const db = getDatabase();

	return db.transaction(() => {
		const matches = mapMatchRows(db, userId);

		let wins = 0;
		let losses = 0;
		let winStreak = 0;
		let lastResult: MatchOutcome | null = null;

		for (const match of matches) {
			if (match.outcome === 'win') {
				wins += 1;
				winStreak = lastResult === 'win' ? winStreak + 1 : 1;
			} else {
				losses += 1;
				winStreak = 0;
			}

			lastResult = match.outcome;
		}

		const normalizedStreak = lastResult === 'win' ? winStreak : 0;

		const recent = persistRecentMatches(db, userId, matches).map((match) => ({
			matchId: match.matchId,
			opponentId: match.opponentId,
			p1Score: match.selfScore,
			p2Score: match.opponentScore,
			outcome: match.outcome,
			ts: match.playedAt,
		}));

		persistAggregates(db, userId, wins, losses, normalizedStreak, lastResult);

		return {
			userId,
			wins,
			losses,
			streak: normalizedStreak,
			lastResult,
			recent,
		};
	})();
};

export const processMatchResult = (match: MatchRecord): UserStatsSnapshot[] => {
	if (match.state !== 'ended' || match.p1Score === null || match.p2Score === null) {
		return [];
	}

	const snapshots: UserStatsSnapshot[] = [];
	const seen = new Set<string>();

	if (match.p1Id && !seen.has(match.p1Id)) {
		seen.add(match.p1Id);
		const snapshot = rebuildUserStats(match.p1Id);
		snapshots.push(snapshot);
	}

	if (match.p2Id && !seen.has(match.p2Id)) {
		const snapshot = rebuildUserStats(match.p2Id);
		snapshots.push(snapshot);
	}

	return snapshots;
};
