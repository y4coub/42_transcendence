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

	await ctx.step('auth', 'login-after-logout', async () => {
		const response = await ctx.request('POST', '/auth/login', {
			body: {
				email,
				password,
			},
			expectedStatus: 200,
		});

		ctx.state.tokens = {
			access: response.data.accessToken,
			refresh: response.data.refreshToken,
		};
	});
}
