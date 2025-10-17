import { config } from '@infra/config/env';
import { logger } from '@infra/observability/logger';

const DEFAULT_SCOPE = config.oauth.fortyTwo.defaultScope;

export interface OAuth42AuthorizationParams {
  state: string;
  codeChallenge: string;
  redirectUri?: string;
  scope?: string;
}

export interface OAuth42TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  created_at: number;
}

export interface OAuth42ProfileResponse {
  id: number;
  email: string | null;
  login: string;
  usual_full_name: string | null;
  displayname: string;
  image: {
    link: string | null;
  } | null;
}

export interface OAuth42Profile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

const toAbsoluteUrl = (base: string, path: string) => {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  const url = new URL(normalizedPath, normalizedBase);
  return url.toString();
};

export const buildAuthorizationUrl = ({
  state,
  codeChallenge,
  redirectUri,
  scope,
}: OAuth42AuthorizationParams): string => {
  const url = new URL(config.oauth.fortyTwo.authUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.oauth.fortyTwo.clientId);
  url.searchParams.set('redirect_uri', redirectUri ?? config.oauth.fortyTwo.redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', scope ?? DEFAULT_SCOPE);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return url.toString();
};

export const exchangeAuthorizationCode = async (
  code: string,
  codeVerifier: string,
  redirectUri?: string,
): Promise<OAuth42TokenResponse> => {
  const response = await fetch(config.oauth.fortyTwo.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: config.oauth.fortyTwo.clientId,
      client_secret: config.oauth.fortyTwo.clientSecret,
      code,
      redirect_uri: redirectUri ?? config.oauth.fortyTwo.redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '<unavailable>');
    logger.error({ status: response.status, body: errorBody }, '42 token exchange failed');
    throw new Error('Failed to exchange authorization code with 42 OAuth provider');
  }

  const payload = (await response.json()) as OAuth42TokenResponse;
  return payload;
};

export const fetchProfile = async (accessToken: string): Promise<OAuth42Profile> => {
  const profileUrl = toAbsoluteUrl(config.oauth.fortyTwo.apiBaseUrl, 'me');
  const response = await fetch(profileUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '<unavailable>');
    logger.error({ status: response.status, body: errorBody }, '42 profile fetch failed');
    throw new Error('Failed to fetch 42 profile');
  }

  const payload = (await response.json()) as OAuth42ProfileResponse;

  return {
    id: payload.id.toString(),
    email: payload.email ?? '',
    displayName: payload.displayname ?? payload.usual_full_name ?? payload.login,
    avatarUrl: payload.image?.link ?? undefined,
  };
};