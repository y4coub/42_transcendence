import { getDatabase } from '@infra/db/client';
import { getPlayerById } from '@tournament/repository';
import type { TournamentMatch } from '@tournament/schemas';

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

interface MatchRow {
	matchId: string;
	tournamentId: string;
	p1Id: string;
	p2Id: string;
	winnerId: string | null;
	p1Score: number;
	p2Score: number;
	completedAt: string;
	p1UserId: string | null;
	p2UserId: string | null;
}

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
		m.tournament_id AS tournamentId,
		m.p1_id AS p1Id,
		m.p2_id AS p2Id,
		m.winner_id AS winnerId,
		m.p1_score AS p1Score,
		m.p2_score AS p2Score,
		STRFTIME('%Y-%m-%dT%H:%M:%fZ', m.completed_at) AS completedAt,
		p1.user_id AS p1UserId,
		p2.user_id AS p2UserId
	FROM tournament_matches m
	INNER JOIN tournament_players p1 ON p1.id = m.p1_id
	INNER JOIN tournament_players p2 ON p2.id = m.p2_id
	WHERE m.status = 'completed'
		AND m.completed_at IS NOT NULL
		AND m.p1_score IS NOT NULL
		AND m.p2_score IS NOT NULL
		AND (p1.user_id = @userId OR p2.user_id = @userId)
	ORDER BY m.completed_at ASC, m.id ASC
`;

const buildRecentId = (userId: string, matchId: string) => {
	return `${userId}:${matchId}`;
};

const mapMatchRows = (db: SQLiteDatabase, userId: string): MatchPerspective[] => {
	const rows = db.prepare(selectMatchesForUser).all({ userId }) as MatchRow[];
	const matches: MatchPerspective[] = [];

	for (const row of rows) {
		const isP1 = row.p1UserId === userId;
		const isP2 = !isP1 && row.p2UserId === userId;
		if (!isP1 && !isP2) {
			continue;
		}

		const playerId = isP1 ? row.p1Id : row.p2Id;
		const opponentId = isP1 ? row.p2UserId : row.p1UserId;
		const selfScore = isP1 ? row.p1Score : row.p2Score;
		const opponentScore = isP1 ? row.p2Score : row.p1Score;
		const resolvedOutcome: MatchOutcome = row.winnerId === playerId ? 'win' : 'loss';
		const playedAt = row.completedAt ?? new Date().toISOString();

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

	for (const record of recent) {
		insert.run({
			id: buildRecentId(userId, record.matchId),
			user_id: userId,
			opponent_user_id: record.opponentId ?? null,
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
		let streak = 0;
		let lastResult: MatchOutcome | null = null;

		for (const match of matches) {
			if (match.outcome === 'win') {
				wins += 1;
				streak = lastResult === 'win' ? streak + 1 : 1;
			} else {
				losses += 1;
				streak = lastResult === 'loss' ? streak - 1 : -1;
			}
			lastResult = match.outcome;
		}

		if (lastResult === null) {
			streak = 0;
		}

		const recent = persistRecentMatches(db, userId, matches).map((match) => ({
			matchId: match.matchId,
			opponentId: match.opponentId,
			p1Score: match.selfScore,
			p2Score: match.opponentScore,
			outcome: match.outcome,
			ts: match.playedAt,
		}));

		persistAggregates(db, userId, wins, losses, streak, lastResult);

		return {
			userId,
			wins,
			losses,
			streak,
			lastResult,
			recent,
		};
	})();
};

export const processMatchResult = (match: TournamentMatch): UserStatsSnapshot[] => {
	if (match.status !== 'completed' || match.p1Score === null || match.p2Score === null) {
		return [];
	}

	const snapshots: UserStatsSnapshot[] = [];
	const seen = new Set<string>();

	const p1 = getPlayerById(match.p1Id);
	if (p1?.userId) {
		seen.add(p1.userId);
		const snapshot = rebuildUserStats(p1.userId);
		snapshots.push(snapshot);
	}

	const p2 = getPlayerById(match.p2Id);
	if (p2?.userId && !seen.has(p2.userId)) {
		const snapshot = rebuildUserStats(p2.userId);
		snapshots.push(snapshot);
	}

	return snapshots;
};
