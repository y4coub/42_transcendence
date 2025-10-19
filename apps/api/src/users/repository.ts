import { getDatabase } from '@infra/db/client';
import type { MatchOutcome } from '@stats/aggregator';

export interface UserProfileRecord {
	id: string;
	email: string;
	displayName: string;
	avatarUrl: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface UpdateUserProfileInput {
	displayName?: string;
	avatarUrl?: string | null;
	email?: string;
}

export interface UserStatsRecord {
	userId: string;
	wins: number;
	losses: number;
	streak: number;
	lastResult: MatchOutcome | null;
	updatedAt: string;
}

export interface UserRecentMatchRecord {
	matchId: string;
	opponentId: string | null;
	p1Score: number;
	p2Score: number;
	outcome: MatchOutcome;
	ts: string;
}

const profileSelect = `
	SELECT
		id,
		email,
		display_name AS displayName,
		avatar_url AS avatarUrl,
		STRFTIME('%Y-%m-%dT%H:%M:%fZ', created_at) AS createdAt,
		STRFTIME('%Y-%m-%dT%H:%M:%fZ', updated_at) AS updatedAt
	FROM users
`;

const statsSelect = `
	SELECT
		user_id AS userId,
		wins,
		losses,
		streak,
		last_result AS lastResult,
		STRFTIME('%Y-%m-%dT%H:%M:%fZ', updated_at) AS updatedAt
	FROM user_stats
`;

const recentSelect = `
	SELECT
		match_id AS matchId,
		opponent_user_id AS opponentId,
		p1_score AS p1Score,
		p2_score AS p2Score,
		outcome,
		STRFTIME('%Y-%m-%dT%H:%M:%fZ', played_at) AS ts
	FROM user_recent_matches
`;

const buildDefaultStats = (userId: string): UserStatsRecord => ({
	userId,
	wins: 0,
	losses: 0,
	streak: 0,
	lastResult: null,
	updatedAt: new Date().toISOString(),
});

export const getUserProfile = (userId: string): UserProfileRecord | null => {
	const db = getDatabase();
	const row = db.prepare(`${profileSelect} WHERE id = ?`).get(userId) as Record<string, unknown> | undefined;
	if (!row) {
		return null;
	}

	return {
		id: row.id as string,
		email: row.email as string,
		displayName: row.displayName as string,
		avatarUrl: (row.avatarUrl as string | null) ?? null,
		createdAt: row.createdAt as string,
		updatedAt: row.updatedAt as string,
	};
};

export const updateUserProfile = (userId: string, updates: UpdateUserProfileInput): UserProfileRecord | null => {
	const db = getDatabase();
	const existing = getUserProfile(userId);
	if (!existing) {
		return null;
	}

	const fields: string[] = [];
	const params: Record<string, unknown> = { id: userId };

	if (updates.displayName !== undefined) {
		fields.push('display_name = @display_name');
		params.display_name = updates.displayName;
	}

	if (updates.avatarUrl !== undefined) {
		fields.push('avatar_url = @avatar_url');
		params.avatar_url = updates.avatarUrl ?? null;
	}

	if (updates.email !== undefined) {
		fields.push('email = @email');
		params.email = updates.email;
	}

	if (fields.length === 0) {
		return getUserProfile(userId);
	}

	fields.push("updated_at = datetime('now')");
	const assignment = fields.join(', ');

	db.prepare(`UPDATE users SET ${assignment} WHERE id = @id`).run(params);

	return getUserProfile(userId);
};

export const getUserStats = (userId: string): UserStatsRecord => {
	const db = getDatabase();
	const row = db.prepare(`${statsSelect} WHERE user_id = ?`).get(userId) as Record<string, unknown> | undefined;

	if (!row) {
		return buildDefaultStats(userId);
	}

	return {
		userId: row.userId as string,
		wins: Number(row.wins) || 0,
		losses: Number(row.losses) || 0,
		streak: Number(row.streak) || 0,
		lastResult: (row.lastResult as MatchOutcome | null) ?? null,
		updatedAt: (row.updatedAt as string) ?? new Date().toISOString(),
	};
};

export const listRecentMatches = (userId: string, limit = 10): UserRecentMatchRecord[] => {
	const db = getDatabase();
	const rows = db
		.prepare(`${recentSelect} WHERE user_id = @user_id ORDER BY played_at DESC LIMIT @limit`)
		.all({ user_id: userId, limit }) as Record<string, unknown>[];

	return rows.map((row) => ({
		matchId: row.matchId as string,
		opponentId: (row.opponentId as string | null) ?? null,
		p1Score: typeof row.p1Score === 'number' ? (row.p1Score as number) : Number(row.p1Score ?? 0),
		p2Score: typeof row.p2Score === 'number' ? (row.p2Score as number) : Number(row.p2Score ?? 0),
		outcome: row.outcome as MatchOutcome,
		ts: (row.ts as string) ?? new Date().toISOString(),
	}));
};

export interface OnlineUserRecord {
	userId: string;
	displayName: string;
	avatarUrl: string | null;
	elo: number;
	status: 'online' | 'in-game';
}

export const listOnlineUsers = (excludeUserId?: string): OnlineUserRecord[] => {
	const db = getDatabase();
	const now = Date.now();

	// Get users with active sessions (not expired, not revoked)
	// Calculate ELO as 1000 + (wins * 25) - (losses * 20) for ranking purposes
	let query = `
		SELECT DISTINCT
			u.id AS userId,
			u.display_name AS displayName,
			u.avatar_url AS avatarUrl,
			COALESCE(1000 + (us.wins * 25) - (us.losses * 20), 1000) AS elo,
			CASE
				WHEN EXISTS (
					SELECT 1 FROM matches m
					WHERE (m.p1Id = u.id OR m.p2Id = u.id)
					AND m.state IN ('playing', 'countdown', 'paused')
				) THEN 'in-game'
				ELSE 'online'
			END AS status
		FROM users u
		INNER JOIN sessions s ON u.id = s.user_id
		LEFT JOIN user_stats us ON u.id = us.user_id
		WHERE s.expires_at > @now
			AND s.revoked_at IS NULL
	`;

	const params: Record<string, unknown> = { now };

	if (excludeUserId) {
		query += ' AND u.id != @exclude_user_id';
		params.exclude_user_id = excludeUserId;
	}

	query += ' ORDER BY elo DESC, u.display_name ASC';

	const rows = db.prepare(query).all(params) as Record<string, unknown>[];

	return rows.map((row) => ({
		userId: row.userId as string,
		displayName: row.displayName as string,
		avatarUrl: (row.avatarUrl as string | null) ?? null,
		elo: typeof row.elo === 'number' ? row.elo : Number(row.elo ?? 1000),
		status: (row.status as 'online' | 'in-game') ?? 'online',
	}));
};
