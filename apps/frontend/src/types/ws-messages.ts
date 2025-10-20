/**
 * WebSocket Message Types for Real-Time Pong Game
 * 
 * Generated from: specs/002-pong-game-integration/contracts/ws-protocol.md
 * Feature: 002-pong-game-integration
 * Version: 1.0.0
 * Date: 2025-10-18
 */

// ============================================================================
// Client → Server Messages
// ============================================================================

/**
 * Join the match as an active player
 * Rate Limit: 1 per connection
 */
export interface JoinMatchMessage {
  type: 'join_match';
  matchId: string;
}

/**
 * Cleanly leave the match
 * Rate Limit: 1 per connection
 */
export interface LeaveMatchMessage {
  type: 'leave_match';
  matchId: string;
}

/**
 * Send paddle movement intent
 * Rate Limit: 60 messages per second per player
 */
export interface InputMessage {
  type: 'input';
  matchId: string;
  direction: 'up' | 'down' | 'stop';
  seq: number;           // Monotonic sequence number
  clientTime: number;    // Unix milliseconds
}

/**
 * Indicate player is ready to start match
 * Rate Limit: 5 per minute
 */
export interface ReadyMessage {
  type: 'ready';
  matchId: string;
}

/**
 * Pause the match
 * Rate Limit: 5 per minute
 */
export interface PauseMessage {
  type: 'pause';
  matchId: string;
}

/**
 * Resume paused match (only pauser can resume)
 * Rate Limit: 5 per minute
 */
export interface ResumeMessage {
  type: 'resume';
  matchId: string;
}

/**
 * Request current game state (used after reconnection)
 * Rate Limit: 10 per minute
 */
export interface RequestStateMessage {
  type: 'request_state';
  matchId: string;
}

export interface RematchRequestMessage {
  type: 'rematch_request';
  matchId: string;
}

export interface RematchAcceptMessage {
  type: 'rematch_accept';
  matchId: string;
}

export interface RematchDeclineMessage {
  type: 'rematch_decline';
  matchId: string;
  reason?: 'decline' | 'timeout' | 'disconnect';
}

export interface ForfeitMessage {
  type: 'forfeit';
  matchId: string;
}

/**
 * Heartbeat to keep connection alive
 * Rate Limit: 120 per minute (every 500ms minimum)
 */
export interface PingMessage {
  type: 'ping';
}

/**
 * Union type for all client-to-server messages
 */
export type ClientMessage =
  | JoinMatchMessage
  | LeaveMatchMessage
  | InputMessage
  | ReadyMessage
  | PauseMessage
  | ResumeMessage
  | RequestStateMessage
  | RematchRequestMessage
  | RematchAcceptMessage
  | RematchDeclineMessage
  | ForfeitMessage
  | PingMessage;

// ============================================================================
// Server → Client Messages
// ============================================================================

/**
 * Confirm successful authentication
 * Timing: Sent immediately after connection established
 */
export interface ConnectionOkMessage {
  type: 'connection_ok';
  userId: string;
  matchId: string;
}

/**
 * Confirm player joined match
 * Timing: After successful join_match
 */
export interface JoinedMessage {
  type: 'joined';
  matchId: string;
  playerId: string;
  match: {
    id: string;
    p1Id: string;
    p2Id: string;
    state: string;
    p1Score: number;
    p2Score: number;
  };
  gameState?: {
    timestamp: number;
    ball: {
      x: number;
      y: number;
      vx: number;
      vy: number;
    };
    p1: {
      y: number;
    };
    p2: {
      y: number;
    };
    score: {
      p1: number;
      p2: number;
    };
  };
}

/**
 * Broadcast current game state
 * Timing: Roughly every 16ms (60 Hz) while match state is 'playing'
 * 
 * All coordinates are normalized (0.0-1.0) for resolution independence
 */
export interface StateMessage {
  type: 'state';
  matchId: string;
  timestamp: number;     // Unix milliseconds
  ball: {
    x: number;           // Normalized 0.0-1.0
    y: number;           // Normalized 0.0-1.0
    vx: number;          // Velocity (normalized units/sec)
    vy: number;          // Velocity (normalized units/sec)
  };
  p1: {
    y: number;           // Paddle Y (normalized 0.0-1.0)
  };
  p2: {
    y: number;           // Paddle Y (normalized 0.0-1.0)
  };
  score: {
    p1: number;
    p2: number;
  };
}

/**
 * Notify countdown before match start/resume
 * Timing: Sent 3 times (3, 2, 1) with 1 second between each
 */
