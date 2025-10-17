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
