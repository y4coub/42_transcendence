import { randomUUID } from 'node:crypto';
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


const normalizeFriendPair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

const friendshipExists = (userIdA: string, userIdB: string): boolean => {
	const db = getDatabase();
	const [userA, userB] = normalizeFriendPair(userIdA, userIdB);
	const row = db.prepare(`SELECT 1 FROM friendships WHERE user_a_id = ? AND user_b_id = ?`).get(userA, userB) as { 1: number } | undefined;
	return Boolean(row);
};

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
		streak: ((row.lastResult as MatchOutcome | null) ?? null) === 'win'
			? Math.max(0, Number(row.streak) || 0)
			: 0,
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
		opponentId: typeof row.opponentId === 'string' && row.opponentId.trim().length > 0
			? (row.opponentId as string)
			: null,
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

export interface FriendSummaryRecord {
	userId: string;
	displayName: string;
	avatarUrl: string | null;
	status: 'offline' | 'online' | 'in-game';
}

export interface FriendRequestView {
	requestId: string;
	userId: string;
	displayName: string;
	avatarUrl: string | null;
	createdAt: string;
}

export interface UserSearchRecord {
	userId: string;
	displayName: string;
	avatarUrl: string | null;
	relationship: 'self' | 'friend' | 'incoming-request' | 'outgoing-request' | 'none';
}

export const listOnlineUsers = (viewerId: string): OnlineUserRecord[] => {
	const db = getDatabase();
	const now = Date.now();

	// Only include players who have an active session and an accepted friendship with the viewer.
	const rows = db
		.prepare(
			`
		SELECT DISTINCT
			u.id AS userId,
			u.display_name AS displayName,
			u.avatar_url AS avatarUrl,
			COALESCE(1000 + (us.wins * 25) - (us.losses * 20), 1000) AS elo,
			CASE
				WHEN EXISTS (
					SELECT 1
					FROM matches m
					WHERE (m.p1Id = u.id OR m.p2Id = u.id)
						AND m.state IN ('playing', 'countdown', 'paused')
				) THEN 'in-game'
				ELSE 'online'
			END AS status
		FROM users u
		INNER JOIN sessions s ON u.id = s.user_id
		LEFT JOIN user_stats us ON u.id = us.user_id
		INNER JOIN friendships f ON (
			(f.user_a_id = @viewerId AND f.user_b_id = u.id)
			OR (f.user_b_id = @viewerId AND f.user_a_id = u.id)
		)
		WHERE s.expires_at > @now
			AND s.revoked_at IS NULL
			AND u.id != @viewerId
		ORDER BY elo DESC, u.display_name ASC
		`,
		)
		.all({ now, viewerId }) as Record<string, unknown>[];

	return rows.map((row) => ({
		userId: row.userId as string,
		displayName: row.displayName as string,
		avatarUrl: (row.avatarUrl as string | null) ?? null,
		elo: typeof row.elo === 'number' ? row.elo : Number(row.elo ?? 1000),
		status: (row.status as 'online' | 'in-game') ?? 'online',
	}));
};

export const listFriends = (userId: string): FriendSummaryRecord[] => {
	const db = getDatabase();
	const now = Date.now();
	const rows = db.prepare(`
		SELECT
			friend.id AS friendId,
			friend.display_name AS displayName,
			friend.avatar_url AS avatarUrl,
			CASE
				WHEN EXISTS (
					SELECT 1
					FROM matches m
					WHERE (m.p1Id = friend.id OR m.p2Id = friend.id)
						AND m.state IN ('playing', 'countdown', 'paused')
				) THEN 'in-game'
				WHEN EXISTS (
					SELECT 1
					FROM sessions s
					WHERE s.user_id = friend.id
						AND s.expires_at > @now
						AND s.revoked_at IS NULL
				) THEN 'online'
				ELSE 'offline'
			END AS status
		FROM friendships f
		JOIN users friend ON friend.id = CASE
			WHEN f.user_a_id = @userId THEN f.user_b_id
			ELSE f.user_a_id
		END
		WHERE f.user_a_id = @userId OR f.user_b_id = @userId
		ORDER BY friend.display_name ASC
	`).all({ userId, now }) as Array<Record<string, unknown>>;

	return rows.map((row) => ({
		userId: row.friendId as string,
		displayName: row.displayName as string,
		avatarUrl: (row.avatarUrl as string | null) ?? null,
		status: (row.status as 'offline' | 'online' | 'in-game') ?? 'offline',
	}));
};

