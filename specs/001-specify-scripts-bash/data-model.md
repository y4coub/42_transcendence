# Data Model — FT Backend Core Services

## UserAccount
- **Primary Key**: `id` (UUID)
- **Fields**:
  - `email` (unique, nullable for 42-only accounts)
  - `display_name`
  - `avatar_url`
  - `bio`
  - `credential_type` (`local` | `oauth42`)
  - `arg_hash` (Argon2id hash, local credentials only)
  - `oauth_provider_sub` (42 UID)
  - `two_factor_enabled` (boolean)
  - `created_at`, `updated_at`
- **Relationships**: Has many `SessionToken`, `ChatMembership`, `TournamentParticipant`, `MatchRecord`.
- **Validation**: Email format (if present), display name 3-32 chars, avatar URL HTTPS.

## SessionToken
- **Primary Key**: `id` (UUID)
- **Fields**: `user_id`, `token_type` (`access` | `refresh`), `expires_at`, `issued_at`, `revoked_at` (nullable), `metadata`
- **Relationships**: Belongs to `UserAccount`.
- **Validation**: Refresh rotation invalidates previous token; ensure `expires_at > issued_at`.

## ChatChannel
- **Primary Key**: `id` (UUID)
- **Fields**: `slug` (unique), `title`, `visibility` (`public` | `private`), `created_by`, `created_at`
- **Relationships**: Has many `ChatMembership`, `ChatMessage`.
- **Validation**: Slug lowercase alphanumeric + hyphen, visibility rules enforced when inviting.

## ChatMembership
- **Primary Key**: composite (`channel_id`, `user_id`)
- **Fields**: `role` (`member` | `admin`), `joined_at`
- **Relationships**: Links `UserAccount` and `ChatChannel`.
- **Validation**: Role transitions only by channel admin.

## ChatMessage
- **Primary Key**: `id` (UUID)
- **Fields**: `channel_id`, `sender_id`, `content`, `created_at`, `type` (`channel` | `dm`), `dm_target_id` (nullable)
- **Relationships**: Belongs to `ChatChannel` or represents DM between users.
- **Validation**: Content length ≤ 2,000 chars, sanitized markdown subset.

## BlockListEntry
- **Primary Key**: composite (`blocker_id`, `blocked_id`)
- **Fields**: `created_at`, `reason`
- **Relationships**: Ensures chat and invites enforce policy.
- **Validation**: Blocker cannot be same as blocked.

## Tournament
- **Primary Key**: `id` (UUID)
- **Fields**: `name`, `starts_at`, `status` (`draft` | `open` | `locked` | `in_progress` | `completed`), `max_players`, `created_by`
- **Relationships**: Has many `TournamentParticipant`, `MatchRecord`.
- **Validation**: `max_players` power-of-two check for bracket seeding.

## TournamentParticipant
- **Primary Key**: composite (`tournament_id`, `user_id`)
- **Fields**: `seed`, `joined_at`, `status` (`registered` | `checked_in` | `eliminated`)
- **Relationships**: Links players to tournaments.
- **Validation**: Seed unique per tournament, status transitions logged.

## MatchRecord
- **Primary Key**: `id` (UUID)
- **Fields**: `tournament_id` (nullable for matchmaking), `player_one_id`, `player_two_id`, `status` (`pending` | `live` | `reported`), `winner_id` (nullable), `created_at`, `updated_at`
- **Relationships**: Connects to Tournament when bracketed, references players.
- **Validation**: Winner must be one of the players when status `reported`.

## MatchQueueEntry
- **Primary Key**: `id` (UUID)
- **Fields**: `user_id`, `mode` (`ranked` | `casual`), `mmr_snapshot`, `queued_at`
- **Relationships**: Drives matchmaking pairing.
- **Validation**: One active queue entry per user per mode.

## PlayerProfile
- **Primary Key**: `user_id`
- **Fields**: `bio`, `country`, `preferred_role`, `wins`, `losses`, `current_streak`, `longest_streak`, `last_match_at`
- **Relationships**: Derived from match results.
- **Validation**: Numeric counters non-negative; streak resets on loss.

## RateLimitWindow
- **Primary Key**: composite (`scope`, `key`)
- **Fields**: `allowance`, `window_start`, `window_end`
- **Relationships**: None (operational control table).
- **Validation**: Enforce window_end > window_start.

## SchemaMigration
- **Primary Key**: `id` (integer autoincrement)
- **Fields**: `name`, `applied_at`
- **Relationships**: None.
- **Validation**: Name unique; ensures forward-only migrations.
