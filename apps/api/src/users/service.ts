import { rebuildUserStats } from '@stats/aggregator';

import {
	getUserProfile,
	getUserStats,
	listRecentMatches,
	updateUserProfile,
	listOnlineUsers,
	type UpdateUserProfileInput,
	type OnlineUserRecord,
} from './repository';
import {
	userProfileSchema,
	userProfileUpdateSchema,
	userStatsSchema,
	onlineUsersResponseSchema,
	type UserProfileResponse,
	type UserStatsResponse,
} from './schemas';

export type ProfileServiceErrorCode = 'USER_NOT_FOUND' | 'FORBIDDEN' | 'INVALID_PAYLOAD';

export class ProfileServiceError extends Error {
	constructor(public readonly code: ProfileServiceErrorCode, message: string) {
		super(message);
		this.name = 'ProfileServiceError';
	}
}

export type PublicProfile = UserProfileResponse;

export type UserStatsSummary = UserStatsResponse;

export const loadUserProfile = (userId: string): PublicProfile => {
	const record = getUserProfile(userId);
	if (!record) {
		throw new ProfileServiceError('USER_NOT_FOUND', 'User profile not found');
	}

	return userProfileSchema.parse({
		userId: record.id,
		email: record.email,
		displayName: record.displayName,
		avatarUrl: record.avatarUrl,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	});
};

export const updateProfile = (
	actorUserId: string,
	targetUserId: string,
	updates: Record<string, unknown>,
): PublicProfile => {
	if (actorUserId !== targetUserId) {
		throw new ProfileServiceError('FORBIDDEN', 'You may only update your own profile');
	}

	const parsed = userProfileUpdateSchema.safeParse(updates);
	if (!parsed.success) {
		throw new ProfileServiceError('INVALID_PAYLOAD', parsed.error.errors[0]?.message ?? 'Invalid payload');
	}

	const payload: UpdateUserProfileInput = {
		displayName: parsed.data.displayName,
		avatarUrl: parsed.data.avatarUrl,
		email: parsed.data.email ? parsed.data.email.trim().toLowerCase() : undefined,
	};
	let record: ReturnType<typeof updateUserProfile> | null = null;
	try {
		record = updateUserProfile(targetUserId, payload);
	} catch (error) {
		if (error instanceof Error && /UNIQUE constraint failed: users\.email/.test(error.message)) {
			throw new ProfileServiceError('INVALID_PAYLOAD', 'Email address already in use');
		}
		throw error;
	}
	if (!record) {
		throw new ProfileServiceError('USER_NOT_FOUND', 'User profile not found');
	}

	return userProfileSchema.parse({
		userId: record.id,
		email: record.email,
		displayName: record.displayName,
		avatarUrl: record.avatarUrl,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	});
};

export interface LoadStatsOptions {
	refresh?: boolean;
	limit?: number;
}

export const loadUserStats = (userId: string, options: LoadStatsOptions = {}): UserStatsSummary => {
	const profile = getUserProfile(userId);
	if (!profile) {
		throw new ProfileServiceError('USER_NOT_FOUND', 'User profile not found');
	}

	if (options.refresh) {
		rebuildUserStats(userId);
	}

	const stats = getUserStats(userId);
	const recent = listRecentMatches(userId, options.limit ?? 10);

	return userStatsSchema.parse({
		userId: stats.userId,
		wins: stats.wins,
		losses: stats.losses,
		streak: stats.streak,
		lastResult: stats.lastResult,
		updatedAt: stats.updatedAt,
		recent: recent.map((match) => ({
			matchId: match.matchId,
			opponentId: match.opponentId,
			p1Score: match.p1Score,
			p2Score: match.p2Score,
			outcome: match.outcome,
			ts: match.ts,
		})),
	});
};

export const loadOnlineUsers = (excludeUserId?: string) => {
	const players = listOnlineUsers(excludeUserId);

	return onlineUsersResponseSchema.parse({
		players: players.map((player: OnlineUserRecord) => ({
			userId: player.userId,
			displayName: player.displayName,
			avatarUrl: player.avatarUrl,
			elo: player.elo,
			status: player.status,
		})),
		total: players.length,
	});
};
