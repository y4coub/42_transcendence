/**
 * Match Repository
 * 
 * Database operations for matches table (Pong game matches)
 * Feature: 002-pong-game-integration
 */

import { getDatabase } from '@infra/db/client';
import type { MatchState } from './schemas';

export interface MatchRecord {
	id: string;
	tournamentId: string | null;
	p1Id: string;
	p2Id: string;
	p1Score: number;
	p2Score: number;
	winnerId: string | null;
	state: MatchState;
	pausedBy: string | null;
	createdAt: string;
	startedAt: string | null;
	endedAt: string | null;
}

export interface CreateMatchInput {
	id: string;
	p1Id: string;
	p2Id: string;
	tournamentId?: string;
}

export interface UpdateMatchStateInput {
	matchId: string;
	state: MatchState;
	startedAt?: string;
	endedAt?: string;
}

export interface UpdateMatchScoresInput {
	matchId: string;
	p1Score: number;
	p2Score: number;
}

export interface RecordWinnerInput {
	matchId: string;
	winnerId: string;
	p1Score: number;
	p2Score: number;
}

export interface UpdatePausedByInput {
	matchId: string;
	pausedBy: string | null;
}

/**
 * Create a new match
 */
export function createMatch(input: CreateMatchInput): MatchRecord {
	const db = getDatabase();
	
	const stmt = db.prepare(`
		INSERT INTO matches (id, p1Id, p2Id, tournamentId, state, createdAt)
		VALUES (?, ?, ?, ?, 'waiting', datetime('now'))
	`);
	
	stmt.run(input.id, input.p1Id, input.p2Id, input.tournamentId ?? null);
	
	const match = getMatch(input.id);
	if (!match) {
		throw new Error('Failed to create match');
	}
	
	return match;
}

/**
 * Get match by ID
 */
export function getMatch(matchId: string): MatchRecord | null {
	const db = getDatabase();
	
	const stmt = db.prepare(`
		SELECT
			id,
			tournamentId,
			p1Id,
			p2Id,
			p1Score,
			p2Score,
			winnerId,
			state,
			pausedBy,
			STRFTIME('%Y-%m-%dT%H:%M:%fZ', createdAt) AS createdAt,
			STRFTIME('%Y-%m-%dT%H:%M:%fZ', startedAt) AS startedAt,
			STRFTIME('%Y-%m-%dT%H:%M:%fZ', endedAt) AS endedAt
		FROM matches
		WHERE id = ?
	`);
	
	return stmt.get(matchId) as MatchRecord | undefined ?? null;
}

/**
 * Update match state
 */
export function updateMatchState(input: UpdateMatchStateInput): void {
	const db = getDatabase();
	
	let sql = 'UPDATE matches SET state = ?';
	const params: unknown[] = [input.state];
	
	if (input.startedAt !== undefined) {
		sql += ', startedAt = ?';
		params.push(input.startedAt);
	}
	
	if (input.endedAt !== undefined) {
		sql += ', endedAt = datetime(?)';
		params.push(input.endedAt);
	}
	
	sql += ' WHERE id = ?';
	params.push(input.matchId);
	
	const stmt = db.prepare(sql);
	stmt.run(...params);
}

/**
 * Update match scores
 */
export function updateMatchScores(input: UpdateMatchScoresInput): void {
	const db = getDatabase();
	
	const stmt = db.prepare(`
		UPDATE matches
		SET p1Score = ?, p2Score = ?
		WHERE id = ?
	`);
	
	stmt.run(input.p1Score, input.p2Score, input.matchId);
}

/**
 * Record match winner and final scores (also sets state to 'ended')
 */
export function recordWinner(input: RecordWinnerInput): void {
	const db = getDatabase();
	
	const stmt = db.prepare(`
		UPDATE matches
		SET winnerId = ?,
		    p1Score = ?,
		    p2Score = ?,
		    state = 'ended',
		    endedAt = datetime('now')
		WHERE id = ?
	`);
	
	stmt.run(input.winnerId, input.p1Score, input.p2Score, input.matchId);
}

/**
 * Update pausedBy field
 */
export function updatePausedBy(input: UpdatePausedByInput): void {
	const db = getDatabase();
	
	const stmt = db.prepare(`
		UPDATE matches
		SET pausedBy = ?
		WHERE id = ?
	`);
	
	stmt.run(input.pausedBy, input.matchId);
}

/**
 * Get matches for a user (for match history)
 */
export function getUserMatches(userId: string, limit = 10): MatchRecord[] {
	const db = getDatabase();
	
	const stmt = db.prepare(`
		SELECT
			id,
			tournamentId,
			p1Id,
			p2Id,
			p1Score,
			p2Score,
			winnerId,
			state,
			pausedBy,
			STRFTIME('%Y-%m-%dT%H:%M:%fZ', createdAt) AS createdAt,
			STRFTIME('%Y-%m-%dT%H:%M:%fZ', startedAt) AS startedAt,
			STRFTIME('%Y-%m-%dT%H:%M:%fZ', endedAt) AS endedAt
		FROM matches
		WHERE (p1Id = ? OR p2Id = ?)
		  AND state IN ('ended', 'forfeited')
		ORDER BY endedAt DESC
		LIMIT ?
	`);
	
	return stmt.all(userId, userId, limit) as MatchRecord[];
}

/**
 * Check if user is a player in the match
 */
export function isPlayerInMatch(matchId: string, userId: string): boolean {
	const db = getDatabase();
	
	const stmt = db.prepare(`
		SELECT 1
		FROM matches
		WHERE id = ? AND (p1Id = ? OR p2Id = ?)
	`);
	
	const result = stmt.get(matchId, userId, userId);
	return result !== undefined;
}

/**
 * Get active matches (not ended or forfeited)
 */
export function getActiveMatches(): MatchRecord[] {
	const db = getDatabase();
	
	const stmt = db.prepare(`
		SELECT
			id,
			tournamentId,
			p1Id,
			p2Id,
			p1Score,
			p2Score,
			winnerId,
			state,
			pausedBy,
			STRFTIME('%Y-%m-%dT%H:%M:%fZ', createdAt) AS createdAt,
			STRFTIME('%Y-%m-%dT%H:%M:%fZ', startedAt) AS startedAt,
			STRFTIME('%Y-%m-%dT%H:%M:%fZ', endedAt) AS endedAt
		FROM matches
		WHERE state NOT IN ('ended', 'forfeited')
		ORDER BY createdAt DESC
	`);
	
	return stmt.all() as MatchRecord[];
}
