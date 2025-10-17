export async function run(ctx) {
	ctx.assert(ctx.state.user?.id, 'Auth suite must populate ctx.state.user');
	ctx.assert(ctx.state.tokens?.access, 'Auth suite must populate ctx.state.tokens');

	const userId = ctx.state.user.id;
	const token = ctx.state.tokens.access;

	await ctx.step('users', 'get-profile', async () => {
		const response = await ctx.request('GET', `/users/${userId}`, {
			token,
			expectedStatus: 200,
		});

		ctx.assert(response.data?.id === userId, 'User profile id mismatch');
		ctx.assert(typeof response.data?.displayName === 'string', 'Profile missing displayName');
	});

	await ctx.step('users', 'get-stats', async () => {
		const response = await ctx.request('GET', `/users/${userId}/stats`, {
			token,
			expectedStatus: 200,
		});

		const stats = response.data;
		ctx.assert(typeof stats?.wins === 'number', 'Stats missing wins');
		ctx.assert(typeof stats?.losses === 'number', 'Stats missing losses');
	});
}
