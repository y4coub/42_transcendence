import { getDatabase } from '@infra/db/client';
import type { MatchOutcome } from './aggregator';

export interface LeaderboardRecord {
	userId: string;
	displayName: string;
	avatarUrl: string | null;
	wins: number;
	losses: number;
	streak: number;
	lastResult: MatchOutcome | null;
	updatedAt: string;
	lastMatchAt: string | null;
}

const leaderboardQuery = `
	WITH latest_match AS (
		SELECT
			user_id AS userId,
			MAX(played_at) AS lastMatchAt
		FROM user_recent_matches
		GROUP BY user_id
	)
	SELECT
		us.user_id AS userId,
		u.display_name AS displayName,
		u.avatar_url AS avatarUrl,
		us.wins AS wins,
		us.losses AS losses,
		us.streak AS streak,
		us.last_result AS lastResult,
		STRFTIME('%Y-%m-%dT%H:%M:%fZ', us.updated_at) AS updatedAt,
		STRFTIME('%Y-%m-%dT%H:%M:%fZ', latest_match.lastMatchAt) AS lastMatchAt
	FROM user_stats us
	INNER JOIN users u ON u.id = us.user_id
	LEFT JOIN latest_match ON latest_match.userId = us.user_id
	ORDER BY us.wins DESC, us.losses ASC, us.updated_at DESC
	LIMIT @limit
	`;

export const listLeaderboard = (limit: number): LeaderboardRecord[] => {
	const db = getDatabase();
	const rows = db.prepare(leaderboardQuery).all({ limit }) as Record<string, unknown>[];

	return rows.map((row) => {
		const wins = Number(row.wins ?? 0);
		const losses = Number(row.losses ?? 0);
		const streak = Number(row.streak ?? 0);

		return {
			userId: String(row.userId),
			displayName: String(row.displayName),
			avatarUrl: (row.avatarUrl as string | null) ?? null,
			wins: Number.isFinite(wins) ? wins : 0,
			losses: Number.isFinite(losses) ? losses : 0,
			streak: Number.isFinite(streak) ? streak : 0,
			lastResult: (row.lastResult as MatchOutcome | null) ?? null,
			updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : new Date().toISOString(),
			lastMatchAt: typeof row.lastMatchAt === 'string' ? row.lastMatchAt : null,
		};
	});
};