export const listIncomingFriendRequests = (userId: string): FriendRequestView[] => {
	const db = getDatabase();
	const rows = db.prepare(`
		SELECT
			fr.id AS requestId,
			fr.created_at AS createdAt,
			u.id AS userId,
			u.display_name AS displayName,
			u.avatar_url AS avatarUrl
		FROM friend_requests fr
		JOIN users u ON u.id = fr.requester_id
		WHERE fr.target_id = @userId
			AND fr.status = 'pending'
		ORDER BY fr.created_at ASC
	`).all({ userId }) as Array<Record<string, unknown>>;

	return rows.map((row) => ({
		requestId: row.requestId as string,
		userId: row.userId as string,
		displayName: row.displayName as string,
		avatarUrl: (row.avatarUrl as string | null) ?? null,
		createdAt: row.createdAt as string,
	}));
};

export const listOutgoingFriendRequests = (userId: string): FriendRequestView[] => {
	const db = getDatabase();
	const rows = db.prepare(`
		SELECT
			fr.id AS requestId,
			fr.created_at AS createdAt,
			u.id AS userId,
			u.display_name AS displayName,
			u.avatar_url AS avatarUrl
		FROM friend_requests fr
		JOIN users u ON u.id = fr.target_id
		WHERE fr.requester_id = @userId
			AND fr.status = 'pending'
		ORDER BY fr.created_at ASC
	`).all({ userId }) as Array<Record<string, unknown>>;

	return rows.map((row) => ({
		requestId: row.requestId as string,
		userId: row.userId as string,
		displayName: row.displayName as string,
		avatarUrl: (row.avatarUrl as string | null) ?? null,
		createdAt: row.createdAt as string,
	}));
};

export const searchUsers = (viewerId: string, term: string, limit = 10): UserSearchRecord[] => {
	const db = getDatabase();
	const normalized = term.trim().toLowerCase();
	if (normalized.length === 0) {
		return [];
	}

	const boundedLimit = Math.min(Math.max(limit, 1), 25);
	const likeTerm = `%${normalized}%`;

	const rows = db
		.prepare(
			`
		SELECT
			u.id AS userId,
			u.display_name AS displayName,
			u.avatar_url AS avatarUrl,
			CASE
				WHEN u.id = @viewerId THEN 'self'
				WHEN EXISTS (
					SELECT 1
					FROM friendships f
					WHERE (f.user_a_id = @viewerId AND f.user_b_id = u.id)
						OR (f.user_b_id = @viewerId AND f.user_a_id = u.id)
				) THEN 'friend'
				WHEN EXISTS (
					SELECT 1
					FROM friend_requests fr
					WHERE fr.requester_id = u.id
						AND fr.target_id = @viewerId
						AND fr.status = 'pending'
				) THEN 'incoming-request'
				WHEN EXISTS (
					SELECT 1
					FROM friend_requests fr
					WHERE fr.requester_id = @viewerId
						AND fr.target_id = u.id
						AND fr.status = 'pending'
				) THEN 'outgoing-request'
				ELSE 'none'
			END AS relationship
		FROM users u
		WHERE LOWER(u.display_name) LIKE @term
			OR LOWER(u.email) LIKE @term
		ORDER BY LOWER(u.display_name) ASC
		LIMIT @limit
		`,
		)
		.all({ viewerId, term: likeTerm, limit: boundedLimit }) as Array<Record<string, unknown>>;

	return rows.map((row) => ({
		userId: row.userId as string,
		displayName: row.displayName as string,
		avatarUrl: (row.avatarUrl as string | null) ?? null,
		relationship: (row.relationship as UserSearchRecord['relationship']) ?? 'none',
	}));
};

