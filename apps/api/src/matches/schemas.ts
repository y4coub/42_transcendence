import { z } from 'zod';

import {
	tournamentIdSchema,
	tournamentMatchIdSchema,
	tournamentMatchStatusSchema,
	tournamentOpponentSchema,
	tournamentPlayerIdSchema,
	tournamentResultSchema,
	tournamentOkSchema,
} from '@tournament/schemas';

export const matchCreateSchema = z.object({
	tournamentId: tournamentIdSchema.optional(),
	requesterId: tournamentPlayerIdSchema,
	opponentId: tournamentPlayerIdSchema.optional(),
});

export type MatchCreate = z.infer<typeof matchCreateSchema>;

export const matchCreateResponseSchema = z.object({
	matchId: tournamentMatchIdSchema,
});

export type MatchCreateResponse = z.infer<typeof matchCreateResponseSchema>;

export const matchParticipantSchema = z.object({
	p1: tournamentOpponentSchema,
	p2: tournamentOpponentSchema,
});

export type MatchParticipants = z.infer<typeof matchParticipantSchema>;

export const matchScoreSchema = z.object({
	p1Score: z.number().int().nonnegative(),
	p2Score: z.number().int().nonnegative(),
	winnerId: tournamentPlayerIdSchema.nullable(),
});

export type MatchScore = z.infer<typeof matchScoreSchema>;

export const matchDetailSchema = z.object({
	matchId: tournamentMatchIdSchema,
	tournamentId: tournamentIdSchema,
	status: tournamentMatchStatusSchema,
	startedAt: z.string().datetime().nullable(),
	finishedAt: z.string().datetime().nullable(),
	participants: matchParticipantSchema,
	lastScore: matchScoreSchema.nullable(),
});

export type MatchDetail = z.infer<typeof matchDetailSchema>;

export const matchResultSchema = tournamentResultSchema;

export type MatchResult = z.infer<typeof matchResultSchema>;

export const matchOkSchema = tournamentOkSchema;

export type MatchOk = z.infer<typeof matchOkSchema>;

export const matchStatePayloadSchema = z.record(z.unknown()).refine(
	(value) => typeof value === 'object' && value !== null,
	'State payload must be an object',
);