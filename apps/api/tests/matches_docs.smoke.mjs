export async function run(ctx) {
	ctx.assert(ctx.state.tokens?.access, 'Auth suite must provide access token');
	const token = ctx.state.tokens.access;

	ctx.state.tournament = ctx.state.tournament ?? {};

	await ctx.step('matches-docs', 'create-tournament', async () => {
		const name = `Smoke Cup ${Date.now()}`;
		const response = await ctx.request('POST', '/tournament/start', {
			body: { name },
			expectedStatus: 201,
		});

		ctx.state.tournament.id = response.data?.id;
		ctx.state.tournament.name = response.data?.name;
		ctx.assert(ctx.state.tournament.id, 'Tournament creation missing id');
	});

	await ctx.step('matches-docs', 'list-tournaments', async () => {
		const response = await ctx.request('GET', '/tournament', {
			expectedStatus: 200,
		});

		ctx.assert(Array.isArray(response.data), 'Tournament list should be an array');
		const found = response.data.some((tournament) => tournament.id === ctx.state.tournament.id);
		ctx.assert(found, 'Created tournament missing from listing');
	});

	await ctx.step('matches-docs', 'register-players', async () => {
		ctx.assert(ctx.state.tournament?.id, 'Tournament id missing');
		const tournamentId = ctx.state.tournament.id;
		const aliasBase = `smoke-player-${Date.now()}`;

		const playerOne = await ctx.request('POST', '/tournament/register', {
			body: {
				tournamentId,
				alias: `${aliasBase}-a`,
			},
			expectedStatus: 201,
		});

		const playerTwo = await ctx.request('POST', '/tournament/register', {
			body: {
				tournamentId,
				alias: `${aliasBase}-b`,
			},
			expectedStatus: 201,
		});

		ctx.state.tournament.players = {
			p1: playerOne.data,
			p2: playerTwo.data,
		};

		ctx.assert(ctx.state.tournament.players.p1?.id, 'Player one missing id');
		ctx.assert(ctx.state.tournament.players.p2?.id, 'Player two missing id');
	});

	await ctx.step('matches-docs', 'create-match', async () => {
		const tournamentId = ctx.state.tournament.id;
		const players = ctx.state.tournament.players;
		ctx.assert(players?.p1?.id && players?.p2?.id, 'Registered players missing for match creation');
		const { p1, p2 } = players;
		const response = await ctx.request('POST', '/matches', {
			token,
			body: {
				tournamentId,
				requesterId: p1.id,
				opponentId: p2.id,
			},
			expectedStatus: 201,
		});

		ctx.state.tournament.matchId = response.data?.matchId;
		ctx.assert(ctx.state.tournament.matchId, 'Match creation missing id');
	});

	await ctx.step('matches-docs', 'get-match-detail', async () => {
		const matchId = ctx.state.tournament.matchId;
		const response = await ctx.request('GET', `/matches/${matchId}`, {
			token,
			expectedStatus: 200,
		});

		ctx.state.tournament.matchDetail = response.data;
		ctx.assert(response.data?.matchId === matchId, 'Match detail id mismatch');
		ctx.assert(response.data?.participants?.p1?.playerId, 'Match detail missing participant info');
	});

	await ctx.step('matches-docs', 'record-match-result', async () => {
		const matchId = ctx.state.tournament.matchId;
		const players = ctx.state.tournament.players;
		ctx.assert(players?.p1?.id && players?.p2?.id, 'Registered players missing for match result');
		const { p1, p2 } = players;
		await ctx.request('PATCH', `/matches/${matchId}/result`, {
			token,
			expectedStatus: 200,
			body: {
				matchId,
				p1Score: 5,
				p2Score: 3,
				winnerId: p1.id,
			},
		});
	});

	await ctx.step('matches-docs', 'verify-match-updated', async () => {
		const matchId = ctx.state.tournament.matchId;
		const response = await ctx.request('GET', `/matches/${matchId}`, {
			token,
			expectedStatus: 200,
		});

		ctx.assert(response.data?.status === 'completed', 'Match status should be completed');
		const players = ctx.state.tournament.players;
		ctx.assert(players?.p1?.id, 'Player one missing during verification');
		ctx.assert(response.data?.lastScore?.winnerId === players.p1.id, 'Winner mismatch');
	});

	await ctx.step('matches-docs', 'tournament-board', async () => {
		const tournamentId = ctx.state.tournament.id;
		const response = await ctx.request('GET', '/tournament/board', {
			query: { tournamentId },
			expectedStatus: 200,
		});

		ctx.assert(Array.isArray(response.data), 'Tournament board response must be an array');
		const matchId = ctx.state.tournament.matchId;
		const found = response.data.some((entry) => entry.matchId === matchId);
		ctx.assert(found, 'Tournament board missing recorded match');
	});

	await ctx.step('matches-docs', 'openapi-json', async () => {
		const response = await ctx.request('GET', '/api/openapi.json', {
			expectedStatus: 200,
		});

		ctx.assert(response.headers['content-type']?.includes('application/json'), 'OpenAPI response should be JSON');
		ctx.assert(response.data?.openapi, 'OpenAPI document missing openapi field');
	});

	await ctx.step('matches-docs', 'docs-html', async () => {
		const response = await ctx.request('GET', '/docs', {
			expectedStatus: 200,
			skipParse: true,
		});

		ctx.assert(response.status === 200, 'Docs HTML should return 200');
		ctx.assert(response.headers['content-type']?.includes('text/html'), 'Docs response should be HTML');
	});
}
