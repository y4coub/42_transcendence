import { z } from 'zod';

export const tournamentIdSchema = z.string().uuid();

export const tournamentNameSchema = z
  .string()
  .min(3, 'Tournament name must be at least 3 characters long.')
  .max(80, 'Tournament name must be at most 80 characters long.');

export const tournamentStatusSchema = z.enum(['pending', 'running', 'completed']);

export const tournamentSchema = z.object({
  id: tournamentIdSchema,
  name: tournamentNameSchema,
  status: tournamentStatusSchema,
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});

export type Tournament = z.infer<typeof tournamentSchema>;

export const tournamentCreateSchema = z.object({
  name: tournamentNameSchema,
});

export type TournamentCreate = z.infer<typeof tournamentCreateSchema>;

export const tournamentAliasSchema = z
  .string()
  .min(3, 'Alias must be at least 3 characters long.')
  .max(40, 'Alias must be at most 40 characters long.');

export const tournamentPlayerIdSchema = z.string().uuid();

export const tournamentPlayerSchema = z.object({
  id: tournamentPlayerIdSchema,
  tournamentId: tournamentIdSchema,
  alias: tournamentAliasSchema,
  userId: z.string().uuid().nullable(),
  queuedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type TournamentPlayer = z.infer<typeof tournamentPlayerSchema>;

export const tournamentRegisterSchema = z.object({
  tournamentId: tournamentIdSchema,
  alias: tournamentAliasSchema,
  userId: z.string().uuid().optional(),
});

export type TournamentRegister = z.infer<typeof tournamentRegisterSchema>;

export const tournamentQueueJoinSchema = z.object({
  playerId: tournamentPlayerIdSchema,
});

export type TournamentQueueJoin = z.infer<typeof tournamentQueueJoinSchema>;

export const tournamentQueueLeaveSchema = z.object({
  playerId: tournamentPlayerIdSchema,
});

export type TournamentQueueLeave = z.infer<typeof tournamentQueueLeaveSchema>;

export const tournamentMatchIdSchema = z.string().uuid();

export const tournamentMatchStatusSchema = z.enum(['pending', 'announced', 'completed']);

export const tournamentOpponentSchema = z.object({
  playerId: tournamentPlayerIdSchema,
  alias: tournamentAliasSchema,
});

export type TournamentOpponent = z.infer<typeof tournamentOpponentSchema>;

export const tournamentMatchSchema = z.object({
  id: tournamentMatchIdSchema,
  tournamentId: tournamentIdSchema,
  p1Id: tournamentPlayerIdSchema,
  p2Id: tournamentPlayerIdSchema,
  order: z.number().int().nonnegative(),
  status: tournamentMatchStatusSchema,
  winnerId: tournamentPlayerIdSchema.nullable(),
  p1Score: z.number().int().nonnegative().nullable(),
  p2Score: z.number().int().nonnegative().nullable(),
  createdAt: z.string().datetime(),
  announcedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});

export type TournamentMatch = z.infer<typeof tournamentMatchSchema>;

export const tournamentAnnounceNextResponseSchema = z.object({
  matchId: tournamentMatchIdSchema,
  p1: tournamentOpponentSchema,
  p2: tournamentOpponentSchema,
  order: z.number().int().positive(),
});

export type TournamentAnnounceNextResponse = z.infer<typeof tournamentAnnounceNextResponseSchema>;

export const tournamentNextMatchResponseSchema = tournamentAnnounceNextResponseSchema;

export type TournamentNextMatchResponse = z.infer<typeof tournamentNextMatchResponseSchema>;

export const tournamentResultSchema = z.object({
  matchId: tournamentMatchIdSchema,
  p1Score: z.number().int().nonnegative(),
  p2Score: z.number().int().nonnegative(),
  winnerId: tournamentPlayerIdSchema,
});

export type TournamentResult = z.infer<typeof tournamentResultSchema>;

export const tournamentBoardEntrySchema = z.object({
  matchId: tournamentMatchIdSchema,
  order: z.number().int().positive(),
  p1: tournamentOpponentSchema,
  p2: tournamentOpponentSchema,
  status: tournamentMatchStatusSchema,
  winnerId: tournamentPlayerIdSchema.nullable(),
  p1Score: z.number().int().nonnegative().nullable(),
  p2Score: z.number().int().nonnegative().nullable(),
});

export type TournamentBoardEntry = z.infer<typeof tournamentBoardEntrySchema>;

export const tournamentBoardSchema = z.array(tournamentBoardEntrySchema);

export type TournamentBoard = z.infer<typeof tournamentBoardSchema>;

export const tournamentOkSchema = z.object({ ok: z.literal(true) });

export type TournamentOk = z.infer<typeof tournamentOkSchema>;
