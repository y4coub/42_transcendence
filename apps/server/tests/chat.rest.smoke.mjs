import { ensureSecondaryUser } from './helpers/chat.mjs';

export async function run(ctx) {
	ctx.assert(ctx.state.tokens?.access, 'Auth tokens required before running chat smoke tests');
	const accessToken = ctx.state.tokens.access;

	await ctx.step('chat-rest', 'list-channels', async () => {
		const response = await ctx.request('GET', '/chat/channels', {
			token: accessToken,
			expectedStatus: 200,
		});

		ctx.assert(Array.isArray(response.data), 'Channels response must be an array');
		ctx.state.chat = ctx.state.chat ?? {};
		ctx.state.chat.availableChannels = response.data;
	});

	await ctx.step('chat-rest', 'create-channel-or-handle-restriction', async () => {
		const slug = `smoke-${Date.now()}`;
		const response = await ctx.request('POST', '/chat/channels', {
			token: accessToken,
			body: {
				title: `Smoke ${slug}`,
				slug,
				visibility: 'public',
			},
		});

		if (response.status === 201) {
			ctx.state.chat = ctx.state.chat ?? {};
			ctx.state.chat.channel = {
				slug: response.data.channel.slug,
				id: response.data.channel.id,
			};
			return;
		}

		ctx.assert(
			[403, 409].includes(response.status),
			`Expected 201/403/409 when creating channel, received ${response.status}`,
		);
	});

	await ctx.step('chat-rest', 'determine-channel', async () => {
		ctx.state.chat = ctx.state.chat ?? {};
		if (!ctx.state.chat.channel) {
			const fallbackSlug = ctx.env.TEST_CHANNEL ?? 'general';
			const preloaded = ctx.state.chat.availableChannels?.find((channel) => channel.slug === fallbackSlug);
			ctx.assert(preloaded, `Unable to locate fallback channel ${fallbackSlug}`);
			ctx.state.chat.channel = {
				slug: preloaded.slug,
				id: preloaded.id,
			};
		}
	});

	await ctx.step('chat-rest', 'join-channel', async () => {
		const { slug } = ctx.state.chat.channel;
		const response = await ctx.request('POST', `/chat/channels/${slug}/join`, {
			token: accessToken,
		});

		ctx.assert(
			[200, 409].includes(response.status) || response.status === 403,
			`Unexpected status when joining channel: ${response.status}`,
		);
	});

	await ctx.step('chat-rest', 'send-channel-message', async () => {
		const { slug } = ctx.state.chat.channel;
		const content = `Smoke channel ping ${Date.now()}`;
		const response = await ctx.request('POST', `/chat/channels/${slug}/messages`, {
			token: accessToken,
			body: { content },
			expectedStatus: 201,
		});

		ctx.state.chat.channelMessage = {
			id: response.data?.id,
			content,
			createdAt: response.data?.createdAt,
		};

		ctx.assert(ctx.state.chat.channelMessage.id, 'Channel message missing id');
	});

	await ctx.step('chat-rest', 'channel-history', async () => {
		const { slug } = ctx.state.chat.channel;
		const response = await ctx.request('GET', '/chat/history', {
			token: accessToken,
			expectedStatus: 200,
			query: { room: slug, limit: 10 },
		});

		ctx.assert(Array.isArray(response.data), 'Channel history must be an array');
		if (ctx.state.chat.channelMessage?.id) {
			const found = response.data.some((message) => message.id === ctx.state.chat.channelMessage.id);
			ctx.assert(found, 'Unable to locate recently sent channel message in history');
		}
	});

	await ctx.step('chat-rest', 'bootstrap-secondary-user', async () => {
		await ensureSecondaryUser(ctx);
		ctx.assert(ctx.state.secondary?.user?.id, 'Secondary user bootstrap failed');
	});

	await ctx.step('chat-rest', 'send-direct-message', async () => {
		const counterpartId = ctx.state.secondary.user.id;
		const content = `Smoke DM ping ${Date.now()}`;
		const response = await ctx.request('POST', `/chat/dm/${counterpartId}`, {
			token: accessToken,
			body: { content },
			expectedStatus: 201,
		});

		ctx.state.chat.directMessage = {
			id: response.data?.id,
			content,
			createdAt: response.data?.createdAt,
		};

		ctx.assert(ctx.state.chat.directMessage.id, 'Direct message missing id');
	});

	await ctx.step('chat-rest', 'list-direct-messages', async () => {
		const counterpartId = ctx.state.secondary.user.id;
		const response = await ctx.request('GET', `/chat/dm/${counterpartId}`, {
			token: accessToken,
			expectedStatus: 200,
		});

		ctx.assert(Array.isArray(response.data), 'DM history must be an array');
		if (ctx.state.chat.directMessage?.id) {
			const found = response.data.some((message) => message.id === ctx.state.chat.directMessage.id);
			ctx.assert(found, 'Unable to locate recently sent direct message in history');
		}
	});

	await ctx.step('chat-rest', 'block-user', async () => {
		const counterpartId = ctx.state.secondary.user.id;
		const response = await ctx.request('POST', `/chat/blocks/${counterpartId}`, {
			token: accessToken,
			body: { reason: 'smoke-test' },
		});

		ctx.assert(
			response.status === 200 || response.status === 409,
			`Unexpected status when blocking user: ${response.status}`,
		);
	});

	await ctx.step('chat-rest', 'verify-block-list', async () => {
		const response = await ctx.request('GET', '/chat/blocks', {
			token: accessToken,
			expectedStatus: 200,
		});

		ctx.assert(Array.isArray(response.data), 'Blocks list should be an array');
	});

	await ctx.step('chat-rest', 'unblock-user', async () => {
		const counterpartId = ctx.state.secondary.user.id;
		await ctx.request('DELETE', `/chat/blocks/${counterpartId}`, {
			token: accessToken,
			expectedStatus: 204,
			skipParse: true,
		});
	});
}
