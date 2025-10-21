import { z } from 'zod';

export const ladderPlayerSchema = z.object({
	userId: z.string().uuid(),
	displayName: z.string(),
	avatarUrl: z.string().url().nullable().optional(),
	rating: z.number(),
	rank: z.number().int().positive(),
	streak: z.number().int().nonnegative(),
});

const ladderMatchParticipantSchema = z.object({
	userId: z.string().uuid(),
	displayName: z.string(),
	avatarUrl: z.string().url().nullable().optional(),
	rating: z.number(),
	role: z.enum(['champion', 'challenger']),
});

export const ladderQueueEntrySchema = z.object({
	userId: z.string().uuid(),
	displayName: z.string(),
	avatarUrl: z.string().url().nullable().optional(),
	position: z.number().int().positive(),
	joinedAt: z.string(),
	isYou: z.boolean(),
});

export const ladderMatchSchema = z.object({
	matchId: z.string().uuid(),
	startedAt: z.string(),
	status: z.enum(['waiting', 'countdown', 'playing']),
	champion: ladderMatchParticipantSchema,
	challenger: ladderMatchParticipantSchema,
});

export const ladderRecentMatchSchema = z.object({
	matchId: z.string(),
	opponentDisplayName: z.string(),
	opponentRating: z.number(),
	result: z.enum(['win', 'loss']),
	score: z.string(),
	playedAt: z.string(),
});

export const ladderOverviewSchema = z.object({
	leaderboard: z.array(ladderPlayerSchema),
	you: z
		.object({
			rating: z.number(),
			rank: z.number().int().positive().nullable(),
			streak: z.number().int().nonnegative(),
		})
		.optional(),
	queue: z.object({
		inQueue: z.boolean(),
		position: z.number().int().positive().nullable(),
		estimatedWaitSeconds: z.number().int().nonnegative().nullable(),
	}),
	queueLineup: z.array(ladderQueueEntrySchema),
	currentMatch: ladderMatchSchema.nullable(),
	recentMatches: z.array(ladderRecentMatchSchema),
});

export type LadderOverview = z.infer<typeof ladderOverviewSchema>;

export const ladderQueueStateSchema = z.object({
	inQueue: z.boolean(),
	position: z.number().int().positive().nullable(),
	estimatedWaitSeconds: z.number().int().nonnegative().nullable(),
	matchmakingMessage: z.string(),
});

export type LadderQueueState = z.infer<typeof ladderQueueStateSchema>;
