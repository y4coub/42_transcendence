import { z } from 'zod';

import {
	matchOutcomeSchema,
	userAvatarUrlSchema,
	userDisplayNameSchema,
	userIdSchema,
} from '@users/schemas';

export const leaderboardQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const leaderboardEntrySchema = z.object({
	rank: z.number().int().positive(),
	userId: userIdSchema,
	displayName: userDisplayNameSchema,
	avatarUrl: userAvatarUrlSchema.nullable(),
	wins: z.number().int().nonnegative(),
	losses: z.number().int().nonnegative(),
	winRate: z.number().min(0).max(1).nullable(),
	currentStreak: z.number().int(),
	lastResult: matchOutcomeSchema.nullable(),
	lastMatchAt: z.string().datetime().nullable(),
	updatedAt: z.string().datetime(),
});

export const leaderboardResponseSchema = z.array(leaderboardEntrySchema);

export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>;
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

export const recentMatchSchema = z.object({
	matchId: z.string()
		.max(64),
	playedAt: z.string().datetime(),
	p1Score: z.number().int().nonnegative(),
	p2Score: z.number().int().nonnegative(),
	winnerId: userIdSchema,
	loserId: userIdSchema,
	winnerName: userDisplayNameSchema,
	loserName: userDisplayNameSchema,
	winnerAvatarUrl: userAvatarUrlSchema.nullable(),
	loserAvatarUrl: userAvatarUrlSchema.nullable(),
});

export const recentMatchesResponseSchema = z.array(recentMatchSchema);

export type RecentMatch = z.infer<typeof recentMatchSchema>;
