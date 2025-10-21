import { z } from 'zod';

export const matchStatePayloadSchema = z.record(z.unknown()).refine(
	(value) => typeof value === 'object' && value !== null,
	'State payload must be an object',
);

// ============================================================================
// WebSocket Message Schemas for Real-Time Pong Game
// Generated from: specs/002-pong-game-integration/contracts/ws-protocol.md
// ============================================================================

// --- Client → Server Messages ---

export const joinMatchMessageSchema = z.object({
	type: z.literal('join_match'),
	matchId: z.string().uuid(),
});

export type JoinMatchMessage = z.infer<typeof joinMatchMessageSchema>;

export const leaveMatchMessageSchema = z.object({
	type: z.literal('leave_match'),
	matchId: z.string().uuid(),
});

export type LeaveMatchMessage = z.infer<typeof leaveMatchMessageSchema>;

export const inputMessageSchema = z.object({
	type: z.literal('input'),
	matchId: z.string().uuid(),
	direction: z.enum(['up', 'down', 'stop']),
	seq: z.number().int().nonnegative(),
	clientTime: z.number().int().positive(),
});

export type InputMessage = z.infer<typeof inputMessageSchema>;

export const readyMessageSchema = z.object({
	type: z.literal('ready'),
	matchId: z.string().uuid(),
});

export type ReadyMessage = z.infer<typeof readyMessageSchema>;

export const pauseMessageSchema = z.object({
	type: z.literal('pause'),
	matchId: z.string().uuid(),
});

export type PauseMessage = z.infer<typeof pauseMessageSchema>;

export const resumeMessageSchema = z.object({
	type: z.literal('resume'),
	matchId: z.string().uuid(),
});

export type ResumeMessage = z.infer<typeof resumeMessageSchema>;

export const requestStateMessageSchema = z.object({
	type: z.literal('request_state'),
	matchId: z.string().uuid(),
});

export type RequestStateMessage = z.infer<typeof requestStateMessageSchema>;

export const rematchRequestMessageSchema = z.object({
	type: z.literal('rematch_request'),
	matchId: z.string().uuid(),
});

export type RematchRequestMessage = z.infer<typeof rematchRequestMessageSchema>;

export const rematchAcceptMessageSchema = z.object({
	type: z.literal('rematch_accept'),
	matchId: z.string().uuid(),
});

export type RematchAcceptMessage = z.infer<typeof rematchAcceptMessageSchema>;

export const rematchDeclineMessageSchema = z.object({
	type: z.literal('rematch_decline'),
	matchId: z.string().uuid(),
	reason: z.enum(['decline', 'timeout', 'disconnect']).optional(),
});

export type RematchDeclineMessage = z.infer<typeof rematchDeclineMessageSchema>;

export const forfeitMessageSchema = z.object({
	type: z.literal('forfeit'),
	matchId: z.string().uuid(),
});

export type ForfeitMessage = z.infer<typeof forfeitMessageSchema>;

export const pingMessageSchema = z.object({
	type: z.literal('ping'),
});

export type PingMessage = z.infer<typeof pingMessageSchema>;

