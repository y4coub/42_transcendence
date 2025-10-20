import { authenticator } from 'otplib';

authenticator.options = {
	step: 30,
	window: 1,
};

export async function run(ctx) {
	const timestamp = Date.now();
	const email = `smoke+${timestamp}@example.com`;
	const password = 'SmokeTest!1234';
	const displayName = `Smoke ${timestamp}`;

	ctx.state.auth = {
		email,
		password,
		displayName,
	};
	ctx.state.twofa = {};

	await ctx.step('auth', 'register', async () => {
		const response = await ctx.request('POST', '/auth/register', {
			body: {
				email,
				password,
				displayName,
			},
			expectedStatus: 201,
		});

		ctx.assert(response.data?.accessToken, 'Register response missing accessToken');
		ctx.assert(response.data?.refreshToken, 'Register response missing refreshToken');
		ctx.state.tokens = {
			access: response.data.accessToken,
			refresh: response.data.refreshToken,
		};
	});

	await ctx.step('auth', 'login', async () => {
		const response = await ctx.request('POST', '/auth/login', {
			body: {
				email,
				password,
			},
			expectedStatus: 200,
		});

		ctx.assert(response.data?.accessToken, 'Login response missing accessToken');
		ctx.assert(response.data?.refreshToken, 'Login response missing refreshToken');
		ctx.state.tokens = {
			access: response.data.accessToken,
			refresh: response.data.refreshToken,
		};
	});

	await ctx.step('auth', 'current-user', async () => {
		const response = await ctx.request('GET', '/auth/me', {
			token: ctx.state.tokens.access,
			expectedStatus: 200,
		});

		ctx.assert(response.data?.id, 'Current user response missing id');
		ctx.assert(response.data?.email === email, 'Current user email mismatch');
		ctx.state.user = response.data;
	});

	await ctx.step('auth', 'twofa-status-initial', async () => {
		const response = await ctx.request('GET', '/auth/2fa/status', {
			token: ctx.state.tokens.access,
			expectedStatus: 200,
		});

		ctx.assert(response.data?.status === 'disabled', 'Expected 2FA to start disabled');
	});

	await ctx.step('auth', 'twofa-enroll-start', async () => {
		const response = await ctx.request('POST', '/auth/2fa/enroll/start', {
			token: ctx.state.tokens.access,
			expectedStatus: 200,
		});

		ctx.assert(response.data?.secret, 'Two-factor enrollment missing secret');
		ctx.assert(Array.isArray(response.data?.recoveryCodes), 'Two-factor enrollment missing recovery codes');
		ctx.assert(typeof response.data?.expiresAt === 'number', 'Two-factor enrollment missing expiresAt');
		ctx.state.twofa = {
			secret: response.data.secret,
			recoveryCodes: response.data.recoveryCodes,
			enrollmentExpiresAt: response.data.expiresAt,
		};
	});

	await ctx.step('auth', 'twofa-enroll-confirm', async () => {
		const secret = ctx.state.twofa.secret;
		ctx.assert(typeof secret === 'string', 'Two-factor secret missing from state');
		const code = authenticator.generate(secret);

		const response = await ctx.request('POST', '/auth/2fa/enroll/confirm', {
			token: ctx.state.tokens.access,
			body: { code },
			expectedStatus: 200,
		});

		ctx.assert(response.data?.status === 'active', 'Two-factor enrollment did not activate');
	});

	await ctx.step('auth', 'twofa-status-active', async () => {
		const response = await ctx.request('GET', '/auth/2fa/status', {
			token: ctx.state.tokens.access,
			expectedStatus: 200,
		});

		ctx.assert(response.data?.status === 'active', 'Two-factor status should be active');
	});

	await ctx.step('auth', 'refresh', async () => {
		const response = await ctx.request('POST', '/auth/token/refresh', {
			body: {
				refreshToken: ctx.state.tokens.refresh,
			},
			expectedStatus: 200,
		});

		ctx.assert(response.data?.accessToken, 'Refresh response missing accessToken');
		ctx.assert(response.data?.refreshToken, 'Refresh response missing refreshToken');
		ctx.assert(
			response.data.accessToken !== ctx.state.tokens.access,
			'Access token should rotate on refresh',
		);
		ctx.state.tokens = {
			access: response.data.accessToken,
			refresh: response.data.refreshToken,
		};
	});

	await ctx.step('auth', 'logout', async () => {
		await ctx.request('POST', '/auth/logout', {
			token: ctx.state.tokens.access,
			expectedStatus: 204,
			skipParse: true,
		});
	});

	await ctx.step('auth', 'post-logout-access-denied', async () => {
		const response = await ctx.request('GET', '/auth/me', {
			token: ctx.state.tokens.access,
		});

		ctx.assert(response.status === 401, `Expected 401 after logout, received ${response.status}`);
	});

	await ctx.step('auth', 'twofa-login-challenge', async () => {
		const response = await ctx.request('POST', '/auth/login', {
			body: {
				email,
				password,
			},
			expectedStatus: 202,
		});

		ctx.assert(response.data?.type === 'challenge', 'Expected two-factor challenge response');
		ctx.assert(response.data?.challengeId, 'Two-factor challenge missing id');
		ctx.assert(response.data?.challengeToken, 'Two-factor challenge missing token');
		ctx.state.twofa.challenge = {
			challengeId: response.data.challengeId,
			challengeToken: response.data.challengeToken,
		};
	});

	await ctx.step('auth', 'twofa-login-complete', async () => {
		const secret = ctx.state.twofa.secret;
		ctx.assert(typeof secret === 'string', 'Two-factor secret missing from state');
		const code = authenticator.generate(secret);
		const { challengeId, challengeToken } = ctx.state.twofa.challenge ?? {};
		ctx.assert(challengeId, 'Challenge ID missing from state');
		ctx.assert(challengeToken, 'Challenge token missing from state');

		const response = await ctx.request('POST', '/auth/login/challenge', {
			body: {
				challengeId,
				challengeToken,
				code,
				rememberDevice: true,
				deviceName: 'smoke-cli',
			},
			expectedStatus: 200,
		});

		ctx.assert(response.data?.accessToken, 'Two-factor challenge completion missing access token');
		ctx.assert(response.data?.refreshToken, 'Two-factor challenge completion missing refresh token');
		if (response.data?.trustedDevice) {
			ctx.state.twofa.trustedDevice = response.data.trustedDevice;
		}

		ctx.state.tokens = {
			access: response.data.accessToken,
			refresh: response.data.refreshToken,
		};
	});

	await ctx.step('auth', 'current-user-after-twofa', async () => {
		const response = await ctx.request('GET', '/auth/me', {
			token: ctx.state.tokens.access,
			expectedStatus: 200,
		});

		ctx.assert(response.data?.id === ctx.state.user?.id, 'Current user id mismatch after two-factor login');
		ctx.state.user = response.data;
	});

	await ctx.step('auth', 'twofa-trusted-devices', async () => {
		const response = await ctx.request('GET', '/auth/2fa/trusted-devices', {
			token: ctx.state.tokens.access,
			expectedStatus: 200,
		});

		ctx.assert(Array.isArray(response.data?.devices), 'Trusted devices response missing devices');
		ctx.assert(typeof response.data?.totalActive === 'number', 'Trusted devices response missing totalActive');
		if (ctx.state.twofa.trustedDevice) {
			ctx.assert(
				response.data.totalActive >= 1,
				'Expected remembered device to count toward active trusted devices',
			);
		}
	});
}
