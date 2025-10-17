export async function ensureSecondaryUser(ctx) {
	if (ctx.state.secondary?.user?.id) {
		return ctx.state.secondary;
	}

	const timestamp = Date.now();
	const email = `smoke-secondary+${timestamp}@example.com`;
	const password = 'SmokeTest!1234';
	const displayName = `Smoke Secondary ${timestamp}`;

	const registerResponse = await ctx.request('POST', '/auth/register', {
		body: { email, password, displayName },
		expectedStatus: 201,
	});

	ctx.assert(registerResponse.data?.accessToken, 'Secondary register missing access token');
	ctx.assert(registerResponse.data?.refreshToken, 'Secondary register missing refresh token');

	const tokens = {
		access: registerResponse.data.accessToken,
		refresh: registerResponse.data.refreshToken,
	};

	const profileResponse = await ctx.request('GET', '/auth/me', {
		token: tokens.access,
		expectedStatus: 200,
	});

	ctx.state.secondary = {
		email,
		password,
		tokens,
		user: profileResponse.data,
	};

	return ctx.state.secondary;
}
