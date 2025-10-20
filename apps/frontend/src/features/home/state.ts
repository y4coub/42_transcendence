/**
 * Dashboard State Manager
 * 
 * Manages home dashboard data loading with proper state management
 * Fetches user stats, leaderboard, and recent matches
 */

import {
	getUserStats,
	getLeaderboard,
	getRecentMatchesFeed,

	type UserStats,
	type LeaderboardEntry,
	type RecentMatchFeedItem,
} from '../../lib/api-client';

export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export interface DashboardState {
	userStats: UserStats | null;
	leaderboard: LeaderboardEntry[];
	recentMatches: RecentMatchFeedItem[];
	statsLoading: LoadingState;
	leaderboardLoading: LoadingState;
	recentLoading: LoadingState;
	statsError: string | null;
	leaderboardError: string | null;
	recentError: string | null;
	lastRefresh: Date | null;
}

/**
 * Dashboard State Manager Class
 */
export class DashboardStateManager {
	private state: DashboardState = {
		userStats: null,
		leaderboard: [],
		recentMatches: [],
		statsLoading: 'idle',
		leaderboardLoading: 'idle',
		recentLoading: 'idle',
		statsError: null,
		leaderboardError: null,
		recentError: null,
		lastRefresh: null,
	};

  private listeners: Array<(state: DashboardState) => void> = [];

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: DashboardState) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Get current state
   */
  getState(): DashboardState {
    return { ...this.state };
  }

  /**
   * Update state and notify listeners
   */
  private setState(updates: Partial<DashboardState>): void {
    this.state = { ...this.state, ...updates };
    this.notifyListeners();
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.state));
  }

  /**
   * Load user stats from API
   */
  async loadUserStats(userId: string): Promise<void> {
    this.setState({
      statsLoading: 'loading',
      statsError: null,
    });

    try {
		const stats = await getUserStats(userId, {
			refresh: false,
			limit: 5, // Last 5 matches for recent matches section
		});
      
      this.setState({
        userStats: stats,
        statsLoading: 'success',
        lastRefresh: new Date(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load stats';
      this.setState({
        userStats: null,
        statsLoading: 'error',
        statsError: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Load leaderboard from API
   */
	async loadLeaderboard(limit: number = 10): Promise<void> {
		this.setState({
			leaderboardLoading: 'loading',
			leaderboardError: null,
		});

		try {
			const leaderboard = await getLeaderboard(limit);

			this.setState({
				leaderboard,
				leaderboardLoading: 'success',
			});
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to load leaderboard';
			this.setState({
				leaderboard: [],
				leaderboardLoading: 'error',
				leaderboardError: errorMessage,
			});
			throw error;
		}
	}

	async loadRecentMatches(): Promise<void> {
		this.setState({
			recentLoading: 'loading',
			recentError: null,
		});

		try {
			const recentMatches = await getRecentMatchesFeed();
			this.setState({
				recentMatches,
				recentLoading: 'success',
			});
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to load recent matches';
			this.setState({
				recentMatches: [],
				recentLoading: 'error',
				recentError: errorMessage,
			});
			throw error;
		}
	}

  /**
   * Load all dashboard data (stats + leaderboard)
   */
	async loadAll(userId: string): Promise<void> {
		await Promise.all([
			this.loadUserStats(userId),
			this.loadLeaderboard(10),
			this.loadRecentMatches(),
		]);
}

  /**
   * Refresh dashboard data
   * Useful after completing a match
   */
  async refresh(userId: string): Promise<void> {
    await this.loadAll(userId);
  }

  /**
   * Reset state
   */
	reset(): void {
		this.state = {
			userStats: null,
			leaderboard: [],
			recentMatches: [],
			statsLoading: 'idle',
			leaderboardLoading: 'idle',
			recentLoading: 'idle',
			statsError: null,
			leaderboardError: null,
			recentError: null,
			lastRefresh: null,
		};
		this.notifyListeners();
	}

  /**
   * Clear errors
   */
  clearErrors(): void {
    this.setState({
      statsError: null,
      leaderboardError: null,
    });
  }

  /**
   * Check if data needs refresh (older than 5 minutes)
   */
  needsRefresh(): boolean {
    if (!this.state.lastRefresh) return true;
    
    const fiveMinutes = 5 * 60 * 1000;
    const now = new Date();
    return (now.getTime() - this.state.lastRefresh.getTime()) > fiveMinutes;
  }
}

/**
 * Global dashboard state manager instance
 */
export const dashboardState = new DashboardStateManager();
