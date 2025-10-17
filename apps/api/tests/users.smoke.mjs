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

		const profileId = response.data?.id ?? response.data?.userId;
		ctx.assert(profileId === userId, 'User profile id mismatch');
		ctx.assert(typeof response.data?.displayName === 'string', 'Profile missing displayName');
	});

	await ctx.step('users', 'update-profile', async () => {
		const baseDisplayName = ctx.state.auth?.displayName ?? 'Smoke User';
		const updatedDisplayName = `${baseDisplayName} Updated`;
		const avatarUrl = 'https://example.com/smoke-avatar.png';

		const response = await ctx.request('PATCH', `/users/${userId}`, {
			token,
			body: {
				displayName: updatedDisplayName,
				avatarUrl,
			},
			expectedStatus: 200,
		});

		ctx.assert(response.data?.displayName === updatedDisplayName, 'Profile update did not persist displayName');
		ctx.assert(response.data?.avatarUrl === avatarUrl, 'Profile update did not persist avatarUrl');
		const responseProfileId = response.data?.id ?? response.data?.userId;
		ctx.state.user = {
			...ctx.state.user,
			...response.data,
			id: ctx.state.user?.id ?? responseProfileId,
			userId: responseProfileId,
		};
	});

	await ctx.step('users', 'get-profile-updated', async () => {
		const response = await ctx.request('GET', `/users/${userId}`, {
			token,
			expectedStatus: 200,
		});

		ctx.assert(response.data?.displayName === ctx.state.user?.displayName, 'Updated profile displayName mismatch');
		ctx.assert(response.data?.avatarUrl === ctx.state.user?.avatarUrl, 'Updated profile avatarUrl mismatch');
	});

	await ctx.step('users', 'get-stats', async () => {
		const response = await ctx.request('GET', `/users/${userId}/stats`, {
			token,
			query: {
				refresh: true,
				limit: 5,
			},
			expectedStatus: 200,
		});

		const stats = response.data;
		ctx.assert(typeof stats?.wins === 'number', 'Stats missing wins');
		ctx.assert(typeof stats?.losses === 'number', 'Stats missing losses');
		ctx.assert(Array.isArray(stats?.recent), 'Stats missing recent activity');
		ctx.assert(stats.recent.length <= 5, 'Stats recent activity exceeded requested limit');
	});
}