export const createFriendRequest = (requesterId: string, targetId: string): string => {
	if (requesterId === targetId) {
		throw new Error('FRIEND_SELF');
	}

	const db = getDatabase();
	const [userA, userB] = normalizeFriendPair(requesterId, targetId);
	if (friendshipExists(userA, userB)) {
		throw new Error('FRIEND_ALREADY');
	}

	const incoming = db
		.prepare(`SELECT id, status FROM friend_requests WHERE requester_id = @target AND target_id = @requester`)
		.get({ requester: requesterId, target: targetId }) as { id: string; status: string } | undefined;
	if (incoming && incoming.status === 'pending') {
		throw new Error('FRIEND_INCOMING_PENDING');
	}

	const existing = db
		.prepare(`SELECT id, status FROM friend_requests WHERE requester_id = @requester AND target_id = @target`)
		.get({ requester: requesterId, target: targetId }) as { id: string; status: string } | undefined;
	if (existing) {
		if (existing.status === 'pending') {
			throw new Error('FRIEND_REQUEST_EXISTS');
		}
		db.prepare(
			`UPDATE friend_requests SET status = 'pending', created_at = datetime('now'), responded_at = NULL WHERE id = @id`,
		).run({ id: existing.id });
		return existing.id;
	}

	const id = randomUUID();
	db.prepare(`INSERT INTO friend_requests (id, requester_id, target_id) VALUES (@id, @requester, @target)`).run({
		id,
		requester: requesterId,
		target: targetId,
	});
	return id;
};

export const acceptFriendRequest = (requestId: string, actorId: string): void => {
	const db = getDatabase();
	const request = db
		.prepare(`SELECT requester_id, target_id, status FROM friend_requests WHERE id = @id`)
		.get({ id: requestId }) as { requester_id: string; target_id: string; status: string } | undefined;

	if (!request || request.target_id !== actorId) {
		throw new Error('FRIEND_REQUEST_NOT_FOUND');
	}
	if (request.status !== 'pending') {
		throw new Error('FRIEND_REQUEST_NOT_PENDING');
	}

	const [userA, userB] = normalizeFriendPair(request.requester_id, request.target_id);

	db.transaction(() => {
		db.prepare(`INSERT OR IGNORE INTO friendships (id, user_a_id, user_b_id) VALUES (@id, @userA, @userB)`).run({
			id: randomUUID(),
			userA,
			userB,
		});
		db.prepare(`UPDATE friend_requests SET status = 'accepted', responded_at = datetime('now') WHERE id = @id`).run({
			id: requestId,
		});
	})();
};

export const declineFriendRequest = (requestId: string, actorId: string): void => {
	const db = getDatabase();
	const request = db
		.prepare(`SELECT requester_id, target_id, status FROM friend_requests WHERE id = @id`)
		.get({ id: requestId }) as { requester_id: string; target_id: string; status: string } | undefined;

	if (!request || request.target_id !== actorId) {
		throw new Error('FRIEND_REQUEST_NOT_FOUND');
	}
	if (request.status !== 'pending') {
		throw new Error('FRIEND_REQUEST_NOT_PENDING');
	}

	db.prepare(`UPDATE friend_requests SET status = 'declined', responded_at = datetime('now') WHERE id = @id`).run({
		id: requestId,
	});
};

export const cancelFriendRequest = (requestId: string, actorId: string): void => {
	const db = getDatabase();
	const request = db
		.prepare(`SELECT requester_id, status FROM friend_requests WHERE id = @id`)
		.get({ id: requestId }) as { requester_id: string; status: string } | undefined;

	if (!request || request.requester_id !== actorId) {
		throw new Error('FRIEND_REQUEST_NOT_FOUND');
	}
	if (request.status !== 'pending') {
		throw new Error('FRIEND_REQUEST_NOT_PENDING');
	}

	db.prepare(`UPDATE friend_requests SET status = 'cancelled', responded_at = datetime('now') WHERE id = @id`).run({ id: requestId });
};
