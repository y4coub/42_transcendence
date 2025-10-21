import { createButton } from './dom';

export const DEFAULT_AVATAR_URL = '/default_profile.png';

export const resolveAvatarUrl = (avatarUrl: string | null | undefined): string => {
	if (typeof avatarUrl !== 'string') {
		return DEFAULT_AVATAR_URL;
	}

	const trimmed = avatarUrl.trim();
	if (!trimmed) {
		return DEFAULT_AVATAR_URL;
	}

	return trimmed;
};

type AvatarButtonOptions = {
	userId: string;
	displayName: string;
	avatarUrl?: string | null;
	sizeClass?: string;
	borderClass?: string;
	extraClassName?: string;
	onClick?: (userId: string) => void | Promise<unknown>;
};

export function createProfileAvatarButton({
	userId,
	displayName,
	avatarUrl,
	sizeClass = 'h-10 w-10',
	borderClass = 'border-[#00C8FF]/40',
	extraClassName = '',
	onClick,
}: AvatarButtonOptions): HTMLButtonElement {
	const button = createButton(
		'',
		[
			'inline-flex items-center justify-center rounded-full border bg-[#050814] text-sm font-semibold uppercase tracking-[0.28em] text-[#00C8FF] transition-colors hover:border-[#00C8FF]/60 focus:outline-none focus:ring-2 focus:ring-[#00C8FF]/60',
			sizeClass,
			borderClass,
			extraClassName,
		]
			.filter(Boolean)
			.join(' '),
		() => {
			if (onClick) {
				void onClick(userId);
			}
		},
	);

	button.setAttribute('aria-label', `View ${displayName}'s profile`);
	button.dataset.userId = userId;
	button.dataset.profileAvatar = 'true';

	const initials = displayName.trim().slice(0, 2).toUpperCase() || 'PL';
	const resolved = resolveAvatarUrl(avatarUrl ?? null);

	const img = document.createElement('img');
	img.src = resolved;
	img.alt = displayName;
	img.className = 'h-full w-full rounded-full object-cover';
	img.onerror = () => {
		img.remove();
		button.textContent = initials;
	};
	button.appendChild(img);

	return button;
}
