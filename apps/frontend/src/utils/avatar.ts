export const DEFAULT_AVATAR_URL = "/default_profile.png";

export const resolveAvatarUrl = (avatarUrl: string | null | undefined): string => {
  if (typeof avatarUrl !== "string") {
    return DEFAULT_AVATAR_URL;
  }

  const trimmed = avatarUrl.trim();
  if (!trimmed) {
    return DEFAULT_AVATAR_URL;
  }

  return trimmed;
};
