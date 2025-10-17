import { rebuildUserStats } from '@stats/aggregator';

import {
	getUserProfile,
	getUserStats,
	listRecentMatches,
	updateUserProfile,
	type UpdateUserProfileInput,
} from './repository';
import {
	userProfileSchema,
	userProfileUpdateSchema,
	userStatsSchema,
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

	const payload: UpdateUserProfileInput = parsed.data;
	const record = updateUserProfile(targetUserId, payload);
	if (!record) {
		throw new ProfileServiceError('USER_NOT_FOUND', 'User profile not found');
	}

	return userProfileSchema.parse({
		userId: record.id,
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
