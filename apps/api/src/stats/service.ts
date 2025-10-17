import { leaderboardResponseSchema, type LeaderboardQuery } from './schemas';
import { listLeaderboard } from './repository';

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
