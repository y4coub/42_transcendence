import { rebuildUserStats } from '@stats/aggregator';
import { isDisplayNameTaken } from '@auth/repository';

import {
	getUserProfile,
	getUserStats,
	listRecentMatches,
	updateUserProfile,
	listOnlineUsers,
	listFriends,
	listIncomingFriendRequests,
	listOutgoingFriendRequests,
	createFriendRequest,
	acceptFriendRequest as repositoryAcceptFriendRequest,
	declineFriendRequest as repositoryDeclineFriendRequest,
	cancelFriendRequest as repositoryCancelFriendRequest,
	searchUsers as repositorySearchUsers,
	type UpdateUserProfileInput,
	type OnlineUserRecord,
	type FriendSummaryRecord,
	type FriendRequestView,
} from './repository';
import {
	userProfileSchema,
	userProfileUpdateSchema,
	userStatsSchema,
	onlineUsersResponseSchema,
	friendListSchema,
	friendRequestsResponseSchema,
	userSearchResponseSchema,
	type UserProfileResponse,
	type UserStatsResponse,
} from './schemas';

export type ProfileServiceErrorCode = 'USER_NOT_FOUND' | 'FORBIDDEN' | 'INVALID_PAYLOAD' | 'DISPLAY_NAME_TAKEN';

export class ProfileServiceError extends Error {
	constructor(public readonly code: ProfileServiceErrorCode, message: string) {
		super(message);
		this.name = 'ProfileServiceError';
	}
}

export type PublicProfile = UserProfileResponse;

export type UserStatsSummary = UserStatsResponse;

export type FriendServiceErrorCode = 'FRIEND_SELF' | 'FRIEND_ALREADY' | 'FRIEND_INCOMING_PENDING' | 'FRIEND_REQUEST_EXISTS' | 'FRIEND_REQUEST_NOT_FOUND';

export class FriendServiceError extends Error {
	constructor(public readonly code: FriendServiceErrorCode, message: string) {
		super(message);
		this.name = 'FriendServiceError';
	}
}

const mapFriendRepositoryError = (error: unknown): never => {
	if (error instanceof Error) {
		switch (error.message) {
			case 'FRIEND_SELF':
				throw new FriendServiceError('FRIEND_SELF', 'You cannot send a friend request to yourself.');
			case 'FRIEND_ALREADY':
				throw new FriendServiceError('FRIEND_ALREADY', 'You are already friends with this player.');
			case 'FRIEND_INCOMING_PENDING':
				throw new FriendServiceError('FRIEND_INCOMING_PENDING', 'You already have a pending request from this player.');
			case 'FRIEND_REQUEST_EXISTS':
				throw new FriendServiceError('FRIEND_REQUEST_EXISTS', 'Friend request already pending.');
			case 'FRIEND_REQUEST_NOT_FOUND':
			case 'FRIEND_REQUEST_NOT_PENDING':
				throw new FriendServiceError('FRIEND_REQUEST_NOT_FOUND', 'Friend request not found or no longer actionable.');
			default:
				break;
		}
	}
	throw error;
};

const displayNamesEqual = (a: string, b: string): boolean =>
	a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();


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

	const current = getUserProfile(targetUserId);
	if (!current) {
		throw new ProfileServiceError('USER_NOT_FOUND', 'User profile not found');
	}

	const payload: UpdateUserProfileInput = {
		displayName: parsed.data.displayName,
		avatarUrl: parsed.data.avatarUrl,
		email: parsed.data.email ? parsed.data.email.trim().toLowerCase() : undefined,
	};

	if (payload.displayName && !displayNamesEqual(payload.displayName, current.displayName)) {
		if (isDisplayNameTaken(payload.displayName, targetUserId)) {
			throw new ProfileServiceError('DISPLAY_NAME_TAKEN', 'Display name already in use');
		}
	}

	let record: ReturnType<typeof updateUserProfile> | null = null;
	try {
		record = updateUserProfile(targetUserId, payload);
	} catch (error) {
		if (error instanceof Error && /UNIQUE constraint failed: users\.email/.test(error.message)) {
			throw new ProfileServiceError('INVALID_PAYLOAD', 'Email address already in use');
		}
		if (error instanceof Error && /UNIQUE constraint failed: users\.display_name/.test(error.message)) {
			throw new ProfileServiceError('DISPLAY_NAME_TAKEN', 'Display name already in use');
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

export const loadOnlineUsers = (userId: string) => {
	const players = listOnlineUsers(userId);

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

export const loadFriendList = (userId: string) => {
	const friends = listFriends(userId);
	return friendListSchema.parse({
		friends: friends.map((friend: FriendSummaryRecord) => ({
			userId: friend.userId,
			displayName: friend.displayName,
			avatarUrl: friend.avatarUrl,
			status: friend.status,
		})),
	});
};

export const loadFriendRequests = (userId: string) => {
	const incoming = listIncomingFriendRequests(userId);
	const outgoing = listOutgoingFriendRequests(userId);

	return friendRequestsResponseSchema.parse({
		incoming: incoming.map((request: FriendRequestView) => ({
			requestId: request.requestId,
			userId: request.userId,
			displayName: request.displayName,
			avatarUrl: request.avatarUrl,
			createdAt: request.createdAt,
		})),
		outgoing: outgoing.map((request: FriendRequestView) => ({
			requestId: request.requestId,
			userId: request.userId,
			displayName: request.displayName,
			avatarUrl: request.avatarUrl,
			createdAt: request.createdAt,
		})),
	});
};

export interface SearchUsersOptions {
	limit?: number;
}

export const searchUsers = (viewerId: string, query: string, options: SearchUsersOptions = {}) => {
	const trimmed = query.trim();
	if (trimmed.length < 2) {
		return userSearchResponseSchema.parse({ results: [] });
	}

	const boundedLimit = Math.min(Math.max(options.limit ?? 10, 1), 25);
	const results = repositorySearchUsers(viewerId, trimmed, boundedLimit);

	return userSearchResponseSchema.parse({
		results: results.map((result) => ({
			userId: result.userId,
			displayName: result.displayName,
			avatarUrl: result.avatarUrl,
			relationship: result.relationship,
		})),
	});
};

export const sendFriendRequest = (actorId: string, targetId: string): string => {
	try {
		return createFriendRequest(actorId, targetId);
	} catch (error) {
		mapFriendRepositoryError(error);
		throw error instanceof Error ? error : new Error('Failed to send friend request.');
	}
};

export const acceptFriendRequest = (actorId: string, requestId: string): void => {
	try {
		repositoryAcceptFriendRequest(requestId, actorId);
	} catch (error) {
		mapFriendRepositoryError(error);
	}
};

export const declineFriendRequest = (actorId: string, requestId: string): void => {
	try {
		repositoryDeclineFriendRequest(requestId, actorId);
	} catch (error) {
		mapFriendRepositoryError(error);
	}
};

export const cancelFriendRequest = (actorId: string, requestId: string): void => {
	try {
		repositoryCancelFriendRequest(requestId, actorId);
	} catch (error) {
		mapFriendRepositoryError(error);
	}
};
