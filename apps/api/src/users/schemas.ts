import { z } from 'zod';

import { tournamentMatchIdSchema } from '@tournament/schemas';

export const userIdSchema = z.string().uuid();

export const userDisplayNameSchema = z
	.string()
	.trim()
	.min(3, 'Display name must be at least 3 characters long.')
	.max(32, 'Display name must be at most 32 characters long.')
	.regex(/^[A-Za-z0-9 _\-]+$/, 'Display name may only contain letters, numbers, spaces, underscores, and hyphens.');

export const userAvatarUrlSchema = z.string().url();
export const userEmailSchema = z.string().email();

export const matchOutcomeSchema = z.enum(['win', 'loss']);

export const userProfileSchema = z.object({
	userId: userIdSchema,
	email: userEmailSchema,
	displayName: userDisplayNameSchema,
	avatarUrl: userAvatarUrlSchema.nullable(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

export const userProfileUpdateSchema = z
	.object({
		displayName: userDisplayNameSchema.optional(),
		avatarUrl: userAvatarUrlSchema.nullable().optional(),
		email: userEmailSchema.optional(),
	})
	.refine((value) => Object.keys(value).length > 0, {
		message: 'At least one field is required to update the profile.',
	});

export const userRecentMatchSchema = z.object({
	matchId: tournamentMatchIdSchema,
	opponentId: userIdSchema.nullable(),
	p1Score: z.number().int().nonnegative(),
	p2Score: z.number().int().nonnegative(),
	outcome: matchOutcomeSchema,
	ts: z.string().datetime(),
});

export const userStatsSchema = z.object({
	userId: userIdSchema,
	wins: z.number().int().nonnegative(),
	losses: z.number().int().nonnegative(),
	streak: z.number().int(),
	lastResult: matchOutcomeSchema.nullable(),
	updatedAt: z.string().datetime(),
	recent: z.array(userRecentMatchSchema),
});

export const userParamsSchema = z.object({
	userId: userIdSchema,
});

export const userStatsQuerySchema = z.object({
	refresh: z.coerce.boolean().optional(),
	limit: z.coerce.number().int().positive().max(25).optional(),
});

export const onlinePlayerStatusSchema = z.enum(['online', 'in-game']);

export const onlinePlayerSchema = z.object({
	userId: userIdSchema,
	displayName: userDisplayNameSchema,
	avatarUrl: userAvatarUrlSchema.nullable(),
	elo: z.number().int().nonnegative(),
	status: onlinePlayerStatusSchema,
});

export const onlineUsersResponseSchema = z.object({
	players: z.array(onlinePlayerSchema),
	total: z.number().int().nonnegative(),
});

export type UserProfileResponse = z.infer<typeof userProfileSchema>;
export type UserStatsResponse = z.infer<typeof userStatsSchema>;
export type UserProfileUpdateInput = z.infer<typeof userProfileUpdateSchema>;
export type OnlinePlayerResponse = z.infer<typeof onlinePlayerSchema>;
export type OnlineUsersResponse = z.infer<typeof onlineUsersResponseSchema>;
