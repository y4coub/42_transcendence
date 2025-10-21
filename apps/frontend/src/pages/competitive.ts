import { createButton, createDiv, createElement, appendChildren } from '../utils/dom';
import {
	getLadderOverview,
	joinLadderQueue,
	leaveLadderQueue,
	type LadderOverview,
	type LadderQueueState,
} from '../lib/api-client';
import { appState } from '../utils/state';
import { navigate } from '../lib/router-instance';
import { createProfileAvatarButton } from '../utils/avatar';
import { showProfilePreviewModal } from '../components/ProfilePreviewModal';

const openProfilePreview = async (userId: string): Promise<void> => {
	await showProfilePreviewModal({ userId });
};

const formatRank = (rank: number | null) => {
	if (!rank || rank <= 0) {
		return 'Unranked';
	}
	if (rank === 1) {
		return '#1 • Champion';
	}
	if (rank <= 10) {
		return `Top 10 (#${rank})`;
}
	return `Rank #${rank}`;
};

export function createCompetitivePage(): HTMLElement {
	const page = createDiv('min-h-screen w-full bg-[#121217] pt-16 text-[#E0E0E0]');
	const container = createDiv('container mx-auto max-w-7xl px-4 py-10 space-y-8');

	const header = createDiv('space-y-3');
	const title = createElement('h1', 'text-3xl font-semibold uppercase tracking-[0.35em] text-[#00C8FF]');
	title.textContent = 'Tournament Ladder';
	const subtitle = createElement('p', 'text-sm text-[#E0E0E0]/70 max-w-3xl');
	subtitle.textContent =
		'Queue up for ranked matches, track ladder movement in real time, and see exactly who is next in line.';
	appendChildren(header, [title, subtitle]);

	const feedback = createDiv(
		'hidden rounded border border-[#FF008C]/30 bg-[#1f0f18]/80 px-4 py-3 text-xs uppercase tracking-[0.3em] text-[#FF7AC3]',
	);

	const snapshotCard = createDiv(
		'rounded border border-[#00C8FF]/25 bg-[#151c2b]/90 p-6 shadow-[0_0_25px_rgba(0,200,255,0.15)] space-y-5',
	);
	const snapshotTitle = createElement(
		'h2',
		'text-sm font-semibold uppercase tracking-[0.4em] text-[#00C8FF] text-center',
	);
	snapshotTitle.textContent = 'Your Ladder Snapshot';
	const snapshotMeta = createElement('p', 'text-xs text-[#E0E0E0]/60 text-center');
	snapshotMeta.textContent = 'Loading ladder status…';

	const statsGrid = createDiv('grid grid-cols-1 gap-3 sm:grid-cols-3');
	const ratingStat = createStatCard('Rating');
	const rankStat = createStatCard('Global Rank');
	const streakStat = createStatCard('Current Streak');
	appendChildren(statsGrid, [ratingStat.root, rankStat.root, streakStat.root]);

	appendChildren(snapshotCard, [snapshotTitle, snapshotMeta, statsGrid]);

	container.appendChild(snapshotCard);

	const grid = createDiv('grid gap-6 lg:grid-cols-12');

	const queueCard = createDiv(
		'rounded border border-[#00C8FF]/20 bg-[#101522]/95 p-6 space-y-5 shadow-[0_0_20px_rgba(0,200,255,0.12)]',
	);
	const queueHeader = createDiv('space-y-1');
	const queueTitle = createElement('h3', 'text-sm font-semibold uppercase tracking-[0.35em] text-[#00C8FF]');
	queueTitle.textContent = 'Queue Status';
	const queueHint = createElement('p', 'text-xs text-[#E0E0E0]/60');
	queueHint.textContent = 'Queue updates live — secure your spot when you are ready.';
	const queueStatus = createElement('p', 'text-base font-semibold text-[#E0E0E0]');
	queueStatus.textContent = 'Checking queue…';
	appendChildren(queueHeader, [queueTitle, queueHint]);

	const queueButtons = createDiv('grid gap-2 sm:grid-cols-2');
	const queueAction = createButton(
		'Join Ranked Queue',
		'rounded-lg border border-[#00C8FF]/35 bg-[#00C8FF]/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#00C8FF] transition-colors hover:bg-[#00C8FF]/25 disabled:cursor-not-allowed disabled:opacity-60',
		async () => {
			if (queueAction.disabled) {
				return;
			}
			queueAction.disabled = true;
			try {
				const state = await joinLadderQueue();
				updateQueueState(state);
				await refreshOverview();
			} catch (error) {
				console.error('[CompetitivePage] Queue join failed', error);
				showFeedback(error instanceof Error ? error.message : 'Unable to join ranked queue');
				queueAction.disabled = false;
				return;
			}
		},
	);

	const queueLeaveAction = createButton(
		'Leave Queue',
		'rounded-lg border border-[#FF4D6D]/40 bg-[#2a1319] px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#FF4D6D] transition-colors hover:bg-[#391920] disabled:cursor-not-allowed disabled:opacity-50 hidden',
		async () => {
			if (queueLeaveAction.disabled) {
				return;
			}
			queueLeaveAction.disabled = true;
			try {
				const state = await leaveLadderQueue();
				updateQueueState(state);
				await refreshOverview();
			} catch (error) {
				console.error('[CompetitivePage] Queue leave failed', error);
				showFeedback(error instanceof Error ? error.message : 'Unable to leave ranked queue');
				queueLeaveAction.disabled = false;
				return;
			}
		},
	);

	appendChildren(queueButtons, [queueAction, queueLeaveAction]);
	appendChildren(queueCard, [queueHeader, queueStatus, queueButtons]);

	const queueColumn = createDiv('lg:col-span-4 space-y-6');
	queueColumn.appendChild(queueCard);

	// Main column (match, queue lineup, leaderboard, recent matches)
	const mainColumn = createDiv('lg:col-span-8 space-y-6');

	const currentMatchCard = createDiv(
		'rounded border border-[#FFB347]/35 bg-[#1b1410]/95 p-6 space-y-4 shadow-[0_0_22px_rgba(255,179,71,0.18)]',
	);
	const currentMatchHeader = createDiv('flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between');
	const currentMatchTitle = createElement('h3', 'text-sm font-semibold uppercase tracking-[0.35em] text-[#FFB347]');
	currentMatchTitle.textContent = 'Match Holding The Queue';
	const currentMatchStatus = createElement('span', 'text-[11px] uppercase tracking-[0.35em] text-[#FFB347]/70');
	currentMatchStatus.textContent = 'No match';
	appendChildren(currentMatchHeader, [currentMatchTitle, currentMatchStatus]);

	const currentMatchBody = createDiv('space-y-3 text-sm text-[#F4E2CF]/80');
	const currentMatchPlaceholder = createPlaceholder('No active ranked match. Queue up to take the first game!');
	currentMatchBody.appendChild(currentMatchPlaceholder);

	const currentMatchActions = createDiv('flex flex-wrap items-center gap-3 hidden');
	const matchCta = createButton(
		'Enter Arena',
		'hidden rounded-lg border border-[#00C8FF]/40 bg-[#00C8FF]/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#00C8FF] transition-colors hover:bg-[#00C8FF]/25',
	);
	currentMatchActions.appendChild(matchCta);

	appendChildren(currentMatchCard, [currentMatchHeader, currentMatchBody, currentMatchActions]);

	const lineupCard = createDiv(
		'rounded border border-[#00C8FF]/20 bg-[#11192a]/95 p-6 space-y-4 shadow-[0_0_20px_rgba(0,200,255,0.12)]',
	);
	const lineupHeader = createDiv('flex items-center justify-between');
	const lineupTitle = createElement('h3', 'text-sm font-semibold uppercase tracking-[0.35em] text-[#00C8FF]');
	lineupTitle.textContent = 'Queue Lineup';
	const lineupHint = createElement('span', 'text-[11px] uppercase tracking-[0.35em] text-[#E0E0E0]/50');
	lineupHint.textContent = 'Loading…';
	appendChildren(lineupHeader, [lineupTitle, lineupHint]);
	const lineupList = createDiv('space-y-2');
	lineupList.appendChild(createPlaceholder('Queue is currently empty.'));
	appendChildren(lineupCard, [lineupHeader, lineupList]);

	const leaderboardCard = createDiv(
		'rounded border border-[#00C8FF]/20 bg-[#0f1523]/95 p-6 space-y-4 shadow-[0_0_20px_rgba(0,200,255,0.12)]',
	);
	const leaderboardHeader = createDiv('flex items-center justify-between');
	const leaderboardTitle = createElement('h3', 'text-sm font-semibold uppercase tracking-[0.35em] text-[#00C8FF]');
	leaderboardTitle.textContent = 'Live Leaderboard';
	const refreshButton = createButton(
		'Refresh',
		'inline-flex h-9 items-center justify-center rounded-lg border border-[#00C8FF]/30 px-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#00C8FF] transition-colors hover:bg-[#00C8FF]/15 disabled:opacity-40',
		async () => {
			refreshButton.disabled = true;
			await refreshOverview();
			refreshButton.disabled = false;
		},
	);
	appendChildren(leaderboardHeader, [leaderboardTitle, refreshButton]);
	const leaderboardList = createDiv('space-y-2');
	leaderboardList.appendChild(createPlaceholder('Loading leaderboard…'));
	appendChildren(leaderboardCard, [leaderboardHeader, leaderboardList]);

	const recentCard = createDiv(
		'rounded border border-[#00C8FF]/20 bg-[#0f1523]/95 p-6 space-y-4 shadow-[0_0_20px_rgba(0,200,255,0.12)]',
	);
	const recentTitle = createElement('h3', 'text-sm font-semibold uppercase tracking-[0.35em] text-[#00C8FF]');
	recentTitle.textContent = 'Recent Ranked Matches';
	const recentList = createDiv('space-y-2');
	recentList.appendChild(createPlaceholder('No ranked matches yet. Play your first match to begin your history.'));
	appendChildren(recentCard, [recentTitle, recentList]);

	appendChildren(mainColumn, [currentMatchCard, lineupCard, leaderboardCard, recentCard]);

	appendChildren(grid, [queueColumn, mainColumn]);
	appendChildren(container, [header, feedback, grid]);
	page.appendChild(container);

	let currentOverview: LadderOverview | null = null;
	let activeMatchRef: { matchId: string; opponentId: string } | null = null;

	const showFeedback = (message: string | null): void => {
		if (!message) {
			feedback.classList.add('hidden');
			feedback.textContent = '';
			return;
		}
		feedback.textContent = message;
		feedback.classList.remove('hidden');
	};

	const updateOverview = (overview: LadderOverview): void => {
		currentOverview = overview;

		const you = overview.you;
		ratingStat.value.textContent = you ? Math.round(you.rating).toString() : '—';
		rankStat.value.textContent = formatRank(you?.rank ?? null);
		streakStat.value.textContent = you ? `${you.streak} wins` : '—';
		snapshotMeta.textContent = you
			? 'Rating updates instantly after each finished game.'
			: 'Play ranked matches to earn your first rating.';

		renderCurrentMatch(overview);
		renderQueueLineup(overview);
		renderLeaderboard(overview);
		renderRecentMatches(overview);
		updateQueueState(overview.queue);
		lineupHint.textContent =
			overview.queueLineup.length === 0
				? 'Queue is empty'
				: overview.queueLineup.length === 1
				? '1 player waiting'
				: `${overview.queueLineup.length} players waiting`;
	};

	const updateQueueState = (queue: LadderQueueState | LadderOverview['queue']): void => {
		const inQueue = queue.inQueue;
		const currentMatch = currentOverview?.currentMatch ?? null;
		const waitingForMatch = Boolean(currentMatch && (currentMatch.status === 'waiting' || currentMatch.status === 'countdown'));
		const matchInProgress = Boolean(currentMatch && currentMatch.status === 'playing');
		const viewerId = appState.getState().userId;
		const isChampion = viewerId && currentMatch?.champion.userId === viewerId;
		const isChallenger = viewerId && currentMatch?.challenger.userId === viewerId;

		if (inQueue) {
			queueStatus.textContent = queue.position
				? `Searching… You are #${queue.position} in line.`
				: 'Searching for the best opponent…';
			queueHint.textContent = 'We will notify you as soon as a match is found.';
		} else if (matchInProgress && currentMatch) {
			queueStatus.textContent = `Currently playing: ${currentMatch.champion.displayName} vs ${currentMatch.challenger.displayName}.`;
			queueHint.textContent = 'Jump back into the arena whenever you are ready.';
		} else if (waitingForMatch) {
			queueStatus.textContent = 'Opponent found — waiting for them to confirm.';
			queueHint.textContent = 'Hang tight, the match will begin once both players are ready.';
		} else {
			queueStatus.textContent = 'Not currently searching for a ranked opponent.';
			queueHint.textContent = 'Queue updates live — secure your spot when you are ready.';
		}

		if ('matchmakingMessage' in queue && queue.matchmakingMessage) {
			queueHint.textContent = queue.matchmakingMessage;
		}

		queueAction.disabled = inQueue || Boolean(isChampion || isChallenger);
		queueLeaveAction.classList.toggle('hidden', !inQueue);
		queueLeaveAction.disabled = !inQueue;
	};

	const renderLeaderboard = (overview: LadderOverview): void => {
		leaderboardList.innerHTML = '';
		if (overview.leaderboard.length === 0) {
			leaderboardList.appendChild(createPlaceholder('No ranked games played yet. Be the first to claim the top spot!'));
			return;
		}

		for (const player of overview.leaderboard) {
			const row = createDiv(
				'flex items-center justify-between rounded-lg border border-[#00C8FF]/10 bg-[#0b1220]/80 px-4 py-3 transition-colors hover:border-[#00C8FF]/30',
			);
			const left = createDiv('flex items-center gap-3');

			const position = createDiv(
				'h-8 w-8 flex items-center justify-center rounded-full border border-[#00C8FF]/35 text-xs font-semibold uppercase tracking-[0.28em] text-[#00C8FF]',
			);
			position.textContent = `#${player.rank}`;

			const avatarButton = createProfileAvatarButton({
				userId: player.userId,
				displayName: player.displayName,
				avatarUrl: player.avatarUrl,
				onClick: openProfilePreview,
			});

			const name = createDiv('flex flex-col');
			const display = createElement('span', 'text-sm font-semibold text-[#E0E0E0]');
			display.textContent = player.displayName;
			const meta = createElement('span', 'text-[11px] uppercase tracking-[0.3em] text-[#E0E0E0]/50');
			meta.textContent = `Rating ${Math.round(player.rating)} • Streak ${player.streak}`;
			appendChildren(name, [display, meta]);

			appendChildren(left, [position, avatarButton, name]);

			if (currentOverview?.you && currentOverview.you.rank === player.rank) {
				row.classList.add('border-[#00C8FF]/40', 'bg-[#00C8FF]/10');
			}

			row.appendChild(left);
			leaderboardList.appendChild(row);
		}
	};

	const renderRecentMatches = (overview: LadderOverview): void => {
		recentList.innerHTML = '';
		if (overview.recentMatches.length === 0) {
			recentList.appendChild(createPlaceholder('Play a ranked match to populate your recent results.'));
			return;
		}

		for (const match of overview.recentMatches) {
			const entry = createDiv(
				'flex items-start justify-between rounded-lg border border-[#00C8FF]/10 bg-[#0b1220]/75 px-4 py-3',
			);
			const details = createDiv('space-y-1');
			const heading = createElement('div', 'text-sm font-semibold text-[#E0E0E0]');
			heading.textContent = `${match.result === 'win' ? 'Victory' : 'Defeat'} vs ${match.opponentDisplayName}`;
			const meta = createElement('div', 'text-[11px] uppercase tracking-[0.3em] text-[#E0E0E0]/50');
			meta.textContent = `${match.score} • ${new Date(match.playedAt).toLocaleString()}`;
			appendChildren(details, [heading, meta]);

			const rating = createElement('span', 'text-xs uppercase tracking-[0.3em] text-[#00C8FF]/70');
			rating.textContent = `Rating ${Math.round(match.opponentRating)}`;
			appendChildren(entry, [details, rating]);
			recentList.appendChild(entry);
		}
	};

	const renderQueueLineup = (overview: LadderOverview): void => {
		lineupList.innerHTML = '';
		if (overview.queueLineup.length === 0) {
			lineupList.appendChild(createPlaceholder('Queue is currently empty. Join now to play first!'));
			return;
		}

		const headerRow = createDiv('flex items-center justify-between text-xs uppercase tracking-[0.3em] text-[#7FA0C3] pb-2 border-b border-[#00C8FF]/10');
		const headerLeft = createElement('span', 'flex-1');
		headerLeft.textContent = 'Queue Position';
		const headerStatus = createElement('span', 'w-32 text-right');
		headerStatus.textContent = 'Status';
		appendChildren(headerRow, [headerLeft, headerStatus]);
		lineupList.appendChild(headerRow);

		for (const entry of overview.queueLineup) {
			const row = createDiv(
				'flex items-center justify-between rounded-lg border border-[#00C8FF]/12 bg-[#0d1322]/80 px-4 py-3 transition-colors',
			);
			if (entry.position === 1) {
				row.classList.add('border-[#00C8FF]/40', 'bg-[#00C8FF]/10');
			}
			if (entry.isYou) {
				row.classList.add('border-[#00C8FF]/60', 'bg-[#00C8FF]/15');
			}

			const left = createDiv('flex items-center gap-3');
			const positionBadge = createDiv(
				'h-8 w-8 flex items-center justify-center rounded-full border border-[#00C8FF]/35 text-xs font-semibold uppercase tracking-[0.28em] text-[#00C8FF]',
			);
			positionBadge.textContent = entry.position.toString();

			const avatar = createProfileAvatarButton({
				userId: entry.userId,
				displayName: entry.displayName,
				avatarUrl: entry.avatarUrl,
				onClick: openProfilePreview,
			});
			avatar.classList.add('h-10', 'w-10');

			const info = createDiv('flex flex-col');
			const name = createElement('span', 'text-sm font-semibold text-[#E0E0E0]');
			name.textContent = entry.isYou ? `${entry.displayName} (You)` : entry.displayName;
			const meta = createElement('span', 'text-[11px] uppercase tracking-[0.3em] text-[#E0E0E0]/50');
			meta.textContent = `Joined ${formatRelativeTime(entry.joinedAt)}`;
			appendChildren(info, [name, meta]);

			appendChildren(left, [positionBadge, avatar, info]);

			const status = createElement('span', 'text-[11px] uppercase tracking-[0.3em] text-[#7FA0C3] w-32 text-right');
			status.textContent = entry.position === 1 ? 'Awaiting match' : entry.position === 2 ? 'On deck' : 'In line';

			appendChildren(row, [left, status]);
			lineupList.appendChild(row);
		}
	};

	const createCurrentMatchBlock = (match: NonNullable<LadderOverview['currentMatch']>): HTMLElement => {
		const statusText =
			match.status === 'waiting'
				? 'Awaiting players — current match holding the line'
				: match.status === 'countdown'
				? 'Countdown — current match holding the line'
				: 'In progress — queue waiting for results';

		const block = createDiv('rounded-lg border border-[#00C8FF]/20 bg-[#0d1424]/90 p-4 space-y-3');

		const header = createDiv('flex items-center justify-between gap-3');
		const title = createElement('h4', 'text-xs font-semibold uppercase tracking-[0.35em] text-[#00C8FF]');
		title.textContent = 'Current Match';
		const status = createElement('span', 'text-[11px] uppercase tracking-[0.3em] text-[#7FA0C3]');
		status.textContent = statusText;
		status.dataset.currentMatchStatus = 'true';
		appendChildren(header, [title, status]);
		block.appendChild(header);

		const participants = createDiv('space-y-3');
		participants.appendChild(createParticipantRow(match.champion, 'Champion (defending)'));
		participants.appendChild(createParticipantRow(match.challenger, 'Challenger'));
		block.appendChild(participants);

		const matchMeta = createDiv('text-[11px] uppercase tracking-[0.3em] text-[#7FA0C3] text-right');
		matchMeta.textContent = `Match ${match.matchId.slice(0, 8)} • Started ${formatRelativeTime(match.startedAt)}`;
		block.appendChild(matchMeta);

		return block;
	};

	const createParticipantRow = (
		participant: NonNullable<LadderOverview['currentMatch']>['champion'],
		label: string,
	): HTMLElement => {
		const row = createDiv('flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap');
		const left = createDiv('flex items-center gap-3');
		const avatar = createProfileAvatarButton({
			userId: participant.userId,
			displayName: participant.displayName,
			avatarUrl: participant.avatarUrl,
			onClick: openProfilePreview,
		});
		avatar.classList.add('h-10', 'w-10');
		const info = createDiv('flex flex-col');
		const name = createElement('span', 'text-sm font-semibold text-[#E0E0E0]');
		name.textContent = participant.displayName;
		const meta = createElement('span', 'text-[11px] uppercase tracking-[0.3em] text-[#E0E0E0]/50');
		meta.textContent = `Rating ${Math.round(participant.rating)}`;
		appendChildren(info, [name, meta]);
		appendChildren(left, [avatar, info]);

		const badge = createElement('span', 'text-[10px] uppercase tracking-[0.35em] px-2 py-1 rounded-full border border-[#FFB347]/50 text-[#FFB347]');
		badge.textContent = label;
		appendChildren(row, [left, badge]);
		return row;
	};

	const renderCurrentMatch = (overview: LadderOverview): void => {
		const currentMatch = overview.currentMatch;
		currentMatchBody.innerHTML = '';

		if (!currentMatch) {
			currentMatchStatus.textContent = 'No match';
			currentMatchBody.appendChild(
				createPlaceholder('No active ranked match. Queue up to take the first game!'),
			);
			currentMatchActions.classList.add('hidden');
			matchCta.classList.add('hidden');
			activeMatchRef = null;
			return;
		}

		const viewerId = appState.getState().userId;
		const isChampion = viewerId === currentMatch.champion.userId;
		const isChallenger = viewerId === currentMatch.challenger.userId;
		const isParticipant = isChampion || isChallenger;

		const block = createCurrentMatchBlock(currentMatch);
		const statusLabel = block.querySelector<HTMLElement>('[data-current-match-status]');
		if (statusLabel) {
			currentMatchStatus.textContent = statusLabel.textContent ?? 'Holding queue';
			statusLabel.remove();
		} else {
			currentMatchStatus.textContent = 'Holding queue';
		}
		currentMatchBody.appendChild(block);

		if (isParticipant) {
			currentMatchActions.classList.remove('hidden');
			matchCta.classList.remove('hidden');
			matchCta.textContent = currentMatch.status === 'playing' ? 'Rejoin Match' : 'Enter Arena';
			const opponentId = isChampion ? currentMatch.challenger.userId : currentMatch.champion.userId;
			activeMatchRef = { matchId: currentMatch.matchId, opponentId };
		} else {
			currentMatchActions.classList.add('hidden');
			matchCta.classList.add('hidden');
			activeMatchRef = null;
		}
	};

	const refreshOverview = async (): Promise<void> => {
		const userId = appState.getState().userId;
		if (!userId) {
			showFeedback('Sign in to view ranked progress');
			return;
		}

		try {
			const overview = await getLadderOverview();
			updateOverview(overview);
			showFeedback(null);
		} catch (error) {
			console.error('[CompetitivePage] Failed to load overview', error);
			showFeedback(error instanceof Error ? error.message : 'Failed to load ladder overview');
		}
	};

matchCta.addEventListener('click', () => {
		if (!activeMatchRef) {
			return;
		}
		try {
			sessionStorage.setItem('currentMatchId', activeMatchRef.matchId);
			sessionStorage.setItem('currentOpponentId', activeMatchRef.opponentId);
		} catch {
			// ignore storage issues
		}
		void navigate('/arena');
	});

	void refreshOverview();

	const onLadderRefresh = () => {
		if (!document.body.contains(page)) {
			window.removeEventListener('ladder:refresh', onLadderRefresh);
			return;
		}
		void refreshOverview();
	};

	window.addEventListener('ladder:refresh', onLadderRefresh);

	return page;

	function createStatCard(label: string): { root: HTMLDivElement; value: HTMLDivElement } {
		const root = createDiv(
			'rounded-lg border border-[#00C8FF]/20 bg-[#0f1523]/90 px-4 py-3 text-center space-y-1',
		);
		const caption = createElement('p', 'text-[11px] uppercase tracking-[0.35em] text-[#8CA6BF]');
		caption.textContent = label;
		const value = createElement('p', 'text-2xl font-semibold text-[#E0E0E0]');
		value.textContent = '—';
		appendChildren(root, [caption, value]);
		return { root, value };
	}

	function createPlaceholder(message: string): HTMLDivElement {
		const placeholder = createDiv(
			'rounded-lg border border-dashed border-[#00C8FF]/20 bg-[#101726]/70 px-4 py-4 text-sm text-[#9AA8C7] text-center',
		);
		placeholder.textContent = message;
		return placeholder;
	}
}

function formatRelativeTime(timestamp: string): string {
	const now = new Date();
	const then = new Date(timestamp);
	const diffMs = now.getTime() - then.getTime();
	const diffMinutes = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMinutes / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffMinutes < 1) {
		return 'just now';
	}
	if (diffMinutes < 60) {
		return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
	}
	if (diffHours < 24) {
		return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
	}
	return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}
