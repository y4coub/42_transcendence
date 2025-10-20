import { z } from 'zod';
import { userAvatarUrlSchema } from '@users/schemas';

const displayNameSchema = z
  .string()
  .min(3, 'Display name must be at least 3 characters long.')
  .max(32, 'Display name must be at most 32 characters long.')
  .regex(/^[A-Za-z0-9 _\-]+$/, 'Display name may only contain letters, numbers, spaces, underscores, and hyphens.');

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long.')
  .max(128, 'Password must be at most 128 characters long.');

export const registerBodySchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  displayName: displayNameSchema,
});

export type RegisterBody = z.infer<typeof registerBodySchema>;

export const trustedDeviceAssertionSchema = z.object({
  deviceId: z.string().uuid(),
  token: z.string().min(1, 'Trusted device token is required.'),
});

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required.'),
  trustedDevice: trustedDeviceAssertionSchema.optional(),
});

export type LoginBody = z.infer<typeof loginBodySchema>;

export const loginChallengeBodySchema = z.object({
  challengeId: z.string().uuid(),
  challengeToken: z.string().min(1),
  code: z.string().min(1),
  rememberDevice: z.boolean().optional(),
  deviceName: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .optional(),
});

export type LoginChallengeBody = z.infer<typeof loginChallengeBodySchema>;

export const twoFactorChallengeResponseSchema = z.object({
  type: z.literal('challenge'),
  challengeId: z.string().uuid(),
  challengeToken: z.string().min(1),
  expiresAt: z.number().int().positive(),
});

export type TwoFactorChallengeResponse = z.infer<typeof twoFactorChallengeResponseSchema>;

export const trustedDeviceIssueSchema = z.object({
  deviceId: z.string().uuid(),
  token: z.string().min(1),
  expiresAt: z.number().int().positive(),
});

export type TrustedDeviceIssue = z.infer<typeof trustedDeviceIssueSchema>;

export const refreshTokenBodySchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required.'),
});

export type RefreshTokenBody = z.infer<typeof refreshTokenBodySchema>;

export const authTokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
});

export type AuthTokens = z.infer<typeof authTokensSchema>;

export const userProfileSchema = z.object({
  id: z.string().uuid(),
  displayName: displayNameSchema,
  avatarUrl: userAvatarUrlSchema.optional(),
  bio: z.string().max(280).optional(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;

export const currentUserResponseSchema = userProfileSchema.extend({
  email: z.string().email(),
  provider: z.enum(['local', '42']),
});

export type CurrentUserResponse = z.infer<typeof currentUserResponseSchema>;

export const oauth42StartQuerySchema = z.object({
  redirectUri: z.string().url().optional(),
});

export type Oauth42StartQuery = z.infer<typeof oauth42StartQuerySchema>;

export const oauth42CallbackQuerySchema = z.object({
  code: z.string().min(1, 'Authorization code is required.'),
  state: z.string().min(1, 'State is required.'),
});

export type Oauth42CallbackQuery = z.infer<typeof oauth42CallbackQuerySchema>;
