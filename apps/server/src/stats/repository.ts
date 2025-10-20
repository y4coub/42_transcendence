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

export interface RecentMatchRecord {
	matchId: string;
	playedAt: string;
	p1Score: number;
	p2Score: number;
	winnerId: string;
	loserId: string;
	winnerDisplayName: string;
	loserDisplayName: string;
	winnerAvatarUrl: string | null;
	loserAvatarUrl: string | null;
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

const sanitizeDisplayName = (value: unknown): string => {
	if (typeof value !== 'string') {
		return 'Player';
	}
	const decomposed = value.normalize('NFKD').replace(/[\u0300-\u036f]/gu, '');
	const sanitized = decomposed.replace(/[^A-Za-z0-9 _-]+/gu, ' ').replace(/\s+/gu, ' ').trim();
	return sanitized.length > 0 ? sanitized.slice(0, 32) : 'Player';
};

export const listLeaderboard = (limit: number): LeaderboardRecord[] => {
	const db = getDatabase();
	const rows = db.prepare(leaderboardQuery).all({ limit }) as Record<string, unknown>[];

	return rows.map((row) => {
		const wins = Number(row.wins ?? 0);
		const losses = Number(row.losses ?? 0);
		const lastResult = (row.lastResult as MatchOutcome | null) ?? null;
		const streakRaw = Number(row.streak ?? 0);
		const streak =
			lastResult === 'win' && Number.isFinite(streakRaw) ? Math.max(0, streakRaw) : 0;

		return {
			userId: String(row.userId),
			displayName: sanitizeDisplayName(row.displayName),
			avatarUrl: (row.avatarUrl as string | null) ?? null,
			wins: Number.isFinite(wins) ? wins : 0,
			losses: Number.isFinite(losses) ? losses : 0,
			streak,
			lastResult,
			updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : new Date().toISOString(),
			lastMatchAt: typeof row.lastMatchAt === 'string' ? row.lastMatchAt : null,
		};
	});
};

const recentMatchesQuery = `
	SELECT
		m.id AS matchId,
		STRFTIME('%Y-%m-%dT%H:%M:%fZ', m.endedAt) AS playedAt,
		m.p1Id AS p1Id,
		m.p2Id AS p2Id,
		m.p1Score AS p1Score,
		m.p2Score AS p2Score,
		m.winnerId AS winnerId,
		CASE WHEN m.winnerId = m.p1Id THEN m.p2Id ELSE m.p1Id END AS loserId,
		COALESCE(u1.display_name, 'Player') AS winnerDisplayName,
		COALESCE(u2.display_name, 'Player') AS loserDisplayName,
		u1.avatar_url AS winnerAvatarUrl,
		u2.avatar_url AS loserAvatarUrl
	FROM matches m
	LEFT JOIN users u1 ON u1.id = m.winnerId
	LEFT JOIN users u2 ON u2.id = CASE WHEN m.winnerId = m.p1Id THEN m.p2Id ELSE m.p1Id END
	WHERE m.state = 'ended'
	ORDER BY m.endedAt DESC
	LIMIT @limit
`;

export const listRecentMatches = (limit: number): RecentMatchRecord[] => {
	const db = getDatabase();
	const rows = db.prepare(recentMatchesQuery).all({ limit }) as Record<string, unknown>[];

	return rows.map((row) => ({
		matchId: String(row.matchId),
		playedAt: typeof row.playedAt === 'string' ? row.playedAt : new Date().toISOString(),
		p1Score: Number(row.p1Score ?? 0),
		p2Score: Number(row.p2Score ?? 0),
		winnerId: String(row.winnerId ?? ''),
		loserId: String(row.loserId ?? ''),
		winnerDisplayName: sanitizeDisplayName(row.winnerDisplayName ?? 'Player'),
		loserDisplayName: sanitizeDisplayName(row.loserDisplayName ?? 'Player'),
		winnerAvatarUrl: typeof row.winnerAvatarUrl === 'string' ? row.winnerAvatarUrl : null,
		loserAvatarUrl: typeof row.loserAvatarUrl === 'string' ? row.loserAvatarUrl : null,
	}));
};
