export async function run(ctx) {
	await ctx.step('security', 'requires-auth-for-me', async () => {
		const response = await ctx.request('GET', '/auth/me');
		ctx.assert(response.status === 401, `Expected 401 for unauthenticated /auth/me, received ${response.status}`);
	});

	await ctx.step('security', 'rejects-invalid-refresh', async () => {
		const response = await ctx.request('POST', '/auth/token/refresh', {
			body: {
				refreshToken: 'not-a-real-token',
			},
		});

		ctx.assert(response.status === 401, `Expected 401 for invalid refresh token, received ${response.status}`);
	});
}
