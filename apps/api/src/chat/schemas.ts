import { z } from 'zod';

export const chatChannelIdSchema = z.string().uuid();

export const chatChannelSlugSchema = z
  .string()
  .min(3, 'Slug must be at least 3 characters long.')
  .max(40, 'Slug must be at most 40 characters long.')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must use lowercase letters, numbers, and hyphens.');

export const chatChannelTitleSchema = z
  .string()
  .min(3, 'Title must be at least 3 characters long.')
  .max(80, 'Title must be at most 80 characters long.');

export const chatChannelVisibilitySchema = z.enum(['public', 'private']);

export const chatChannelSchema = z.object({
  id: chatChannelIdSchema,
  slug: chatChannelSlugSchema,
  title: chatChannelTitleSchema,
  visibility: chatChannelVisibilitySchema,
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
});

export type ChatChannel = z.infer<typeof chatChannelSchema>;

export const chatChannelCreateSchema = z.object({
  title: chatChannelTitleSchema,
  visibility: chatChannelVisibilitySchema.default('public'),
  slug: chatChannelSlugSchema.optional(),
});

export type ChatChannelCreate = z.infer<typeof chatChannelCreateSchema>;

export const chatChannelUpdateSchema = z
  .object({
    title: chatChannelTitleSchema.optional(),
    visibility: chatChannelVisibilitySchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided to update a channel.',
  });

export type ChatChannelUpdate = z.infer<typeof chatChannelUpdateSchema>;

export const chatMembershipRoleSchema = z.enum(['member', 'admin']);

export const chatMembershipSchema = z.object({
  channelId: chatChannelIdSchema,
  userId: z.string().uuid(),
  role: chatMembershipRoleSchema,
  joinedAt: z.string().datetime(),
});

export type ChatMembership = z.infer<typeof chatMembershipSchema>;

export const chatMessageTypeSchema = z.enum(['channel', 'dm']);

export const chatMessageContentSchema = z
  .string()
  .min(1, 'Message content cannot be empty.')
  .max(2000, 'Message content must be at most 2000 characters.');

export const chatMessageSchema = z.object({
  id: z.string().uuid(),
  channelId: chatChannelIdSchema.nullable(),
  senderId: z.string().uuid(),
  content: chatMessageContentSchema,
  type: chatMessageTypeSchema,
  dmTargetId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatChannelMessageCreateSchema = z.object({
  content: chatMessageContentSchema,
});

export type ChatChannelMessageCreate = z.infer<typeof chatChannelMessageCreateSchema>;

export const chatDirectMessageCreateSchema = z.object({
  content: chatMessageContentSchema,
});

export type ChatDirectMessageCreate = z.infer<typeof chatDirectMessageCreateSchema>;

export const chatMessageQuerySchema = z.object({
  since: z.string().datetime().optional(),
  limit: z.number().int().positive().max(100).default(50),
});

export type ChatMessageQuery = z.infer<typeof chatMessageQuerySchema>;

export const chatBlockSchema = z.object({
  blockerId: z.string().uuid(),
  blockedId: z.string().uuid(),
  reason: z.string().max(280).optional(),
  createdAt: z.string().datetime(),
});

export type ChatBlock = z.infer<typeof chatBlockSchema>;

export const chatBlockCreateSchema = z.object({
  reason: z.string().max(280).optional(),
});

export type ChatBlockCreate = z.infer<typeof chatBlockCreateSchema>;