// Union schema for all client messages
export const clientMessageSchema = z.discriminatedUnion('type', [
	joinMatchMessageSchema,
	leaveMatchMessageSchema,
	inputMessageSchema,
	readyMessageSchema,
	pauseMessageSchema,
	resumeMessageSchema,
	requestStateMessageSchema,
	rematchRequestMessageSchema,
	rematchAcceptMessageSchema,
	rematchDeclineMessageSchema,
	forfeitMessageSchema,
	pingMessageSchema,
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

// --- Server → Client Messages ---

export const connectionOkMessageSchema = z.object({
	type: z.literal('connection_ok'),
	userId: z.string(),
	matchId: z.string().uuid(),
});

export type ConnectionOkMessage = z.infer<typeof connectionOkMessageSchema>;

export const joinedMessageSchema = z.object({
	type: z.literal('joined'),
	matchId: z.string().uuid(),
	playerId: z.string(),
	match: z.object({
		id: z.string().uuid(),
		p1Id: z.string(),
		p2Id: z.string(),
		state: z.string(),
		p1Score: z.number().int().nonnegative(),
		p2Score: z.number().int().nonnegative(),
	}),
});

export type JoinedMessage = z.infer<typeof joinedMessageSchema>;

export const stateMessageSchema = z.object({
	type: z.literal('state'),
	matchId: z.string().uuid(),
	timestamp: z.number().int().positive(),
	ball: z.object({
		x: z.number().min(0).max(1),
		y: z.number().min(0).max(1),
		vx: z.number(),
		vy: z.number(),
	}),
	p1: z.object({
		y: z.number().min(0).max(1),
	}),
	p2: z.object({
		y: z.number().min(0).max(1),
	}),
	score: z.object({
		p1: z.number().int().nonnegative(),
		p2: z.number().int().nonnegative(),
	}),
});

export type StateMessage = z.infer<typeof stateMessageSchema>;

export const countdownMessageSchema = z.object({
	type: z.literal('countdown'),
	matchId: z.string().uuid(),
	seconds: z.number().int().min(0).max(3),
});

export type CountdownMessage = z.infer<typeof countdownMessageSchema>;

export const pausedMessageSchema = z.object({
	type: z.literal('pause'),
	matchId: z.string().uuid(),
	by: z.string(),
	timestamp: z.number().int().positive(),
});

export type PausedMessage = z.infer<typeof pausedMessageSchema>;

export const resumeServerMessageSchema = z.object({
	type: z.literal('resume'),
	matchId: z.string().uuid(),
	at: z.number().int().positive(),
});

export type ResumeServerMessage = z.infer<typeof resumeServerMessageSchema>;

export const gameOverMessageSchema = z.object({
	type: z.literal('game_over'),
	matchId: z.string().uuid(),
	winnerId: z.string(),
	p1Score: z.number().int().nonnegative(),
	p2Score: z.number().int().nonnegative(),
	reason: z.enum(['score', 'forfeit', 'disconnect']),
});

export type GameOverMessage = z.infer<typeof gameOverMessageSchema>;

export const errorMessageSchema = z.object({
	type: z.literal('error'),
	code: z.string(),
	message: z.string(),
	matchId: z.string().uuid().optional(),
});

export type ErrorMessage = z.infer<typeof errorMessageSchema>;

export const pongMessageSchema = z.object({
	type: z.literal('pong'),
	timestamp: z.number().int().positive(),
});

export type PongMessage = z.infer<typeof pongMessageSchema>;

export const leftMessageSchema = z.object({
	type: z.literal('left'),
	matchId: z.string().uuid(),
});

export type LeftMessage = z.infer<typeof leftMessageSchema>;

export const rematchRequestServerMessageSchema = z.object({
	type: z.literal('rematch_request'),
	matchId: z.string().uuid(),
	from: z.string(),
});

export type RematchRequestServerMessage = z.infer<typeof rematchRequestServerMessageSchema>;

export const rematchAcceptServerMessageSchema = z.object({
	type: z.literal('rematch_accept'),
	matchId: z.string().uuid(),
	from: z.string(),
});

export type RematchAcceptServerMessage = z.infer<typeof rematchAcceptServerMessageSchema>;

export const rematchDeclineServerMessageSchema = z.object({
	type: z.literal('rematch_decline'),
	matchId: z.string().uuid(),
	from: z.string(),
	reason: z.enum(['decline', 'timeout', 'disconnect']).optional(),
});

export type RematchDeclineServerMessage = z.infer<typeof rematchDeclineServerMessageSchema>;

// Union schema for all server messages
export const serverMessageSchema = z.discriminatedUnion('type', [
	connectionOkMessageSchema,
	joinedMessageSchema,
	stateMessageSchema,
	countdownMessageSchema,
	pausedMessageSchema,
	resumeServerMessageSchema,
	gameOverMessageSchema,
	errorMessageSchema,
	pongMessageSchema,
	leftMessageSchema,
	rematchRequestServerMessageSchema,
	rematchAcceptServerMessageSchema,
	rematchDeclineServerMessageSchema,
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;

// --- Match State Enum ---

export const matchStateSchema = z.enum([
	'waiting',
	'countdown',
	'playing',
	'paused',
	'ended',
	'forfeited',
]);

export type MatchState = z.infer<typeof matchStateSchema>;

// --- Error Codes ---

export const errorCodeSchema = z.enum([
	'UNAUTHORIZED',
	'INVALID_STATE',
	'RATE_LIMIT',
	'INVALID_INPUT',
	'UNAUTHORIZED_RESUME',
	'MATCH_NOT_FOUND',
	'ALREADY_JOINED',
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;