export interface CountdownMessage {
  type: 'countdown';
  matchId: string;
  seconds: number;       // Remaining countdown (3, 2, 1)
}

/**
 * Notify match has been paused
 * Timing: Immediately when player sends pause message
 */
export interface PausedMessage {
  type: 'paused';
  matchId: string;
  pausedBy: string;      // User ID of player who paused
}

/**
 * Notify match is resuming after pause (server message)
 * Timing: After countdown messages complete, before returning to 'playing'
 */
export interface ResumeServerMessage {
  type: 'resume';
  matchId: string;
  at: number;            // When resume will complete (after countdown)
}

/**
 * Notify match has ended
 * Timing: When match ends (score reaches 11, forfeit, or disconnect timeout)
 */
export interface GameOverMessage {
  type: 'game_over';
  matchId: string;
  winnerId: string;
  p1Score: number;
  p2Score: number;
  reason: 'score' | 'forfeit' | 'disconnect';
}

/**
 * Notify client of error condition
 * Timing: Immediately when error detected
 */
export interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
  matchId?: string;
}

/**
 * Error codes for ErrorMessage
 */
export const ErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_STATE: 'INVALID_STATE',
  RATE_LIMIT: 'RATE_LIMIT',
  INVALID_INPUT: 'INVALID_INPUT',
  UNAUTHORIZED_RESUME: 'UNAUTHORIZED_RESUME',
  MATCH_NOT_FOUND: 'MATCH_NOT_FOUND',
  ALREADY_JOINED: 'ALREADY_JOINED',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Respond to ping (heartbeat)
 * Timing: Immediately after receiving ping
 */
export interface PongMessage {
  type: 'pong';
  timestamp: number;     // Server timestamp
}

/**
 * Confirm player left match
 * Timing: After successful leave_match, before connection closes
 */
export interface LeftMessage {
  type: 'left';
  matchId: string;
}

export interface RematchRequestServerMessage {
  type: 'rematch_request';
  matchId: string;
  from: string;
}

export interface RematchAcceptServerMessage {
  type: 'rematch_accept';
  matchId: string;
  from: string;
}

export interface RematchDeclineServerMessage {
  type: 'rematch_decline';
  matchId: string;
  from: string;
  reason?: 'decline' | 'timeout' | 'disconnect';
}

/**
 * Union type for all server-to-client messages
 */
export type ServerMessage =
  | ConnectionOkMessage
  | JoinedMessage
  | StateMessage
  | CountdownMessage
  | PausedMessage
  | ResumeServerMessage
  | GameOverMessage
  | ErrorMessage
  | PongMessage
  | LeftMessage
  | RematchRequestServerMessage
  | RematchAcceptServerMessage
  | RematchDeclineServerMessage;

// ============================================================================
// WebSocket Close Codes
// ============================================================================

export const WSCloseCode = {
  NORMAL: 1000,              // Normal closure (leave_match)
  POLICY_VIOLATION: 1008,    // Rate limit exceeded
  BAD_REQUEST: 4400,         // Invalid parameters
  UNAUTHORIZED: 4401,        // Auth failed or not player
  NOT_FOUND: 4404,           // Match not found
  TOO_MANY_REQUESTS: 4429,   // Rate limit
} as const;

export type WSCloseCode = (typeof WSCloseCode)[keyof typeof WSCloseCode];

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Match state values
 */
export type MatchState = 'waiting' | 'countdown' | 'playing' | 'paused' | 'ended' | 'forfeited';

/**
 * Paddle direction inputs
 */
export type PaddleDirection = 'up' | 'down' | 'stop';

/**
 * Game over reasons
 */
export type GameOverReason = 'score' | 'forfeit' | 'disconnect';

/**
 * Base message interface for type guards
 */
export interface BaseMessage {
  type: string;
}

/**
 * Type guard to check if a message is a client message
 */
export function isClientMessage(msg: BaseMessage): msg is ClientMessage {
  return [
    'join_match',
    'leave_match',
    'input',
    'ready',
    'pause',
    'resume',
    'request_state',
    'ping',
  ].includes(msg.type);
}

/**
 * Type guard to check if a message is a server message
 */
export function isServerMessage(msg: BaseMessage): msg is ServerMessage {
  return [
    'connection_ok',
    'joined',
    'state',
    'countdown',
    'pause',
    'resume',
    'game_over',
    'error',
    'pong',
    'left',
  ].includes(msg.type);
}
