import {
	leaderboardResponseSchema,
	recentMatchesResponseSchema,
	type LeaderboardQuery,
} from './schemas';
import { listLeaderboard, listRecentMatches } from './repository';

const DEFAULT_LIMIT = 10;

export const getLeaderboard = ({ limit }: Partial<LeaderboardQuery> = {}) => {
	const normalizedLimit = limit ?? DEFAULT_LIMIT;
	const rows = listLeaderboard(normalizedLimit);

	const entries = rows.map((row, index) => {
		const totalMatches = row.wins + row.losses;
		const winRate = totalMatches > 0 ? Number((row.wins / totalMatches).toFixed(4)) : null;

		return {
			rank: index + 1,
			userId: row.userId,
			displayName: row.displayName,
			avatarUrl: row.avatarUrl,
			wins: row.wins,
			losses: row.losses,
			winRate,
			currentStreak: row.streak,
			lastResult: row.lastResult,
			lastMatchAt: row.lastMatchAt,
			updatedAt: row.updatedAt,
		};
	});

	return leaderboardResponseSchema.parse(entries);
};

const DEFAULT_RECENT_LIMIT = 20;

export const getRecentMatches = (limit: number = DEFAULT_RECENT_LIMIT) => {
	const matches = listRecentMatches(limit);
	return recentMatchesResponseSchema.parse(
		matches.map((match) => ({
			matchId: match.matchId,
			playedAt: match.playedAt,
			p1Score: match.p1Score,
			p2Score: match.p2Score,
			winnerId: match.winnerId,
			loserId: match.loserId,
			winnerName: match.winnerDisplayName,
			loserName: match.loserDisplayName,
			winnerAvatarUrl: match.winnerAvatarUrl,
			loserAvatarUrl: match.loserAvatarUrl,
		})),
	);
};
