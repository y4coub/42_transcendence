/**
 * Profile State Manager
 * 
 * Manages profile and stats data loading with proper state management
 * (loading, error, data states)
 */

import {
  getUserProfile,
  getUserStats,
  getUserGlobalRank,
  getTwoFactorStatus,
  startTwoFactorEnrollment,
  confirmTwoFactorEnrollment,
  cancelTwoFactorEnrollment,
  disableTwoFactor,
  type UserProfile,
  type UserStats,
  type LeaderboardEntry,
  type TwoFactorStatus,
  type TwoFactorEnrollment,
} from '../../lib/api-client';

export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export interface ProfileState {
  profile: UserProfile | null;
  stats: UserStats | null;
  globalRank: number | null;
  profileLoading: LoadingState;
  statsLoading: LoadingState;
  profileError: string | null;
  statsError: string | null;
  twoFactor: TwoFactorStatus | null;
  twoFactorEnrollment: TwoFactorEnrollment | null;
  twoFactorLoading: LoadingState;
  twoFactorError: string | null;
}

/**
 * Profile State Manager Class
 */
export class ProfileStateManager {
  private state: ProfileState = {
    profile: null,
    stats: null,
    globalRank: null,
    profileLoading: 'idle',
    statsLoading: 'idle',
    profileError: null,
    statsError: null,
    twoFactor: null,
    twoFactorEnrollment: null,
    twoFactorLoading: 'idle',
    twoFactorError: null,
  };

  private listeners: Array<(state: ProfileState) => void> = [];

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: ProfileState) => void): () => void {
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
  getState(): ProfileState {
    return { ...this.state };
  }

  /**
   * Update state and notify listeners
   */
  private setState(updates: Partial<ProfileState>): void {
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
   * Load user profile from API
   */
  async loadProfile(userId: string): Promise<void> {
    this.setState({
      profileLoading: 'loading',
      profileError: null,
    });

    try {
      const profile = await getUserProfile(userId);
      this.setState({
        profile,
        profileLoading: 'success',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load profile';
      this.setState({
        profile: null,
        profileLoading: 'error',
        profileError: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Load user stats from API
   */
  async loadStats(userId: string, options?: { refresh?: boolean; limit?: number }): Promise<void> {
    this.setState({
      statsLoading: 'loading',
      statsError: null,
    });

    try {
      const stats = await getUserStats(userId, {
        refresh: options?.refresh ?? true,
        limit: options?.limit ?? 10,
      });
      
      this.setState({
        stats,
        statsLoading: 'success',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load stats';
      this.setState({
        stats: null,
        statsLoading: 'error',
        statsError: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Calculate and load global rank
   */
  async loadGlobalRank(userId: string, leaderboard?: LeaderboardEntry[]): Promise<void> {
    try {
      const rank = await getUserGlobalRank(userId, leaderboard);
      this.setState({ globalRank: rank });
    } catch (error) {
      console.error('Failed to calculate global rank:', error);
      this.setState({ globalRank: null });
    }
  }

  /**
   * Load all profile data (profile + stats + rank)
   */
  async loadAll(userId: string): Promise<void> {
    await Promise.all([
      this.loadProfile(userId),
      this.loadStats(userId, { refresh: true, limit: 10 }),
      this.loadGlobalRank(userId),
      this.loadTwoFactorStatus(),
    ]);
  }

  /**
   * Refresh stats (useful after completing a match)
   */
  async refreshStats(userId: string): Promise<void> {
    await this.loadStats(userId, { refresh: true, limit: 10 });
    await this.loadGlobalRank(userId);
  }

  /**
   * Reset state
   */
  reset(): void {
    this.state = {
      profile: null,
      stats: null,
      globalRank: null,
      profileLoading: 'idle',
      statsLoading: 'idle',
      profileError: null,
      statsError: null,
      twoFactor: null,
      twoFactorEnrollment: null,
      twoFactorLoading: 'idle',
      twoFactorError: null,
    };
    this.notifyListeners();
  }

  /**
   * Clear errors
   */
  clearErrors(): void {
    this.setState({
      profileError: null,
      statsError: null,
      twoFactorError: null,
    });
  }

  /**
   * Load two-factor status
   */
  async loadTwoFactorStatus(): Promise<void> {
    this.setState({
      twoFactorLoading: 'loading',
      twoFactorError: null,
    });

    const previousEnrollment = this.state.twoFactorEnrollment;

    try {
      const status = await getTwoFactorStatus();
      this.setState({
        twoFactor: status,
        twoFactorEnrollment: status.status === 'pending' ? previousEnrollment : null,
        twoFactorLoading: 'success',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load two-factor status';
      this.setState({
        twoFactor: null,
        twoFactorLoading: 'error',
        twoFactorError: message,
      });
      throw error;
    }
  }

  /**
   * Begin two-factor enrollment
   */
  async startTwoFactorEnrollment(): Promise<TwoFactorEnrollment> {
    this.setState({
      twoFactorLoading: 'loading',
      twoFactorError: null,
    });

    try {
      const enrollment = await startTwoFactorEnrollment();
      const previous = this.state.twoFactor;
      this.setState({
        twoFactorEnrollment: enrollment,
        twoFactorLoading: 'success',
        twoFactor: {
          status: 'pending',
          pendingExpiresAt: enrollment.expiresAt,
          lastVerifiedAt: previous?.lastVerifiedAt ?? null,
          recoveryCodesCreatedAt: previous?.recoveryCodesCreatedAt ?? null,
        },
      });
      return enrollment;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start two-factor enrollment';
      this.setState({
        twoFactorLoading: 'error',
        twoFactorError: message,
      });
      throw error;
    }
  }

  /**
   * Confirm two-factor enrollment using a TOTP code
   */
  async confirmTwoFactorEnrollment(code: string): Promise<void> {
    this.setState({
      twoFactorLoading: 'loading',
      twoFactorError: null,
    });

    try {
      await confirmTwoFactorEnrollment(code);
      await this.loadTwoFactorStatus();
      this.setState({ twoFactorEnrollment: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to confirm two-factor enrollment';
      this.setState({
        twoFactorLoading: 'error',
        twoFactorError: message,
      });
      throw error;
    }
  }

  /**
   * Cancel an in-progress two-factor enrollment
   */
  async cancelTwoFactorEnrollment(): Promise<void> {
    this.setState({
      twoFactorLoading: 'loading',
      twoFactorError: null,
    });

    try {
      await cancelTwoFactorEnrollment();
      await this.loadTwoFactorStatus();
      this.setState({ twoFactorEnrollment: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel two-factor enrollment';
      this.setState({
        twoFactorLoading: 'error',
        twoFactorError: message,
      });
      throw error;
    }
  }

  /**
   * Disable two-factor authentication
   */
  async disableTwoFactor(code?: string): Promise<void> {
    this.setState({
      twoFactorLoading: 'loading',
      twoFactorError: null,
    });

    try {
      const status = await disableTwoFactor(code);
      this.setState({
        twoFactor: status,
        twoFactorEnrollment: null,
        twoFactorLoading: 'success',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to disable two-factor authentication';
      this.setState({
        twoFactorLoading: 'error',
        twoFactorError: message,
      });
      throw error;
    }
  }
}

/**
 * Global profile state manager instance
 */
export const profileState = new ProfileStateManager();
